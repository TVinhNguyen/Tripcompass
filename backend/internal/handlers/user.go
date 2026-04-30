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
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	u, err := h.svc.GetByID(uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

// PATCH /api/v1/user/profile
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.UpdateProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u, err := h.svc.UpdateProfile(uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

// POST /api/v1/user/change-password
func (h *UserHandler) ChangePassword(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.ChangePasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.ChangePassword(uid, input); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password changed successfully"})
}

// GET /api/v1/user/saved-places
func (h *UserHandler) GetSavedPlaces(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	places, err := h.svc.GetSavedPlaces(uid)
	if err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": places})
}

// POST /api/v1/user/saved-places
func (h *UserHandler) SavePlace(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var body struct {
		PlaceID string `json:"place_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.SavePlace(uid, body.PlaceID); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "place saved"})
}

// DELETE /api/v1/user/saved-places/:place_id
func (h *UserHandler) UnsavePlace(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	if err := h.svc.UnsavePlace(uid, c.Param("place_id")); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
