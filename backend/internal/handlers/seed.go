package handlers

import (
	"net/http"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SeedHandler struct {
	svc *services.SeedService
}

func NewSeedHandler(db *gorm.DB) *SeedHandler {
	return &SeedHandler{svc: services.NewSeedService(db)}
}

// POST /api/v1/knowledge-base/seed
func (h *SeedHandler) BulkSeed(c *gin.Context) {
	var input services.SeedInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.svc.BulkUpsert(input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
