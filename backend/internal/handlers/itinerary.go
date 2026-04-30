package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"tripcompass-backend/internal/middleware"
	"tripcompass-backend/internal/pagination"
	"tripcompass-backend/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ItineraryHandler struct {
	svc *services.ItineraryService
}

func NewItineraryHandler(db *gorm.DB) *ItineraryHandler {
	return &ItineraryHandler{svc: services.NewItineraryService(db)}
}

// mustUserID extracts the authenticated user ID from gin context.
// It aborts with 401 and returns false if the key is missing (middleware misconfiguration).
func mustUserID(c *gin.Context) (string, bool) {
	v, exists := c.Get(middleware.UserIDKey)
	if !exists {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return "", false
	}
	s, ok := v.(string)
	if !ok || s == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return "", false
	}
	return s, true
}

// GET /itineraries
func (h *ItineraryHandler) GetMyItineraries(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	list, err := h.svc.GetMyItineraries(uid)
	if err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

// POST /itineraries
func (h *ItineraryHandler) Create(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.CreateItineraryInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	it, err := h.svc.Create(uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, it)
}

// GET /itineraries/:id
func (h *ItineraryHandler) GetOne(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	it, err := h.svc.GetOne(c.Param("id"), uid)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, it)
}

// PATCH /itineraries/:id
func (h *ItineraryHandler) Update(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var input services.UpdateItineraryInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	it, err := h.svc.Update(c.Param("id"), uid, input)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, it)
}

// DELETE /itineraries/:id
func (h *ItineraryHandler) Delete(c *gin.Context) {
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

// POST /itineraries/:id/clone
func (h *ItineraryHandler) Clone(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	it, err := h.svc.Clone(c.Param("id"), uid)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, it)
}

// PATCH /itineraries/:id/publish
// Body: {"status": "PUBLISHED"|"DRAFT"}
func (h *ItineraryHandler) Publish(c *gin.Context) {
	uid, ok := mustUserID(c)
	if !ok {
		return
	}
	var body struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status field required (PUBLISHED or DRAFT)"})
		return
	}
	it, err := h.svc.Publish(c.Param("id"), uid, body.Status)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, it)
}

// GET /explore
func (h *ItineraryHandler) Explore(c *gin.Context) {
	page, limit, _ := pagination.Parse(c, 20, 50)
	minBudget, _ := strconv.ParseFloat(c.DefaultQuery("min_budget", "0"), 64)
	maxBudget, _ := strconv.ParseFloat(c.DefaultQuery("max_budget", "0"), 64)

	filter := services.ExploreFilter{
		Destination:    strings.ReplaceAll(c.Query("destination"), "+", " "),
		BudgetCategory: c.Query("budget_category"),
		Tags:           c.Query("tags"),
		Sort:           c.DefaultQuery("sort", "created_at"),
		MinBudget:      minBudget,
		MaxBudget:      maxBudget,
		Page:           page,
		Limit:          limit,
	}

	list, total, err := h.svc.Explore(filter)
	if err != nil {
		respondInternalError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  list,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// GET /itineraries/:id/public — view a published itinerary without login
func (h *ItineraryHandler) GetPublic(c *gin.Context) {
	it, err := h.svc.GetPublic(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, it)
}
