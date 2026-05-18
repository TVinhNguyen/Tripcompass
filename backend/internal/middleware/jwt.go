package middleware

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	UserIDKey     = "userID"
	AdminEmailKey = "adminEmail"
)

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

func JWTAuth(secret string) gin.HandlerFunc {
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

		c.Set(UserIDKey, userID)

		// Set email claim if present (used by admin middleware)
		if email, ok := claims["email"].(string); ok && email != "" {
			c.Set(AdminEmailKey, email)
		}

		c.Next()
	}
}
