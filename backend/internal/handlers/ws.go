package handlers

import (
	"net/http"
	"tripcompass-backend/internal/models"
	"tripcompass-backend/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Cho phép tất cả origins (production nên restrict)
	},
}

type WSHandler struct {
	db        *gorm.DB
	hub       *ws.Hub
	jwtSecret string
}

func NewWSHandler(db *gorm.DB, hub *ws.Hub, jwtSecret string) *WSHandler {
	return &WSHandler{db: db, hub: hub, jwtSecret: jwtSecret}
}

// HandleWebSocket xử lý upgrade HTTP → WebSocket
// Route: GET /api/v1/ws/itinerary/:id?token=<JWT>
func (h *WSHandler) HandleWebSocket(c *gin.Context) {
	itineraryID := c.Param("id")
	tokenStr := c.Query("token")

	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token query parameter"})
		return
	}

	// Parse JWT
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
		return
	}
	userIDStr, ok := claims["sub"].(string)
	if !ok || userIDStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token subject"})
		return
	}

	// Kiểm tra quyền: user phải là owner hoặc collaborator ACCEPTED
	var itinerary models.Itinerary
	if err := h.db.First(&itinerary, "id = ?", itineraryID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "itinerary not found"})
		return
	}

	hasAccess := itinerary.OwnerID.String() == userIDStr
	if !hasAccess {
		var collab models.Collaborator
		err := h.db.Where("itinerary_id = ? AND user_id = ? AND status = ?",
			itineraryID, userIDStr, "ACCEPTED").First(&collab).Error
		if err == nil {
			hasAccess = true
		}
	}

	if !hasAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "you don't have access to this itinerary"})
		return
	}

	// Lấy thông tin user
	var user models.User
	if err := h.db.First(&user, "id = ?", userIDStr).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "user not found"})
		return
	}

	// Upgrade HTTP → WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := ws.NewClient(h.hub, conn, itineraryID, userIDStr, user.FullName)

	// Register client vào hub
	h.hub.Register <- client

	// Start read/write pumps
	go client.WritePump()
	go client.ReadPump()
}
