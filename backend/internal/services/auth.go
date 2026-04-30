package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ─────────────────────────────────────────────────────────────────────────────
// AuthService
// ─────────────────────────────────────────────────────────────────────────────

type AuthService struct {
	db        *gorm.DB
	jwtSecret string
	jwtExpire int // hours
	email     *EmailService
	// OAuth config
	googleClientID    string
	facebookAppSecret string
}

func NewAuthService(db *gorm.DB, jwtSecret string, jwtExpireHours int, emailSvc *EmailService, googleClientID, facebookAppSecret string) *AuthService {
	return &AuthService{
		db:                db,
		jwtSecret:         jwtSecret,
		jwtExpire:         jwtExpireHours,
		email:             emailSvc,
		googleClientID:    googleClientID,
		facebookAppSecret: facebookAppSecret,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

type RegisterInput struct {
	Email    string `json:"email"     binding:"required,email"`
	Password string `json:"password"  binding:"required,min=6"`
	FullName string `json:"full_name" binding:"required"`
}

type LoginInput struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type AuthResponse struct {
	Token string      `json:"token"`
	User  models.User `json:"user"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────────────────────

func (s *AuthService) Register(input RegisterInput) (*AuthResponse, error) {
	// Check email uniqueness — if email exists, return success to prevent enumeration.
	// Send a notification email to the existing account instead.
	var existing models.User
	if err := s.db.Where("email = ?", input.Email).First(&existing).Error; err == nil {
		// Email already registered — fire a notification async but return an empty
		// success response so callers cannot enumerate existing accounts or extract PII.
		if s.email != nil {
			emailSvc := s.email
			name := existing.FullName
			addr := existing.Email
			go func() {
				defer func() {
					if r := recover(); r != nil {
						slog.Warn("[email] panic sending duplicate-registration notice", "err", r)
					}
				}()
				_ = emailSvc.SendVerificationEmail(addr, name, "")
			}()
		}
		return &AuthResponse{}, nil // B1: no Token, no User — caller cannot distinguish
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	hashStr := string(hash)
	verifyToken := generateToken32()
	expiry := time.Now().Add(24 * time.Hour) // C6: tokens expire in 24h

	user := models.User{
		Email:                input.Email,
		PasswordHash:         &hashStr,
		FullName:             input.FullName,
		Provider:             "local",
		IsVerified:           false,
		VerifyToken:          &verifyToken,
		VerifyTokenExpiresAt: &expiry,
	}

	if err := s.db.Create(&user).Error; err != nil {
		return nil, err
	}

	// Send verification email asynchronously — don't block registration response
	if s.email != nil {
		emailSvc := s.email
		emailAddr, fullName, tok := user.Email, user.FullName, verifyToken
		go func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Warn("[email] panic sending verification email", "err", r)
				}
			}()
			if err := emailSvc.SendVerificationEmail(emailAddr, fullName, tok); err != nil {
				slog.Warn("failed to send verification email", "email", emailAddr, "err", err)
			}
		}()
	}

	token, err := s.generateToken(user.ID, user.Email)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{Token: token, User: user}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

func (s *AuthService) Login(input LoginInput) (*AuthResponse, error) {
	var user models.User
	if err := s.db.Where("email = ?", input.Email).First(&user).Error; err != nil {
		return nil, apperror.ErrUnauthorized
	}

	if user.PasswordHash == nil {
		// Social-login account — log internally for audit but return generic error
		slog.Info("login attempt on social account", "email", input.Email)
		return nil, apperror.ErrUnauthorized
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, apperror.ErrUnauthorized
	}

	if !user.IsVerified {
		// Return a specific sentinel so the handler can give a helpful (but not PII-leaking) message
		return nil, fmt.Errorf("%w: email not verified", apperror.ErrUnauthorized)
	}

	token, err := s.generateToken(user.ID, user.Email)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{Token: token, User: user}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Verification
// ─────────────────────────────────────────────────────────────────────────────

func (s *AuthService) VerifyEmail(token string) error {
	if token == "" {
		return errors.New("token is required")
	}

	var user models.User
	if err := s.db.Where("verify_token = ?", token).First(&user).Error; err != nil {
		return errors.New("invalid or expired verification token")
	}

	if user.IsVerified {
		return errors.New("email already verified")
	}

	// C6: reject tokens past their expiry window
	if user.VerifyTokenExpiresAt != nil && time.Now().After(*user.VerifyTokenExpiresAt) {
		return errors.New("verification token has expired — please request a new one")
	}

	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"is_verified":              true,
		"verify_token":             nil,
		"verify_token_expires_at": nil,
	}).Error; err != nil {
		return fmt.Errorf("verification failed: %w", err)
	}

	return nil
}

func (s *AuthService) ResendVerification(email string) error {
	if email == "" {
		return errors.New("email is required")
	}

	var user models.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		// Return generic message to prevent email enumeration
		return nil
	}

	if user.IsVerified {
		return errors.New("email already verified")
	}

	newToken := generateToken32()
	newExpiry := time.Now().Add(24 * time.Hour) // C6: refresh expiry window
	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"verify_token":             newToken,
		"verify_token_expires_at": newExpiry,
	}).Error; err != nil {
		return fmt.Errorf("failed to generate new token: %w", err)
	}

	if s.email != nil {
		_ = s.email.SendVerificationEmail(user.Email, user.FullName, newToken)
	}

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Login
// ─────────────────────────────────────────────────────────────────────────────

type googleTokenInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	Aud           string `json:"aud"`
}

func (s *AuthService) GoogleLogin(idToken string) (*AuthResponse, error) {
	if s.googleClientID == "" {
		return nil, errors.New("Google login is not configured")
	}

	// Verify token via POST (keeps id_token out of URL/logs)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	body := strings.NewReader("id_token=" + url.QueryEscape(idToken))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/tokeninfo", body)
	if err != nil {
		return nil, fmt.Errorf("failed to build Google tokeninfo request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to verify Google token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("invalid Google token")
	}

	respBody, _ := io.ReadAll(resp.Body)
	var info googleTokenInfo
	if err := json.Unmarshal(respBody, &info); err != nil {
		return nil, errors.New("failed to parse Google token info")
	}

	// Always validate audience
	if info.Aud != s.googleClientID {
		return nil, errors.New("Google token audience mismatch")
	}

	if info.Email == "" {
		return nil, errors.New("Google token missing email")
	}

	return s.findOrCreateSocialUser(info.Email, info.Name, info.Picture, "google", info.Sub)
}

// ─────────────────────────────────────────────────────────────────────────────
// Facebook Login
// ─────────────────────────────────────────────────────────────────────────────

type fbUserInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	Picture struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	} `json:"picture"`
}

func (s *AuthService) FacebookLogin(accessToken string) (*AuthResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	url := fmt.Sprintf(
		"https://graph.facebook.com/me?fields=id,name,email,picture&access_token=%s",
		accessToken,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build FB request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call Facebook API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("invalid Facebook access token")
	}

	body, _ := io.ReadAll(resp.Body)
	var info fbUserInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, errors.New("failed to parse Facebook user info")
	}

	if info.Email == "" {
		return nil, errors.New("Facebook account has no email (user may not have granted email permission)")
	}

	avatarURL := info.Picture.Data.URL
	return s.findOrCreateSocialUser(info.Email, info.Name, avatarURL, "facebook", info.ID)
}

// findOrCreateSocialUser atomically upserts a social-login user.
// Uses INSERT ... ON CONFLICT (email) DO UPDATE — concurrent first-logins
// with the same email result in exactly one row (the second request updates
// avatar_url + is_verified rather than inserting a duplicate or returning an error).
func (s *AuthService) findOrCreateSocialUser(email, name, avatarURL, provider, providerID string) (*AuthResponse, error) {
	av := avatarURL
	user := models.User{
		Email:      email,
		FullName:   name,
		AvatarURL:  &av,
		Provider:   provider,
		IsVerified: true,
	}

	// INSERT ... ON CONFLICT (email) DO UPDATE avatar_url + is_verified.
	// Does NOT overwrite PasswordHash or Provider so existing local accounts keep their credentials.
	result := s.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "email"}},
		DoUpdates: clause.AssignmentColumns([]string{"avatar_url", "is_verified"}),
	}).Create(&user)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to upsert social user: %w", result.Error)
	}

	// Re-fetch after upsert so user.ID is populated (Create sets ID on insert;
	// on conflict the original row's ID is returned via Returning or re-query).
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch upserted user: %w", err)
	}

	token, err := s.generateToken(user.ID, user.Email)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{Token: token, User: user}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// User lookup
// ─────────────────────────────────────────────────────────────────────────────

func (s *AuthService) GetByID(id string) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, "id = ?", id).Error; err != nil {
		return nil, errors.New("user not found")
	}
	return &user, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────

func (s *AuthService) generateToken(userID uuid.UUID, email string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   userID.String(),
		"email": email,
		"exp":   time.Now().Add(time.Duration(s.jwtExpire) * time.Hour).Unix(),
		"iat":   time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

func generateToken32() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failure is catastrophic — an all-zero token would be a silent security hole.
		panic("crypto/rand is unavailable: " + err.Error())
	}
	return hex.EncodeToString(b)
}
