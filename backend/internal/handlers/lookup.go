package handlers

import (
	"net/http"
	"strconv"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// LookupHandler exposes the combined destination query used by the ai-service.
type LookupHandler struct {
	svc *services.LookupService
}

func NewLookupHandler(db *gorm.DB) *LookupHandler {
	return &LookupHandler{svc: services.NewLookupService(db)}
}

// GET /api/v1/knowledge-base/lookup?destination=nha+trang&stale_days=30
func (h *LookupHandler) Lookup(c *gin.Context) {
	dest := c.Query("destination")
	if dest == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "destination query param is required"})
		return
	}

	staleDays := 30
	if s := c.Query("stale_days"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 {
			staleDays = v
		}
	}

	result, err := h.svc.Lookup(dest, staleDays)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
