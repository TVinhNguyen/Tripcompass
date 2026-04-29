package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
	"tripcompass-backend/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
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

func NewAuthService(db *gorm.DB, jwtSecret string, emailSvc *EmailService, googleClientID, facebookAppSecret string) *AuthService {
	expire := 72
	if e := os.Getenv("JWT_EXPIRE_HOURS"); e != "" {
		if v, err := strconv.Atoi(e); err == nil {
			expire = v
		}
	}
	return &AuthService{
		db:                db,
		jwtSecret:         jwtSecret,
		jwtExpire:         expire,
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
		if s.email != nil {
			emailSvc := s.email
			go func() {
				_ = emailSvc.SendVerificationEmail(existing.Email, existing.FullName, "")
			}()
		}
		// Return a fake token-less response so caller can't distinguish from success
		return &AuthResponse{Token: "", User: existing}, nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	hashStr := string(hash)
	verifyToken := generateToken32()

	user := models.User{
		Email:        input.Email,
		PasswordHash: &hashStr,
		FullName:     input.FullName,
		Provider:     "local",
		IsVerified:   false,
		VerifyToken:  &verifyToken,
	}

	if err := s.db.Create(&user).Error; err != nil {
		return nil, err
	}

	// Send verification email asynchronously — don't block registration response
	if s.email != nil {
		emailSvc := s.email
		go func() {
			if err := emailSvc.SendVerificationEmail(user.Email, user.FullName, verifyToken); err != nil {
				log.Printf("[WARN] Failed to send verification email to %s: %v", user.Email, err)
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
		return nil, errors.New("invalid email or password")
	}

	if user.PasswordHash == nil {
		return nil, errors.New("this account uses social login")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, errors.New("invalid email or password")
	}

	if !user.IsVerified {
		return nil, errors.New("please verify your email before logging in")
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

	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"is_verified":  true,
		"verify_token": nil,
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
	if err := s.db.Model(&user).Update("verify_token", newToken).Error; err != nil {
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

// findOrCreateSocialUser upserts a user for social login.
// Uses INSERT ... ON CONFLICT to handle concurrent first-login races atomically.
func (s *AuthService) findOrCreateSocialUser(email, name, avatarURL, provider, providerID string) (*AuthResponse, error) {
	av := avatarURL
	user := models.User{
		Email:      email,
		FullName:   name,
		AvatarURL:  &av,
		Provider:   provider,
		IsVerified: true, // social login users are considered verified
	}

	// ON CONFLICT (email): update avatar and mark verified; do not overwrite password or provider
	result := s.db.Where(models.User{Email: email}).
		Attrs(models.User{
			FullName:   name,
			AvatarURL:  &av,
			Provider:   provider,
			IsVerified: true,
		}).
		FirstOrCreate(&user)
	if result.Error != nil {
		return nil, fmt.Errorf("failed to upsert social user: %w", result.Error)
	}

	// Update avatar if it changed (for existing users)
	if result.RowsAffected == 0 && avatarURL != "" && (user.AvatarURL == nil || *user.AvatarURL != avatarURL) {
		s.db.Model(&user).Updates(map[string]interface{}{
			"avatar_url":  avatarURL,
			"is_verified": true,
		})
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
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
