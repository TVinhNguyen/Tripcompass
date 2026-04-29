package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// RequireAdminEmail rejects requests whose JWT subject (userID, set by JWTAuth)
// is not in the admin allowlist. adminEmails is a comma-separated list of
// email addresses loaded from ADMIN_EMAILS env var.
//
// NOTE: This compares against the email claim, so JWTAuth must run first and
// the JWT must embed the user's email. As an interim measure until a proper
// role column exists in the DB.
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
