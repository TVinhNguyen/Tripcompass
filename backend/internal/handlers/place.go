package handlers

import (
	"net/http"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PlaceHandler struct {
	svc *services.PlaceService
}

func NewPlaceHandler(db *gorm.DB) *PlaceHandler {
	return &PlaceHandler{svc: services.NewPlaceService(db)}
}

// GET /api/v1/places?destination=nha+trang&category=FOOD
func (h *PlaceHandler) List(c *gin.Context) {
	list, err := h.svc.List(c.Query("destination"), c.Query("category"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// GET /api/v1/places/:id
func (h *PlaceHandler) Get(c *gin.Context) {
	p, err := h.svc.GetByID(c.Param("id"))
	if err != nil {
		handleNotFound(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

// POST /api/v1/places
func (h *PlaceHandler) Create(c *gin.Context) {
	var input services.CreatePlaceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	p, err := h.svc.Create(input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, p)
}

// PATCH /api/v1/places/:id
func (h *PlaceHandler) Update(c *gin.Context) {
	var input services.UpdatePlaceInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	p, err := h.svc.Update(c.Param("id"), input)
	if err != nil {
		handleNotFound(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

// DELETE /api/v1/places/:id
func (h *PlaceHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Param("id")); err != nil {
		handleNotFound(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
