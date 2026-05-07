package handlers

import (
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
	return &WSHandler{
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

// HandleWebSocket upgrades HTTP → WebSocket.
// Route: GET /api/v1/ws/itinerary/:id?token=<JWT>
func (h *WSHandler) HandleWebSocket(c *gin.Context) {
	itineraryID := c.Param("id")
	tokenStr := c.Query("token")

	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token query parameter"})
		return
	}

	// Parse JWT using shared helper (same logic as JWTAuth middleware)
	userIDStr, err := middleware.ParseJWT(h.jwtSecret, tokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}

	// Check access: user must be owner or ACCEPTED collaborator
	// Uses service layer — respects any caching or future business logic added there.
	if err := h.itinerarySvc.CheckWSAccess(itineraryID, userIDStr); err != nil {
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

	client := ws.NewClient(h.hub, conn, itineraryID, userIDStr, fullName)
	h.hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
