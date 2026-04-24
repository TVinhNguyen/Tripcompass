package handlers

import (
	"net/http"
	"strconv"
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

// GET /api/v1/combos?destination=nha+trang&page=1&limit=20
func (h *ComboHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	result, err := h.svc.List(c.Query("destination"), page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GET /api/v1/combos/:id
func (h *ComboHandler) Get(c *gin.Context) {
	co, err := h.svc.GetByID(c.Param("id"))
	if err != nil {
		handleServiceError(c, err)
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
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, co)
}

// DELETE /api/v1/combos/:id
func (h *ComboHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Param("id")); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
