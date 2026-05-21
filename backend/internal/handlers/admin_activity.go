// Package handlers — admin_activity.go
//
// HTTP layer for GET /api/v1/admin/activity. Accepts `limit` query param;
// validation lives in the service so the handler stays thin.

package handlers

import (
	"net/http"
	"strconv"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AdminActivityHandler struct {
	svc *services.AdminActivityService
}

func NewAdminActivityHandler(db *gorm.DB) *AdminActivityHandler {
	return &AdminActivityHandler{svc: services.NewAdminActivityService(db)}
}

func (h *AdminActivityHandler) Recent(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	events, err := h.svc.Recent(limit)
	if err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": events})
}
