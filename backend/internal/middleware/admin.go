package middleware

import (
	"net/http"
	"strings"
	"tripcompass-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// RequireAdmin gates a route on (email in ADMIN_EMAILS) OR (users.role == 'admin').
// Two-source check so:
//   - Bootstrap admins listed in env still work without a DB write.
//   - Admins promoted via the /admin/users UI gain access immediately,
//     even though their email isn't in env.
//
// JWTAuth must run first — it sets UserIDKey and AdminEmailKey from the token.
// A single SELECT per admin request hits the users table; admin endpoints
// are low-volume so we accept the round-trip over invalidating tokens on
// every role change.
func RequireAdmin(db *gorm.DB, adminEmails string) gin.HandlerFunc {
	allowlist := map[string]bool{}
	for _, e := range strings.Split(adminEmails, ",") {
		e = strings.TrimSpace(strings.ToLower(e))
		if e != "" {
			allowlist[e] = true
		}
	}

	return func(c *gin.Context) {
		email, _ := c.Get(AdminEmailKey)
		emailStr, _ := email.(string)
		if emailStr != "" && allowlist[strings.ToLower(emailStr)] {
			c.Next()
			return
		}

		uid, _ := c.Get(UserIDKey)
		uidStr, _ := uid.(string)
		if uidStr != "" {
			var role string
			if err := db.Model(&models.User{}).
				Select("role").
				Where("id = ?", uidStr).
				Scan(&role).Error; err == nil && role == models.UserRoleAdmin {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	}
}

// RequireAdminEmail is the env-only legacy gate. Kept for places that don't
// have a *gorm.DB on hand (none today, but a stable name avoids churn). New
// callers should use RequireAdmin instead.
//
// Deprecated: use RequireAdmin(db, adminEmails).
func RequireAdminEmail(adminEmails string) gin.HandlerFunc {
	allowlist := map[string]bool{}
	for _, e := range strings.Split(adminEmails, ",") {
		e = strings.TrimSpace(strings.ToLower(e))
		if e != "" {
			allowlist[e] = true
		}
	}

	return func(c *gin.Context) {
		email, exists := c.Get(AdminEmailKey)
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		if !allowlist[strings.ToLower(email.(string))] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.Next()
	}
}
