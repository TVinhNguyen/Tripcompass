package services

import (
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"
	"tripcompass-backend/internal/session"
)

const testJWTSecret = "test-secret-key"

func TestAuthService_Register(t *testing.T) {
	db := setupTestDB(t)
	svc := NewAuthService(db, testJWTSecret, 72, nil, "", "", "", session.New(db, testJWTSecret, ""))

	t.Run("success", func(t *testing.T) {
		input := RegisterInput{
			Email:    "newuser@example.com",
			Password: "Tr1pCompass9", // valid: 8+, letters+digits, not a common password
			FullName: "New User",
		}
		resp, err := svc.Register(input)
		require.NoError(t, err)
		// F6: Register must NOT issue a token — the account stays unverified
		// until the email OTP is confirmed, after which the user logs in.
		assert.Empty(t, resp.Token)
		assert.Nil(t, resp.User)

		// User row is created (unverified) with a correct bcrypt hash.
		var stored struct {
			PasswordHash *string
			IsVerified   bool
		}
		db.Table("users").Select("password_hash, is_verified").Where("email = ?", "newuser@example.com").Scan(&stored)
		require.NotNil(t, stored.PasswordHash)
		assert.False(t, stored.IsVerified)
		err = bcrypt.CompareHashAndPassword([]byte(*stored.PasswordHash), []byte("Tr1pCompass9"))
		assert.NoError(t, err)
	})

	t.Run("duplicate email", func(t *testing.T) {
		// B1 anti-enumeration: Register with an existing email returns an empty
		// success response (no error, no token, no user) so callers cannot
		// distinguish registered vs unregistered emails.
		_ = createTestUser(t, db)
		input := RegisterInput{
			Email:    "test@example.com",
			Password: "Tr1pCompass9", // valid policy-wise so we reach the dup-email path
			FullName: "Duplicate",
		}
		resp, err := svc.Register(input)
		assert.NoError(t, err)        // no error — prevents enumeration
		require.NotNil(t, resp)       // returns empty response, not nil
		assert.Empty(t, resp.Token)   // no token leaked
		// resp.User is *session.Session — nil on the dup-email path so the
		// frontend can't read the existing account's name/email back.
		assert.Nil(t, resp.User)
	})
}

func TestAuthService_Login(t *testing.T) {
	db := setupTestDB(t)
	svc := NewAuthService(db, testJWTSecret, 72, nil, "", "", "", session.New(db, testJWTSecret, ""))
	user := createTestUser(t, db)
	// Mark user as verified so login works
	db.Exec("UPDATE users SET is_verified = true WHERE id = ?", user.ID)

	t.Run("success", func(t *testing.T) {
		input := LoginInput{
			Email:    user.Email,
			Password: "password123",
		}
		resp, err := svc.Login(input)
		require.NoError(t, err)
		assert.NotEmpty(t, resp.Token)
		assert.Equal(t, user.Email, resp.User.Email)
	})

	t.Run("wrong password", func(t *testing.T) {
		input := LoginInput{
			Email:    user.Email,
			Password: "wrongpassword",
		}
		resp, err := svc.Login(input)
		assert.Nil(t, resp)
		// B4: generic ErrUnauthorized — no hint whether email or password is wrong (anti-enumeration)
		assert.True(t, errors.Is(err, apperror.ErrUnauthorized))
	})

	t.Run("non-existent email", func(t *testing.T) {
		input := LoginInput{
			Email:    "nobody@example.com",
			Password: "password123",
		}
		resp, err := svc.Login(input)
		assert.Nil(t, resp)
		// B4: same generic error as wrong password — prevents email enumeration
		assert.True(t, errors.Is(err, apperror.ErrUnauthorized))
	})

	t.Run("social login account", func(t *testing.T) {
		socialUser := struct {
			Email        string
			PasswordHash *string
			FullName     string
			Provider     string
		}{
			Email:        "social@example.com",
			PasswordHash: nil,
			FullName:     "Social User",
			Provider:     "google",
		}
		db.Exec("INSERT INTO users (id, email, password_hash, full_name, provider) VALUES ($1, $2, $3, $4, $5)",
			"550e8400-e29b-41d4-a716-446655440000", socialUser.Email, socialUser.PasswordHash, socialUser.FullName, socialUser.Provider)

		input := LoginInput{
			Email:    "social@example.com",
			Password: "anypass",
		}
		resp, err := svc.Login(input)
		assert.Nil(t, resp)
		// B4: social login accounts return the same generic ErrUnauthorized
		// (no hint that the account exists or which provider to use)
		assert.True(t, errors.Is(err, apperror.ErrUnauthorized))
	})
}

