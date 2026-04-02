package handlers

import (
	"net/http"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ComboHandler struct {
	svc *services.ComboService
}

func NewComboHandler(db *gorm.DB) *ComboHandler {
	return &ComboHandler{svc: services.NewComboService(db)}
}

// GET /api/v1/combos?destination=nha+trang
func (h *ComboHandler) List(c *gin.Context) {
	list, err := h.svc.List(c.Query("destination"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// GET /api/v1/combos/:id
func (h *ComboHandler) Get(c *gin.Context) {
	co, err := h.svc.GetByID(c.Param("id"))
	if err != nil {
		handleNotFound(c, err)
		return
	}
	c.JSON(http.StatusOK, co)
}

// POST /api/v1/combos
func (h *ComboHandler) Create(c *gin.Context) {
	var input services.CreateComboInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	co, err := h.svc.Create(input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, co)
}

// PATCH /api/v1/combos/:id
func (h *ComboHandler) Update(c *gin.Context) {
	var input services.UpdateComboInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	co, err := h.svc.Update(c.Param("id"), input)
	if err != nil {
		handleNotFound(c, err)
		return
	}
	c.JSON(http.StatusOK, co)
}

// DELETE /api/v1/combos/:id
func (h *ComboHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Param("id")); err != nil {
		handleNotFound(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
