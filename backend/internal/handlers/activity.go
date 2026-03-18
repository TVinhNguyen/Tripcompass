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
	var input services.CreateActivityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	act, err := h.svc.Create(userID(c), input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, act)
}

// PATCH /activities/:id
func (h *ActivityHandler) Update(c *gin.Context) {
	var input services.UpdateActivityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	act, err := h.svc.Update(c.Param("id"), userID(c), input)
	if err != nil {
		if err.Error() == "forbidden" {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		} else {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, act)
}

// DELETE /activities/:id
func (h *ActivityHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Param("id"), userID(c)); err != nil {
		if err.Error() == "forbidden" {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		} else {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// PATCH /activities/reorder
func (h *ActivityHandler) Reorder(c *gin.Context) {
	var input struct {
		Items []services.ReorderItem `json:"items" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.svc.Reorder(userID(c), input.Items); err != nil {
		if err.Error() == "forbidden" {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "reordered successfully"})
}
