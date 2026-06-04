package handlers

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestTokenFromRequest pins the F12 fix: a JWT must NOT be accepted from the
// ?token= query parameter (it leaks into history/proxy/access logs and can be
// replayed). Only the HttpOnly cookie and the Sec-WebSocket-Protocol header are
// trusted.
func TestTokenFromRequest(t *testing.T) {
	t.Run("query param token is rejected (F12)", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/ws?token=leaked-jwt", nil)
		assert.Empty(t, tokenFromRequest(r),
			"?token= query param must be ignored — tokens in URLs leak into logs")
	})

	t.Run("cookie token is accepted", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/ws", nil)
		r.AddCookie(&http.Cookie{Name: "token", Value: "cookie-jwt"})
		assert.Equal(t, "cookie-jwt", tokenFromRequest(r))
	})

	t.Run("Sec-WebSocket-Protocol bearer token is accepted", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/ws", nil)
		r.Header.Set("Sec-WebSocket-Protocol", "bearer, header-jwt")
		assert.Equal(t, "header-jwt", tokenFromRequest(r))
	})

	t.Run("cookie wins over query param", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/ws?token=leaked-jwt", nil)
		r.AddCookie(&http.Cookie{Name: "token", Value: "cookie-jwt"})
		assert.Equal(t, "cookie-jwt", tokenFromRequest(r))
	})

	t.Run("no credentials returns empty", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/ws", nil)
		assert.Empty(t, tokenFromRequest(r))
	})
}
