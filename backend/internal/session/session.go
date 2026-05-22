// Package session owns the "authenticated user" concept end-to-end:
// resolving an inbound JWT into a typed Session, projecting a freshly
// authenticated user into the same shape, and applying the suspension
// + admin rules in one place.
//
// Before this module existed those three concerns were scattered across
// middleware/jwt.go (parse + DB hit), middleware/admin.go (env allowlist
// duplicate), services/auth.go (markAdmin stamping + Login suspend check),
// and handlers/ws.go (re-implemented gate per handshake). Social-login
// paths in particular silently skipped the suspended check — a real bug,
// not just code smell.
//
// The module exposes two entry points to match the two natural seams:
//
//   - Resolver.FromRequest(c) — for an incoming request that already has a
//     token (HTTP middleware, WS handshake). Looks up the user, applies
//     the active+admin rules, stores the Session on the gin context.
//   - Resolver.FromUser(u)    — for a code path that has just authenticated
//     a user (Login, social login, register). Projects the same Session
//     shape so the response embeds the canonical view.
//
// Both share the same Session value type, so the rules live in one place.
package session

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"tripcompass-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// Session is the canonical view of an authenticated user. It carries only
// the facts callers need at request time — no password hashes, no DB-only
// columns, no provider plumbing. JSON tags match the previous /auth/me
// response shape so frontend doesn't see a contract change.
type Session struct {
	UserID    string    `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	AvatarURL string    `json:"avatar_url,omitempty"`
	Provider  string    `json:"provider"`
	IsAdmin   bool      `json:"is_admin"`
	// Status is "active" or "suspended". When Resolver hands a Session
	// back, Status is always "active" — suspended sessions are rejected.
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// Sentinel errors. Callers map these to HTTP status codes:
//   - ErrInvalidToken   → 401
//   - ErrUserNotFound   → 401 (token references deleted account)
//   - ErrUserSuspended  → 403 (account exists but suspended)
//   - ErrUnverified     → 401 (rare: token issued before verify, kept for symmetry)
var (
	ErrInvalidToken  = errors.New("invalid or expired token")
	ErrUserNotFound  = errors.New("user not found")
	ErrUserSuspended = errors.New("account suspended")
	ErrUnverified    = errors.New("email not verified")
)

// ctxKey is the gin.Context key under which Resolver stores the resolved
// Session. Callers read it via FromContext.
const ctxKey = "session"

// Resolver holds the dependencies needed to project a Session from either
// a token or a freshly-authenticated User. One instance per process; thread
// safe (read-only fields).
type Resolver struct {
	db          *gorm.DB
	jwtSecret   string
	adminEmails map[string]bool
}

// New constructs a Resolver. adminEmails is the ADMIN_EMAILS env value
// (comma-separated); it's parsed once here so both the request and login
// paths share the same allowlist semantics — no more duplicate parsing in
// middleware/admin.go and services/auth.go.
func New(db *gorm.DB, jwtSecret, adminEmails string) *Resolver {
	allow := map[string]bool{}
	for _, e := range strings.Split(adminEmails, ",") {
		if v := strings.TrimSpace(strings.ToLower(e)); v != "" {
			allow[v] = true
		}
	}
	return &Resolver{db: db, jwtSecret: jwtSecret, adminEmails: allow}
}

// FromRequest reads the token from cookie or Authorization header, looks up
// the user, and returns a Session. Errors are sentinel — callers map to
// HTTP status. The resolved Session is also stashed on the gin.Context so
// downstream middleware / handlers can read it via FromContext without
// re-querying.
//
// One DB SELECT per protected request. Acceptable at MVP scale; cache via
// Redis later if it becomes hot.
func (r *Resolver) FromRequest(c *gin.Context) (*Session, error) {
	tokenStr := tokenFromGin(c)
	if tokenStr == "" {
		return nil, ErrInvalidToken
	}
	s, err := r.FromToken(tokenStr)
	if err != nil {
		return nil, err
	}
	c.Set(ctxKey, s)
	return s, nil
}

// FromToken resolves a raw token string into a Session. Used by entry
// points that extract the token themselves — e.g. the WebSocket handshake,
// which accepts the token in 3 places (cookie, Sec-WebSocket-Protocol,
// query param). Same active+admin rules as FromRequest.
func (r *Resolver) FromToken(tokenStr string) (*Session, error) {
	uid, _, err := r.parseClaims(tokenStr)
	if err != nil {
		return nil, err
	}
	var u models.User
	if err := r.db.Where("id = ?", uid).First(&u).Error; err != nil {
		return nil, ErrUserNotFound
	}
	if u.Status == models.UserStatusSuspended {
		return nil, ErrUserSuspended
	}
	return r.fromUser(&u), nil
}

// FromUser projects an already-authenticated User into a Session.
//
// Used by login / register / social-login response paths. The "is the user
// allowed to operate now?" rule that applies to every path is suspension —
// applied here so social login can't silently bypass it (the previous bug
// class). Verification is intentionally NOT checked here: Register hands
// back a session-shape response for a still-unverified account, and Login
// already gates verification before reaching this code.
func (r *Resolver) FromUser(u *models.User) (*Session, error) {
	if u == nil {
		return nil, ErrUserNotFound
	}
	if u.Status == models.UserStatusSuspended {
		return nil, ErrUserSuspended
	}
	return r.fromUser(u), nil
}

// fromUser is the unsafe projection — assumes the user has already been
// vetted for verification/suspension. Internal helper.
func (r *Resolver) fromUser(u *models.User) *Session {
	avatar := ""
	if u.AvatarURL != nil {
		avatar = *u.AvatarURL
	}
	return &Session{
		UserID:    u.ID.String(),
		Email:     u.Email,
		FullName:  u.FullName,
		AvatarURL: avatar,
		Provider:  u.Provider,
		IsAdmin:   r.isAdmin(u),
		Status:    u.Status,
		CreatedAt: u.CreatedAt,
	}
}

// isAdmin OR-checks the two admin paths so adding/removing an env email
// takes effect without a DB write, and promoting in the UI grants access
// without restart.
func (r *Resolver) isAdmin(u *models.User) bool {
	if u.Role == models.UserRoleAdmin {
		return true
	}
	return r.adminEmails[strings.ToLower(u.Email)]
}

// FromContext returns the Session resolved earlier in the middleware chain.
// Returns nil if no middleware ran (test path) or if resolution failed.
func FromContext(c *gin.Context) *Session {
	v, ok := c.Get(ctxKey)
	if !ok {
		return nil
	}
	s, _ := v.(*Session)
	return s
}

// ─────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────

// tokenFromGin prefers the HttpOnly cookie (XSS-safe) over the
// Authorization header. Same order as the previous middleware.
func tokenFromGin(c *gin.Context) string {
	if cookie, err := c.Cookie("token"); err == nil && cookie != "" {
		return cookie
	}
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}

// parseClaims verifies the HMAC signature and pulls (sub, email). Email
// is best-effort — older tokens might lack it.
func (r *Resolver) parseClaims(tokenStr string) (string, string, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(r.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		return "", "", ErrInvalidToken
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", "", ErrInvalidToken
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", "", ErrInvalidToken
	}
	email, _ := claims["email"].(string)
	return sub, email, nil
}

// HTTPStatus maps a session error to the appropriate gin response status.
// Handlers and middleware call this to keep error mapping consistent.
func HTTPStatus(err error) int {
	switch {
	case errors.Is(err, ErrUserSuspended):
		return http.StatusForbidden
	case errors.Is(err, ErrUnverified):
		return http.StatusUnauthorized
	default:
		return http.StatusUnauthorized
	}
}
