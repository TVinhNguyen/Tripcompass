package handlers

import (
	"net/http"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ActivityHandler struct {
	svc *services.ActivityService
}

func NewActivityHandler(db *gorm.DB) *ActivityHandler {
	return &ActivityHandler{svc: services.NewActivityService(db)}
}

// POST /activities
func (h *ActivityHandler) Create(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.CreateActivityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	act, err := h.svc.Create(uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, act)
}

// PATCH /activities/:id
func (h *ActivityHandler) Update(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.UpdateActivityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	act, err := h.svc.Update(c.Param("id"), uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, act)
}

// DELETE /activities/:id
func (h *ActivityHandler) Delete(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	if err := h.svc.Delete(c.Param("id"), uid); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// PATCH /activities/reorder
func (h *ActivityHandler) Reorder(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input struct {
		Items []services.ReorderItem `json:"items" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.Reorder(uid, input.Items); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "reordered successfully"})
}
