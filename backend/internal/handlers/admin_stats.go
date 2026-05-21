// Package handlers — admin_stats.go
//
// HTTP layer for GET /api/v1/admin/stats. Sits behind RequireAdmin (set up in
// router.go). Pure read; no body parsing.

package handlers

import (
	"net/http"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AdminStatsHandler struct {
	svc *services.AdminStatsService
}

func NewAdminStatsHandler(db *gorm.DB) *AdminStatsHandler {
	return &AdminStatsHandler{svc: services.NewAdminStatsService(db)}
}

func (h *AdminStatsHandler) Stats(c *gin.Context) {
	stats, err := h.svc.Stats()
	if err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}