func TestAuthService_GenerateToken(t *testing.T) {
	db := setupTestDB(t)
	svc := NewAuthService(db, testJWTSecret, 72, nil, "", "", "", session.New(db, testJWTSecret, ""))
	user := createTestUser(t, db)

	t.Run("token contains correct sub claim", func(t *testing.T) {
		token, err := svc.generateToken(user.ID, user.Email, 0)
		require.NoError(t, err)
		assert.NotEmpty(t, token)

		// Parse and verify claims
		parsed, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
			return []byte(testJWTSecret), nil
		})
		require.NoError(t, err)
		assert.True(t, parsed.Valid)

		claims, ok := parsed.Claims.(jwt.MapClaims)
		require.True(t, ok)
		assert.Equal(t, user.ID.String(), claims["sub"])
		assert.Equal(t, user.Email, claims["email"])
		assert.NotNil(t, claims["exp"])
		assert.NotNil(t, claims["iat"])
	})

	t.Run("token is signed with HS256", func(t *testing.T) {
		token, err := svc.generateToken(user.ID, user.Email, 0)
		require.NoError(t, err)

		parsed, err := jwt.Parse(token, func(tk *jwt.Token) (interface{}, error) {
			method, ok := tk.Method.(*jwt.SigningMethodHMAC)
			assert.True(t, ok)
			assert.Equal(t, "HS256", method.Alg())
			return []byte(testJWTSecret), nil
		})
		require.NoError(t, err)
		assert.True(t, parsed.Valid)
	})
}

// newAuthSvc builds an AuthService wired for the security tests below.
func newAuthSvc(db *gorm.DB) *AuthService {
	return NewAuthService(db, testJWTSecret, 72, nil, "", "", "", session.New(db, testJWTSecret, ""))
}

// createUnverified inserts an unverified local account whose OTP is stored
// hashed (F7), returning the row plus the plaintext code the user would type.
func createUnverified(t *testing.T, db *gorm.DB, email, otp string, expiresIn time.Duration) models.User {
	t.Helper()
	hash, err := hashOTP(otp)
	require.NoError(t, err)
	exp := time.Now().Add(expiresIn)
	u := models.User{
		Email:                email,
		FullName:             "Pending User",
		Provider:             "local",
		IsVerified:           false,
		VerifyToken:          &hash,
		VerifyTokenExpiresAt: &exp,
	}
	require.NoError(t, db.Create(&u).Error)
	return u
}

