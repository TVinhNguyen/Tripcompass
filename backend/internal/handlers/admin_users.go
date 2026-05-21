// Package handlers — admin_users.go
//
// HTTP layer for the /admin/users page: list with filters + role/status
// patches. Service-level validation maps invalid enums to ErrInvalidInput,
// which handleServiceError surfaces as 400.

package handlers

import (
	"net/http"
	"strconv"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AdminUserHandler struct {
	svc *services.AdminUserService
}

func NewAdminUserHandler(db *gorm.DB) *AdminUserHandler {
	return &AdminUserHandler{svc: services.NewAdminUserService(db)}
}

// GET /admin/users?search=&role=&limit=
func (h *AdminUserHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	rows, err := h.svc.List(c.Query("search"), c.Query("role"), limit)
	if err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// PATCH /admin/users/:id/role
func (h *AdminUserHandler) UpdateRole(c *gin.Context) {
	var body struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.UpdateRole(c.Param("id"), body.Role); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "role updated"})
}

// PATCH /admin/users/:id/status
func (h *AdminUserHandler) UpdateStatus(c *gin.Context) {
	var body struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.UpdateStatus(c.Param("id"), body.Status); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "status updated"})
}
