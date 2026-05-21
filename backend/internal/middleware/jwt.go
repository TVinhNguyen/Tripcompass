package middleware

import (
	"errors"
	"net/http"
	"strings"
	"tripcompass-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

const (
	UserIDKey     = "userID"
	AdminEmailKey = "adminEmail"
)

// ErrUserSuspended is returned by AssertUserActive so callers (including the
// WS handlers, which can't reuse the Gin gate) can distinguish this from a
// generic "not found" and surface a clear 403 instead of 401.
var ErrUserSuspended = errors.New("user is suspended")

// AssertUserActive looks up the user and returns ErrUserSuspended when the
// row exists but status != 'active'. Used both by JWTAuth (HTTP) and by the
// WS handshake — stateless JWT alone can't reflect a post-issue suspension.
// One small SELECT per protected request; fine at MVP scale.
//
// Tests that exercise JWT parsing only may pass db=nil to skip the lookup
// — production wiring (cmd/main.go) never does. We treat nil as "no DB
// available, accept the token" rather than panic, so middleware-only tests
// don't need a real Postgres.
func AssertUserActive(db *gorm.DB, userID string) error {
	if db == nil {
		return nil
	}
	var u models.User
	if err := db.Select("id", "status").Where("id = ?", userID).First(&u).Error; err != nil {
		return err
	}
	if u.Status == models.UserStatusSuspended {
		return ErrUserSuspended
	}
	return nil
}

// ParseJWT verifies tokenStr against secret and returns the userID (sub claim).
// Returns an error if the token is invalid, expired, or missing the sub claim.
func ParseJWT(secret, tokenStr string) (userID string, err error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return "", errors.New("invalid or expired token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid token claims")
	}
	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return "", errors.New("invalid token subject")
	}
	return sub, nil
}

// parseJWTClaims is like ParseJWT but also returns the full claims map.
func parseJWTClaims(secret, tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid or expired token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}
	return claims, nil
}

// JWTAuth verifies the cookie / Bearer token AND that the user is still
// active. db is needed because suspension state lives outside the JWT;
// without it, an admin-suspended account would keep working until its 72h
// token expires.
func JWTAuth(db *gorm.DB, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Prefer cookie (HttpOnly, set by /auth/login etc.) so XSS cannot
		// read the token. Fall back to Authorization header so non-browser
		// clients (mobile, server-to-server, tests) keep working.
		tokenStr := ""
		if cookie, err := c.Cookie("token"); err == nil && cookie != "" {
			tokenStr = cookie
		} else {
			authHeader := c.GetHeader("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing credentials"})
				return
			}
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}

		claims, err := parseJWTClaims(secret, tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		userID, ok := claims["sub"].(string)
		if !ok || userID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token subject"})
			return
		}

		// Suspension check — stateless JWT can't reflect a post-issue
		// suspension by itself. Tiny SELECT; acceptable at this scale.
		if err := AssertUserActive(db, userID); err != nil {
			if errors.Is(err, ErrUserSuspended) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "account suspended"})
				return
			}
			// User row missing → token is for a deleted account.
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
			return
		}

		c.Set(UserIDKey, userID)

		// Set email claim if present (used by admin middleware)
		if email, ok := claims["email"].(string); ok && email != "" {
			c.Set(AdminEmailKey, email)
		}

		c.Next()
	}
}