// TestAuthService_VerifyEmail exercises the F7 OTP controls: hashed storage,
// per-account lockout, and a single generic error for every failure path.
func TestAuthService_VerifyEmail(t *testing.T) {
	db := setupTestDB(t)
	svc := newAuthSvc(db)
	const generic = "invalid or expired verification code"

	t.Run("success with correct OTP", func(t *testing.T) {
		u := createUnverified(t, db, "verify-ok@example.com", "123456", verifyTokenTTL)
		require.NoError(t, svc.VerifyEmail(u.Email, "123456"))
		var got models.User
		require.NoError(t, db.First(&got, "id = ?", u.ID).Error)
		assert.True(t, got.IsVerified)
		assert.Nil(t, got.VerifyToken) // consumed
	})

	t.Run("OTP persisted hashed, never plaintext (F7)", func(t *testing.T) {
		u := createUnverified(t, db, "verify-hash@example.com", "654321", verifyTokenTTL)
		var got models.User
		require.NoError(t, db.First(&got, "id = ?", u.ID).Error)
		require.NotNil(t, got.VerifyToken)
		assert.NotEqual(t, "654321", *got.VerifyToken)
	})

	t.Run("wrong OTP increments attempts, generic error (F7)", func(t *testing.T) {
		u := createUnverified(t, db, "verify-wrong@example.com", "111111", verifyTokenTTL)
		err := svc.VerifyEmail(u.Email, "000000")
		require.Error(t, err)
		assert.Equal(t, generic, err.Error())
		var got models.User
		require.NoError(t, db.First(&got, "id = ?", u.ID).Error)
		assert.Equal(t, 1, got.VerifyAttempts)
		assert.False(t, got.IsVerified)
	})

	t.Run("lockout wipes token even for the correct code (F7)", func(t *testing.T) {
		u := createUnverified(t, db, "verify-lock@example.com", "222222", verifyTokenTTL)
		require.NoError(t, db.Model(&models.User{}).Where("id = ?", u.ID).
			UpdateColumn("verify_attempts", maxVerifyAttempts).Error)
		err := svc.VerifyEmail(u.Email, "222222")
		require.Error(t, err)
		assert.Equal(t, generic, err.Error())
		var got models.User
		require.NoError(t, db.First(&got, "id = ?", u.ID).Error)
		assert.Nil(t, got.VerifyToken)
		assert.False(t, got.IsVerified)
	})

	t.Run("already verified is a generic error, not an oracle (F7)", func(t *testing.T) {
		u := createUnverified(t, db, "verify-done@example.com", "333333", verifyTokenTTL)
		require.NoError(t, db.Model(&models.User{}).Where("id = ?", u.ID).
			Update("is_verified", true).Error)
		err := svc.VerifyEmail(u.Email, "333333")
		require.Error(t, err)
		assert.Equal(t, generic, err.Error())
	})

	t.Run("expired token is a generic error", func(t *testing.T) {
		u := createUnverified(t, db, "verify-exp@example.com", "444444", -time.Minute)
		err := svc.VerifyEmail(u.Email, "444444")
		require.Error(t, err)
		assert.Equal(t, generic, err.Error())
	})

	t.Run("unknown email is a generic error (no enumeration)", func(t *testing.T) {
		err := svc.VerifyEmail("nobody@example.com", "123456")
		require.Error(t, err)
		assert.Equal(t, generic, err.Error())
	})
}

// TestAuthService_Login_RejectsUnverified pins F6: a local account that has not
// completed email verification cannot obtain a session via login.
func TestAuthService_Login_RejectsUnverified(t *testing.T) {
	db := setupTestDB(t)
	svc := newAuthSvc(db)
	user := createTestUser(t, db) // is_verified defaults to false
	_, err := svc.Login(LoginInput{Email: user.Email, Password: "password123"})
	require.Error(t, err)
	assert.True(t, errors.Is(err, apperror.ErrUnauthorized))
}

// TestAuthService_RevokeTokens pins F9: logout bumps token_version so every
// previously issued JWT (which carries the old tv claim) is rejected.
func TestAuthService_RevokeTokens(t *testing.T) {
	db := setupTestDB(t)
	svc := newAuthSvc(db)
	user := createTestUser(t, db)
	require.NoError(t, svc.RevokeTokens(user.ID.String()))
	var got models.User
	require.NoError(t, db.First(&got, "id = ?", user.ID).Error)
	assert.Equal(t, 1, got.TokenVersion)
}

// TestAuthService_ResetPassword_RevokesSessions pins F9: a password reset both
// sets the new password and increments token_version, invalidating old sessions.
func TestAuthService_ResetPassword_RevokesSessions(t *testing.T) {
	db := setupTestDB(t)
	svc := newAuthSvc(db)
	user := createTestUser(t, db)
	require.NoError(t, db.Model(&models.User{}).Where("id = ?", user.ID).
		Updates(map[string]interface{}{
			"reset_token":            "reset-token-abc",
			"reset_token_expires_at": time.Now().Add(time.Hour),
		}).Error)

	require.NoError(t, svc.ResetPassword("reset-token-abc", "newpassword1"))

	var got models.User
	require.NoError(t, db.First(&got, "id = ?", user.ID).Error)
	assert.Equal(t, 1, got.TokenVersion)
	assert.Nil(t, got.ResetToken)
	require.NotNil(t, got.PasswordHash)
	assert.NoError(t, bcrypt.CompareHashAndPassword([]byte(*got.PasswordHash), []byte("newpassword1")))
}

// TestValidatePassword pins the F5 policy shared by register/reset/change.
func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name string
		pw   string
		ok   bool
	}{
		{"too short", "ab1", false},
		{"letters only", "abcdefgh", false},
		{"digits only", "12345678", false},
		{"common password rejected", "password1", false}, // F5 blocklist
		{"valid letters+digits", "tr1pcompass", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validatePassword(c.pw)
			if c.ok {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.True(t, errors.Is(err, apperror.ErrInvalidInput))
		})
	}
}
