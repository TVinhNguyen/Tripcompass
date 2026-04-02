package services

import (
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

const testJWTSecret = "test-secret-key"

func TestAuthService_Register(t *testing.T) {
	db := setupTestDB(t)
	svc := NewAuthService(db, testJWTSecret)

	t.Run("success", func(t *testing.T) {
		input := RegisterInput{
			Email:    "newuser@example.com",
			Password: "password123",
			FullName: "New User",
		}
		resp, err := svc.Register(input)
		require.NoError(t, err)
		assert.NotEmpty(t, resp.Token)
		assert.Equal(t, "newuser@example.com", resp.User.Email)
		assert.Equal(t, "New User", resp.User.FullName)
		assert.Equal(t, "local", resp.User.Provider)

		// Verify bcrypt hash is stored correctly
		var stored struct{ PasswordHash *string }
		db.Table("users").Select("password_hash").Where("email = ?", "newuser@example.com").Scan(&stored)
		require.NotNil(t, stored.PasswordHash)
		err = bcrypt.CompareHashAndPassword([]byte(*stored.PasswordHash), []byte("password123"))
		assert.NoError(t, err)
	})

	t.Run("duplicate email", func(t *testing.T) {
		_ = createTestUser(t, db)
		input := RegisterInput{
			Email:    "test@example.com",
			Password: "password123",
			FullName: "Duplicate",
		}
		resp, err := svc.Register(input)
		assert.Nil(t, resp)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "email already registered")
	})
}

func TestAuthService_Login(t *testing.T) {
	db := setupTestDB(t)
	svc := NewAuthService(db, testJWTSecret)
	user := createTestUser(t, db)

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
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid email or password")
	})

	t.Run("non-existent email", func(t *testing.T) {
		input := LoginInput{
			Email:    "nobody@example.com",
			Password: "password123",
		}
		resp, err := svc.Login(input)
		assert.Nil(t, resp)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid email or password")
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
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "this account uses social login")
	})
}

func TestAuthService_GenerateToken(t *testing.T) {
	db := setupTestDB(t)
	svc := NewAuthService(db, testJWTSecret)
	user := createTestUser(t, db)

	t.Run("token contains correct sub claim", func(t *testing.T) {
		token, err := svc.generateToken(user.ID)
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
		assert.NotNil(t, claims["exp"])
		assert.NotNil(t, claims["iat"])
	})

	t.Run("token is signed with HS256", func(t *testing.T) {
		token, err := svc.generateToken(user.ID)
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
