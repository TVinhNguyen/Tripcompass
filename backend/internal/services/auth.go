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
	"unicode"
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
	facebookAppID     string
	facebookAppSecret string
	// Session projector — the single place that knows the
	// verified+suspended+admin rules. Login and social paths both call it,
	// which closed the previous "social login skipped suspended check" bug.
	sessions *session.Resolver
}

func NewAuthService(db *gorm.DB, jwtSecret string, jwtExpireHours int, emailSvc *EmailService, googleClientID, facebookAppID, facebookAppSecret string, sessions *session.Resolver) *AuthService {
	return &AuthService{
		db:                db,
		jwtSecret:         jwtSecret,
		jwtExpire:         jwtExpireHours,
		email:             emailSvc,
		googleClientID:    googleClientID,
		facebookAppID:     facebookAppID,
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
	Password string `json:"password"  binding:"required,min=8"`
	FullName string `json:"full_name" binding:"required"`
}

// verifyTokenTTL is short by design (F7): a 6-digit OTP must not stay guessable
// for long. 15 minutes is enough for a user to check their inbox.
const verifyTokenTTL = 15 * time.Minute

// maxVerifyAttempts is the per-account OTP guess budget (F7). After this many
// failures the current token is invalidated and the user must request a new code.
const maxVerifyAttempts = 5

// commonPasswords are the most frequent passwords from public breach corpora
// that still satisfy the length+complexity rules below (F5). Blocking them stops
// the easy credential-stuffing/spraying targets without shipping a multi-MB
// wordlist; layer a breached-password API (e.g. HIBP k-anonymity) on top later.
var commonPasswords = map[string]bool{
	"password1": true, "password12": true, "password123": true,
	"password1234": true, "qwerty123": true, "qwerty1234": true,
	"abc12345": true, "abcd1234": true, "1q2w3e4r": true,
	"1qaz2wsx": true, "admin123": true, "welcome1": true,
	"welcome123": true, "letmein1": true, "iloveyou1": true,
	"monkey123": true, "football1": true, "baseball1": true,
	"dragon123": true, "sunshine1": true, "princess1": true,
	"superman1": true, "trustno1": true, "passw0rd": true,
	"p@ssw0rd": true, "changeme1": true, "test1234": true,
}

// validatePassword enforces the F5 password policy shared across register /
// reset / change flows: at least 8 characters containing both a letter and a
// digit, and not a well-known common password. Returned as ErrInvalidInput so
// handlers map it to 400.
func validatePassword(pw string) error {
	if len(pw) < 8 {
		return fmt.Errorf("%w: password must be at least 8 characters", apperror.ErrInvalidInput)
	}
	var hasLetter, hasDigit bool
	for _, r := range pw {
		switch {
		case unicode.IsLetter(r):
			hasLetter = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return fmt.Errorf("%w: password must contain both letters and numbers", apperror.ErrInvalidInput)
	}
	// F5: reject the predictable passwords credential-stuffing tools try first.
	if commonPasswords[strings.ToLower(pw)] {
		return fmt.Errorf("%w: password is too common — choose a less predictable one", apperror.ErrInvalidInput)
	}
	return nil
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
	// F5: enforce the password policy server-side (binding only checks length).
	if err := validatePassword(input.Password); err != nil {
		return nil, err
	}
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
	// F7: the plaintext OTP is emailed to the user, but only its bcrypt hash is
	// persisted — a leaked DB never exposes a live verification code.
	verifyToken := generateOTP6()
	verifyHash, err := hashOTP(verifyToken)
	if err != nil {
		return nil, err
	}
	expiry := time.Now().Add(verifyTokenTTL) // F7: short 15-min window

	user := models.User{
		Email:                input.Email,
		PasswordHash:         &hashStr,
		FullName:             input.FullName,
		Provider:             "local",
		IsVerified:           false,
		VerifyToken:          &verifyHash,
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

	// F6: do NOT issue a JWT here. A newly-registered local account is still
	// unverified; returning a token would let it reach authenticated endpoints
	// before proving email ownership. The client redirects to the verify page
	// and obtains a session via /auth/login only after verification.
	return &AuthResponse{}, nil
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
	token, err := s.generateToken(u.ID, u.Email, u.TokenVersion)
	if err != nil {
		return nil, err
	}
	return &AuthResponse{Token: token, User: sess}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Verification
// ─────────────────────────────────────────────────────────────────────────────

// VerifyEmail consumes an OTP for the given email (F7). Verification is bound
// to the account (looked up by email) rather than searched globally by token,
// so the 6-digit space can't be brute-forced across all unverified users.
// A per-account attempt counter invalidates the OTP after maxVerifyAttempts
// failures, and the token is compared in constant time. All failures return
// the same generic message so the response never reveals which step failed.
func (s *AuthService) VerifyEmail(email, token string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || token == "" {
		return errors.New("email and verification code are required")
	}
	const generic = "invalid or expired verification code"

	var user models.User
	if err := s.db.Where("LOWER(email) = ?", email).First(&user).Error; err != nil {
		return errors.New(generic) // don't reveal whether the email exists
	}
	// F7: every failure path returns the SAME generic message so the response
	// never reveals whether the email exists, is already verified, is locked
	// out, or simply got the code wrong (no enumeration / state oracle).
	if user.IsVerified {
		return errors.New(generic)
	}
	// No active token, or expired window (F7: short TTL).
	if user.VerifyToken == nil || user.VerifyTokenExpiresAt == nil ||
		time.Now().After(*user.VerifyTokenExpiresAt) {
		return errors.New(generic)
	}
	// F7: lockout — too many failed guesses invalidates the token entirely.
	// The user must request a fresh code; the message stays generic.
	if user.VerifyAttempts >= maxVerifyAttempts {
		_ = s.db.Model(&user).Updates(map[string]interface{}{
			"verify_token":            nil,
			"verify_token_expires_at": nil,
		}).Error
		return errors.New(generic)
	}
	// F7: the DB stores only a bcrypt hash of the OTP; bcrypt's compare is
	// constant-time, so a wrong guess leaks no timing signal either.
	if bcrypt.CompareHashAndPassword([]byte(*user.VerifyToken), []byte(token)) != nil {
		s.db.Model(&user).UpdateColumn("verify_attempts", gorm.Expr("verify_attempts + 1"))
		return errors.New(generic)
	}

	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"is_verified":             true,
		"verify_token":            nil,
		"verify_token_expires_at": nil,
		"verify_attempts":         0,
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
	newHash, err := hashOTP(newToken) // F7: persist only the hash, email the plaintext
	if err != nil {
		return fmt.Errorf("failed to generate new token: %w", err)
	}
	newExpiry := time.Now().Add(verifyTokenTTL) // F7: short 15-min window
	if err := s.db.Model(&user).Updates(map[string]interface{}{
		"verify_token":            newHash,
		"verify_token_expires_at": newExpiry,
		"verify_attempts":         0, // F7: reset the lockout counter for the fresh code
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
	if err := validatePassword(newPassword); err != nil {
		return err
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
		// F9: invalidate every previously issued JWT — a password reset is a
		// recovery action, so old/stolen sessions must stop working.
		"token_version": gorm.Expr("token_version + 1"),
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

	// F8: only trust the email if Google itself confirms it is verified.
	// tokeninfo returns email_verified as the string "true"/"false". Without
	// this check a Google account with an unverified address could be linked
	// to (or take over) a local account that shares the same email.
	if !strings.EqualFold(info.EmailVerified, "true") {
		return nil, errors.New("Google email is not verified")
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
	if s.facebookAppID == "" || s.facebookAppSecret == "" {
		return nil, errors.New("Facebook login is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// F8: verify the token actually belongs to THIS app before trusting the
	// profile. Without debug_token, a valid Facebook token minted for any
	// other app could be replayed here. The app access token is "{id}|{secret}".
	debugUserID, err := s.verifyFacebookToken(ctx, accessToken)
	if err != nil {
		return nil, err
	}

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
	// F8: the profile returned by /me must belong to the same user the token
	// was minted for (defends against swapping the access token mid-flow).
	if info.ID != debugUserID {
		return nil, errors.New("Facebook token user mismatch")
	}

	avatarURL := info.Picture.Data.URL
	return s.findOrCreateSocialUser(info.Email, info.Name, avatarURL, "facebook", info.ID)
}

// fbDebugToken is the subset of GET /debug_token we care about (F8).
type fbDebugToken struct {
	Data struct {
		AppID   string `json:"app_id"`
		IsValid bool   `json:"is_valid"`
		UserID  string `json:"user_id"`
	} `json:"data"`
}

// verifyFacebookToken calls the Graph debug_token endpoint with the app access
// token ("{app_id}|{app_secret}") and confirms the supplied user token is valid
// AND was issued for THIS app. Returns the token's user_id for cross-checking
// against the /me profile. (Security F8.)
func (s *AuthService) verifyFacebookToken(ctx context.Context, userToken string) (string, error) {
	appToken := s.facebookAppID + "|" + s.facebookAppSecret
	endpoint := fmt.Sprintf(
		"https://graph.facebook.com/debug_token?input_token=%s&access_token=%s",
		url.QueryEscape(userToken), url.QueryEscape(appToken),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("failed to build FB debug_token request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to call Facebook debug_token: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", errors.New("invalid Facebook access token")
	}
	body, _ := io.ReadAll(resp.Body)
	var dbg fbDebugToken
	if err := json.Unmarshal(body, &dbg); err != nil {
		return "", errors.New("failed to parse Facebook debug_token response")
	}
	if !dbg.Data.IsValid {
		return "", errors.New("Facebook token is not valid")
	}
	if dbg.Data.AppID != s.facebookAppID {
		return "", errors.New("Facebook token app_id mismatch")
	}
	if dbg.Data.UserID == "" {
		return "", errors.New("Facebook token missing user_id")
	}
	return dbg.Data.UserID, nil
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

// RevokeTokens bumps the user's token_version, instantly invalidating every
// JWT issued before now (F9). Used by logout for true server-side session
// termination. Note: this is a global revoke — all of the user's active
// sessions are logged out, not just the current device.
func (s *AuthService) RevokeTokens(userID string) error {
	return s.db.Model(&models.User{}).Where("id = ?", userID).
		UpdateColumn("token_version", gorm.Expr("token_version + 1")).Error
}

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────

func (s *AuthService) generateToken(userID uuid.UUID, email string, tokenVersion int) (string, error) {
	claims := jwt.MapClaims{
		"sub":   userID.String(),
		"email": email,
		"tv":    tokenVersion, // F9: revocation epoch — bumped on logout/password change
		"exp":   time.Now().Add(time.Duration(s.jwtExpire) * time.Hour).Unix(),
		"iat":   time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

// hashOTP returns a bcrypt hash of the verification OTP. The DB stores only the
// hash (F7) — the plaintext code is emailed to the user, and verification
// re-hashes their input to compare. A leaked DB therefore never exposes a live
// OTP, and the 15-minute TTL + per-account lockout cap online guessing.
func hashOTP(otp string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(otp), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
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
