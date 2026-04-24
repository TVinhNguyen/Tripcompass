package handlers

import (
	"net/http"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type UserHandler struct {
	svc *services.UserService
}

func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{svc: services.NewUserService(db)}
}

// GET /api/v1/user/profile
func (h *UserHandler) GetProfile(c *gin.Context) {
	u, err := h.svc.GetByID(userID(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

// PATCH /api/v1/user/profile
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	var input services.UpdateProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	u, err := h.svc.UpdateProfile(userID(c), input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

// POST /api/v1/user/change-password
func (h *UserHandler) ChangePassword(c *gin.Context) {
	var input services.ChangePasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.svc.ChangePassword(userID(c), input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password changed successfully"})
}

// GET /api/v1/user/saved-places
func (h *UserHandler) GetSavedPlaces(c *gin.Context) {
	places, err := h.svc.GetSavedPlaces(userID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": places})
}

// POST /api/v1/user/saved-places
func (h *UserHandler) SavePlace(c *gin.Context) {
	var body struct {
		PlaceID string `json:"place_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.svc.SavePlace(userID(c), body.PlaceID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "place saved"})
}

// DELETE /api/v1/user/saved-places/:place_id
func (h *UserHandler) UnsavePlace(c *gin.Context) {
	if err := h.svc.UnsavePlace(userID(c), c.Param("place_id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
