package handlers

import (
	"log"
	"net/http"
	"strings"
	"tripcompass-backend/internal/config"
	"tripcompass-backend/internal/services"
	"tripcompass-backend/internal/ws"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const authCookieName = "token"

type AuthHandler struct {
	svc            *services.AuthService
	cookieMaxAge   int
	cookieSecure   bool
	cookieDomain   string
}

func NewAuthHandler(db *gorm.DB, cfg *config.Config, pub ws.Publisher) *AuthHandler {
	emailSvc := services.NewEmailService(cfg)
	collabSvc := services.NewCollaboratorService(db, emailSvc)
	if pub != nil {
		collabSvc = collabSvc.WithPublisher(pub)
	}
	authSvc := services.NewAuthService(db, cfg.JWTSecret, cfg.JWTExpireHours, emailSvc, cfg.GoogleClientID, cfg.FacebookAppSecret, cfg.AdminEmails).
		WithCollaboratorService(collabSvc)

	// Cookie attributes are decided once at startup so handlers don't have
	// to re-read env. Secure is on whenever the deploy is HTTPS-served (any
	// allowed origin uses the https scheme). Browsers reject Secure cookies
	// on plain-HTTP localhost, so we leave Secure off for dev.
	secure := false
	for _, o := range strings.Split(cfg.AllowedOrigins, ",") {
		if strings.HasPrefix(strings.TrimSpace(o), "https://") {
			secure = true
			break
		}
	}
	return &AuthHandler{
		svc:          authSvc,
		cookieMaxAge: cfg.JWTExpireHours * 3600,
		cookieSecure: secure,
	}
}

// setAuthCookie writes the session JWT as an HttpOnly cookie so JavaScript
// (including XSS-injected code) cannot read it. SameSite=Lax keeps it off
// cross-site POSTs while allowing top-level navigation logins. Secure is
// applied when the deployment is HTTPS — see constructor.
func (h *AuthHandler) setAuthCookie(c *gin.Context, token string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(authCookieName, token, h.cookieMaxAge, "/", h.cookieDomain, h.cookieSecure, true)
}

func (h *AuthHandler) clearAuthCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(authCookieName, "", -1, "/", h.cookieDomain, h.cookieSecure, true)
}

// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var input services.RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.svc.Register(input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	// Do NOT set the session cookie on Register. New accounts must verify
	// their email and then go through Login — otherwise an unverified
	// browser session would be authenticated, undermining the email gate.
	c.JSON(http.StatusCreated, resp)
}

// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var input services.LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.svc.Login(input)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	h.setAuthCookie(c, resp.Token)
	c.JSON(http.StatusOK, resp)
}

// POST /api/v1/auth/logout — clear the session cookie. Public so an expired
// session can still log itself out cleanly.
func (h *AuthHandler) Logout(c *gin.Context) {
	h.clearAuthCookie(c)
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// GET /api/v1/auth/me — return current user
func (h *AuthHandler) Me(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	user, err := h.svc.GetByID(uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// POST /api/v1/auth/verify
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var body struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.VerifyEmail(body.Token); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "email verified successfully"})
}

// POST /api/v1/auth/resend-verification
func (h *AuthHandler) ResendVerification(c *gin.Context) {
	var body struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = h.svc.ResendVerification(body.Email) // always return 200 to prevent email enumeration
	c.JSON(http.StatusOK, gin.H{"message": "if the email exists and is unverified, a new verification email has been sent"})
}

// POST /api/v1/auth/google
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var body struct {
		IDToken string `json:"id_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.svc.GoogleLogin(body.IDToken)
	if err != nil {
		log.Printf("GoogleLogin failed: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "google authentication failed"})
		return
	}
	h.setAuthCookie(c, resp.Token)
	c.JSON(http.StatusOK, resp)
}

// POST /api/v1/auth/facebook
func (h *AuthHandler) FacebookLogin(c *gin.Context) {
	var body struct {
		AccessToken string `json:"access_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.svc.FacebookLogin(body.AccessToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "facebook authentication failed"})
		return
	}
	h.setAuthCookie(c, resp.Token)
	c.JSON(http.StatusOK, resp)
}
