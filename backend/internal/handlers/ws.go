package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"tripcompass-backend/internal/middleware"
	"tripcompass-backend/internal/services"
	"tripcompass-backend/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

type WSHandler struct {
	db             *gorm.DB // GetCollaboratorRole helper takes the db handle directly
	itinerarySvc   *services.ItineraryService
	userSvc        *services.UserService
	hub            *ws.Hub
	jwtSecret      string
	allowedOrigins []string
}

// NewWSHandler injects service layer dependencies instead of raw DB (M1: no direct DB access from handler).
func NewWSHandler(db *gorm.DB, hub *ws.Hub, jwtSecret, allowedOrigins string) *WSHandler {
	origins := strings.Split(allowedOrigins, ",")
	// B5: filter empty entries — ALLOWED_ORIGINS="" would otherwise produce [""]
	// which matches a browser tool sending no Origin header, bypassing the check.
	filtered := origins[:0]
	for _, o := range origins {
		if o = strings.TrimSpace(o); o != "" {
			filtered = append(filtered, o)
		}
	}
	if len(filtered) == 0 {
		slog.Warn("ws: ALLOWED_ORIGINS is empty — all WebSocket upgrade attempts will be rejected. Set ALLOWED_ORIGINS in env.")
	}
	return &WSHandler{
		db:             db,
		itinerarySvc:   services.NewItineraryService(db),
		userSvc:        services.NewUserService(db),
		hub:            hub,
		jwtSecret:      jwtSecret,
		allowedOrigins: filtered,
	}
}

func (h *WSHandler) newUpgrader() *websocket.Upgrader {
	return &websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		// Advertise that we speak the "bearer" subprotocol. Clients pass the
		// JWT as a second protocol entry ("bearer", "<jwt>") and the server
		// echoes back the protocol name it picked.
		Subprotocols: []string{"bearer"},
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			for _, allowed := range h.allowedOrigins {
				if allowed == origin {
					return true
				}
			}
			return false
		},
	}
}

// tokenFromRequest extracts the JWT from the request. Order:
//  1. HttpOnly cookie "token" — primary path now that auth is cookie-based.
//  2. Sec-WebSocket-Protocol ("bearer, <jwt>") — kept for non-browser clients
//     and for back-compat with already-connected sessions.
//  3. ?token= query param — legacy fallback; a warn at the caller flags it.
func tokenFromRequest(r *http.Request, q string) string {
	if cookie, err := r.Cookie("token"); err == nil && cookie.Value != "" {
		return cookie.Value
	}
	header := r.Header.Get("Sec-WebSocket-Protocol")
	if header != "" {
		for _, raw := range strings.Split(header, ",") {
			part := strings.TrimSpace(raw)
			if part == "" || strings.EqualFold(part, "bearer") {
				continue
			}
			return part
		}
	}
	return q
}

// HandleWebSocket upgrades HTTP → WebSocket.
// Route: GET /api/v1/ws/itinerary/:id (token via Sec-WebSocket-Protocol).
func (h *WSHandler) HandleWebSocket(c *gin.Context) {
	itineraryID := c.Param("id")
	tokenStr := tokenFromRequest(c.Request, c.Query("token"))
	if c.Query("token") != "" && c.Request.Header.Get("Sec-WebSocket-Protocol") == "" {
		slog.Warn("ws: legacy token query param used — migrate to Sec-WebSocket-Protocol")
	}

	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing credentials"})
		return
	}

	// Parse JWT using shared helper (same logic as JWTAuth middleware)
	userIDStr, err := middleware.ParseJWT(h.jwtSecret, tokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}

	// Reject suspended accounts — stateless JWT can outlive a suspension
	// otherwise. Same gate as the HTTP middleware.
	if err := middleware.AssertUserActive(h.db, userIDStr); err != nil {
		if errors.Is(err, middleware.ErrUserSuspended) {
			c.JSON(http.StatusForbidden, gin.H{"error": "account suspended"})
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
		}
		return
	}

	// Resolve role: OWNER / EDITOR / VIEWER. Doubles as the access check
	// (returns ErrForbidden if the user is none of those).
	role, err := services.GetCollaboratorRole(h.db, itineraryID, userIDStr)
	if err != nil {
		handleServiceError(c, err)
		return
	}

	// Fetch display name via service layer (M1: no h.db)
	fullName, err := h.userSvc.GetFullName(userIDStr)
	if err != nil {
		slog.Warn("ws: user not found for id", "user_id", userIDStr, "err", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	// Upgrade HTTP → WebSocket
	conn, err := h.newUpgrader().Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := ws.NewClient(h.hub, conn, itineraryID, userIDStr, fullName, role)
	h.hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}

// HandleUserWebSocket opens a user-scoped WebSocket. The "room" for this
// client is "user:<id>" — used to deliver per-user notifications (invites,
// future role changes) without coupling to an itinerary.
//
// Route: GET /api/v1/ws/user (token via Sec-WebSocket-Protocol).
func (h *WSHandler) HandleUserWebSocket(c *gin.Context) {
	tokenStr := tokenFromRequest(c.Request, c.Query("token"))
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing credentials"})
		return
	}
	userIDStr, err := middleware.ParseJWT(h.jwtSecret, tokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}
	if err := middleware.AssertUserActive(h.db, userIDStr); err != nil {
		if errors.Is(err, middleware.ErrUserSuspended) {
			c.JSON(http.StatusForbidden, gin.H{"error": "account suspended"})
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
		}
		return
	}
	fullName, err := h.userSvc.GetFullName(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	conn, err := h.newUpgrader().Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	roomID := ws.UserRoomPrefix + userIDStr
	client := ws.NewClient(h.hub, conn, roomID, userIDStr, fullName, "")
	h.hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
