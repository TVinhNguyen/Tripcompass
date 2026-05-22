// Package middleware — gin middleware adapters.
//
// JWTAuth + RequireAdmin are thin wrappers around the session package:
// session.Resolver owns the auth rules, middleware translates them into
// HTTP responses. Keeping the logic out of middleware means the same rules
// apply to non-HTTP entry points (WebSocket handshakes) without duplication.
package middleware

import (
	"net/http"
	"tripcompass-backend/internal/session"

	"github.com/gin-gonic/gin"
)

const (
	// UserIDKey is the gin.Context key used by legacy handlers that called
	// c.GetString(UserIDKey). New code should use session.FromContext(c).UserID.
	UserIDKey = "userID"
)

// JWTAuth gates a route by resolving an authenticated session from the
// request. Suspended / missing-user / bad-token are mapped to 401/403.
//
// The resolved session is stashed on the gin context so downstream handlers
// can read it via session.FromContext without another DB hit.
func JWTAuth(resolver *session.Resolver) gin.HandlerFunc {
	return func(c *gin.Context) {
		s, err := resolver.FromRequest(c)
		if err != nil {
			c.AbortWithStatusJSON(session.HTTPStatus(err), gin.H{"error": err.Error()})
			return
		}
		// Back-compat for handlers that read UserIDKey directly.
		c.Set(UserIDKey, s.UserID)
		c.Next()
	}
}

// OptionalJWTAuth resolves a session when a valid token is present, but never
// rejects anonymous public requests. This lets public endpoints personalize or
// dedupe by user ID while still remaining readable without login.
func OptionalJWTAuth(resolver *session.Resolver) gin.HandlerFunc {
	return func(c *gin.Context) {
		if resolver == nil {
			c.Next()
			return
		}
		if s, err := resolver.FromRequest(c); err == nil {
			c.Set(UserIDKey, s.UserID)
		}
		c.Next()
	}
}

// RequireAdmin gates a route on session.IsAdmin. Must run after JWTAuth so
// the session is already on the context. Returns 403 for non-admin sessions
// (vs. 401 from JWTAuth for unauthenticated).
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		s := session.FromContext(c)
		if s == nil || !s.IsAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.Next()
	}
}
