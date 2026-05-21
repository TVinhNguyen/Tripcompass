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
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"
	"tripcompass-backend/internal/session"

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
	collab    *CollaboratorService // optional; used to link pending invites on register
	// OAuth config
	googleClientID    string
	facebookAppSecret string
	// Session projector — the single place that knows the
	// verified+suspended+admin rules. Login and social paths both call it,
	// which closed the previous "social login skipped suspended check" bug.
	sessions *session.Resolver
}

func NewAuthService(db *gorm.DB, jwtSecret string, jwtExpireHours int, emailSvc *EmailService, googleClientID, facebookAppSecret string, sessions *session.Resolver) *AuthService {
	return &AuthService{
		db:                db,
		jwtSecret:         jwtSecret,
		jwtExpire:         jwtExpireHours,
		email:             emailSvc,
		googleClientID:    googleClientID,
		facebookAppSecret: facebookAppSecret,
		sessions:          sessions,
	}
}

// WithCollaboratorService injects the collaborator service so Register can
// claim any pending-by-email invites that match the new user's address.
// Returned so the call can chain in router wiring.
func (s *AuthService) WithCollaboratorService(c *CollaboratorService) *AuthService {
	s.collab = c
	return s
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
	Token string           `json:"token"`
	User  *session.Session `json:"user"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────────────────────

func (s *AuthService) Register(input RegisterInput) (*AuthResponse, error) {
	// Check email uniqueness — if email exists, return success to prevent enumeration.
	// Send a notification email to the existing account instead.
	var existing models.User
	if err := s.db.Where("email = ?", input.Email).First(&existing).Error; err == nil {
		slog.Info("registration requested for existing email; sending duplicate registration notice", "email", input.Email)
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
				_ = emailSvc.SendDuplicateRegistrationNotice(addr, name)
			}()
		}
		return &AuthResponse{}, nil // B1: no Token, no User — caller cannot distinguish
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	hashStr := string(hash)
	verifyToken := generateOTP6()
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

	// Create the user and claim any pending invites in a single Tx so the
	// outbox enqueues from LinkPendingInvites commit atomically with the new
	// row. Falling back to the direct-publish path would still ship the
	// event but lose at-least-once safety on a crash.
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		if s.collab != nil {
			linked, err := s.collab.LinkPendingInvites(tx, user.ID, user.Email)
			if err != nil {
				// Don't fail registration on notification plumbing — log
				// loudly and continue. The invites are still in the DB.
				slog.Warn("link pending invites failed", "user_id", user.ID, "err", err)
			} else if linked > 0 {
				slog.Info("linked pending invites", "user_id", user.ID, "count", linked)
			}
		}
		return nil
	}); err != nil {
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

	return s.issue(&user)
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

	// Local-password login requires a verified email. Social login skips
	// this — Google/Facebook already verified the address out-of-band.
	if !user.IsVerified {
		return nil, fmt.Errorf("%w: email not verified", apperror.ErrUnauthorized)
	}
	return s.issue(&user)
}

// issue projects the user into a Session (applying the suspension rule
// owned by the resolver) and mints a JWT. Returns an ErrUnauthorized wrap
// so handlers map to 401/403 uniformly.
//
// This is the seam that closed the "social login skipped suspended check"
// bug — every code path that wants to hand out a token funnels here.
// Verification (if applicable) is the caller's responsibility — Login
// applies it; Register intentionally skips it because it returns a
// preliminary AuthResponse for the still-unverified account.
func (s *AuthService) issue(u *models.User) (*AuthResponse, error) {
	sess, err := s.sessions.FromUser(u)
	if err != nil {
		if err == session.ErrUserSuspended {
			return nil, fmt.Errorf("%w: account suspended", apperror.ErrUnauthorized)
		}
		return nil, apperror.ErrUnauthorized
	}
	token, err := s.generateToken(u.ID, u.Email)
	if err != nil {
		return nil, err
	}
	return &AuthResponse{Token: token, User: sess}, nil
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
		"is_verified":             true,
		"verify_token":            nil,
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

	newToken := generateOTP6()
	newExpiry := time.Now().Add(24 * time.Hour) // C6: refresh expiry window
	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"verify_token":            newToken,
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
// Password Reset
// ─────────────────────────────────────────────────────────────────────────────

// resetTokenTTL is short by design — links e-mailed to an inbox shouldn't
// stay live for days. The frontend tells the user "valid for 1 hour".
const resetTokenTTL = 1 * time.Hour

// generateResetToken returns a URL-safe 64-character hex token (32 random
// bytes). Reset tokens are never typed by humans, so we prefer entropy over
// readability — opposite of the 6-digit verify OTP.
func generateResetToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// RequestPasswordReset issues a one-shot reset link for the given email and
// sends it via EmailService. Always returns nil to the caller — leaking
// whether an email exists would let attackers enumerate accounts.
//
// Works for OAuth-only accounts too: a Google-signup user can request a
// reset to set a password and gain a second login path. We don't change
// `provider` — the social link remains valid.
func (s *AuthService) RequestPasswordReset(email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return nil
	}
	var user models.User
	if err := s.db.Where("LOWER(email) = ?", email).First(&user).Error; err != nil {
		// Generic success — don't reveal whether the email is registered.
		return nil
	}
	if !user.IsVerified {
		// Unverified accounts must finish verification first; otherwise an
		// attacker who registered the address could lock out the real owner.
		slog.Info("reset requested for unverified account", "email", email)
		return nil
	}
	if user.Status == models.UserStatusSuspended {
		slog.Info("reset requested for suspended account", "email", email)
		return nil
	}

	token, err := generateResetToken()
	if err != nil {
		return fmt.Errorf("failed to generate reset token: %w", err)
	}
	expiry := time.Now().Add(resetTokenTTL)

	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"reset_token":            token,
		"reset_token_expires_at": expiry,
	}).Error; err != nil {
		return fmt.Errorf("failed to persist reset token: %w", err)
	}

	if s.email != nil {
		// Fire-and-forget like the verification path — caller already paid
		// the rate-limit cost; a slow SMTP shouldn't block the response.
		emailSvc := s.email
		go func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Warn("[email] panic sending password reset", "err", r)
				}
			}()
			if err := emailSvc.SendPasswordResetEmail(user.Email, user.FullName, token); err != nil {
				slog.Warn("failed to send password reset email", "email", user.Email, "err", err)
			}
		}()
	}
	return nil
}

// ResetPassword consumes a one-shot reset token, sets the new password, and
// clears the token. The user can immediately log in with the new password.
// For OAuth-only accounts this is also the path to set a first-time password
// — provider is left alone so existing social login keeps working.
func (s *AuthService) ResetPassword(token, newPassword string) error {
	if token == "" {
		return fmt.Errorf("%w: token is required", apperror.ErrInvalidInput)
	}
	if len(newPassword) < 6 {
		return fmt.Errorf("%w: password must be at least 6 characters", apperror.ErrInvalidInput)
	}

	var user models.User
	if err := s.db.Where("reset_token = ?", token).First(&user).Error; err != nil {
		return fmt.Errorf("%w: invalid or expired reset link", apperror.ErrInvalidInput)
	}
	if user.ResetTokenExpiresAt == nil || time.Now().After(*user.ResetTokenExpiresAt) {
		return fmt.Errorf("%w: reset link has expired — please request a new one", apperror.ErrInvalidInput)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	hashStr := string(hash)

	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"password_hash":          &hashStr,
		"reset_token":            nil,
		"reset_token_expires_at": nil,
	}).Error; err != nil {
		return fmt.Errorf("failed to update password: %w", err)
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

// findOrCreateSocialUser links a social login to an existing account by email,
// or creates a new account if none exists. Existing local accounts keep their
// password_hash and original provider — Google login becomes an additional
// way in, not a replacement.
func (s *AuthService) findOrCreateSocialUser(email, name, avatarURL, provider, providerID string) (*AuthResponse, error) {
	av := avatarURL

	var user models.User
	err := s.db.Where("email = ?", email).First(&user).Error
	switch {
	case err == nil:
		// Existing account — refresh avatar + verification, preserve password/provider.
		// Also defensively run LinkPendingInvites: covers rare cases where a
		// pending-by-email row survives past the original Register Tx (e.g.
		// notification publish failed mid-Register). Idempotent.
		user.AvatarURL = &av
		user.IsVerified = true
		if err := s.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Save(&user).Error; err != nil {
				return err
			}
			if s.collab != nil {
				if _, err := s.collab.LinkPendingInvites(tx, user.ID, user.Email); err != nil {
					slog.Warn("link pending invites failed (social login, existing user)", "user_id", user.ID, "err", err)
				}
			}
			return nil
		}); err != nil {
			return nil, fmt.Errorf("failed to update social user: %w", err)
		}
	case errors.Is(err, gorm.ErrRecordNotFound):
		user = models.User{
			Email:      email,
			FullName:   name,
			AvatarURL:  &av,
			Provider:   provider,
			IsVerified: true,
		}
		// Mirror Register: create user + claim pending-by-email invites in one Tx
		// so a social-login signup attaches existing PENDING collaborator rows to
		// the new user_id. Without this, invites sent before signup keep
		// user_id=NULL and Accept returns 403.
		if err := s.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
			if s.collab != nil {
				if _, err := s.collab.LinkPendingInvites(tx, user.ID, user.Email); err != nil {
					slog.Warn("link pending invites failed (social signup)", "user_id", user.ID, "err", err)
				}
			}
			return nil
		}); err != nil {
			return nil, fmt.Errorf("failed to create social user: %w", err)
		}
	default:
		return nil, fmt.Errorf("failed to lookup user: %w", err)
	}

	// Funnel through issue() so the suspended check applies to social paths
	// too — this was the bug class the reviewer flagged (local Login had
	// the gate, Google/Facebook minted a token even for suspended accounts).
	return s.issue(&user)
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

// generateOTP6 returns a cryptographically random 6-digit numeric string (000000–999999).
// Matches the frontend 6-box OTP input UI.
func generateOTP6() string {
	max := big.NewInt(1_000_000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		panic("crypto/rand is unavailable: " + err.Error())
	}
	return fmt.Sprintf("%06d", n.Int64())
}
