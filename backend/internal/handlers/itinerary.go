package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"tripcompass-backend/internal/middleware"
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

func userID(c *gin.Context) string {
	v, _ := c.Get(middleware.UserIDKey)
	s, _ := v.(string)
	return s
}

// GET /itineraries
func (h *ItineraryHandler) GetMyItineraries(c *gin.Context) {
	list, err := h.svc.GetMyItineraries(userID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

// POST /itineraries
func (h *ItineraryHandler) Create(c *gin.Context) {
	var input services.CreateItineraryInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	it, err := h.svc.Create(userID(c), input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, it)
}

// GET /itineraries/:id
func (h *ItineraryHandler) GetOne(c *gin.Context) {
	it, err := h.svc.GetOne(c.Param("id"), userID(c))
	if err != nil {
		if err.Error() == "forbidden" {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		} else {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		}
		return
	}
	c.JSON(http.StatusOK, it)
}

// PATCH /itineraries/:id
func (h *ItineraryHandler) Update(c *gin.Context) {
	var input services.UpdateItineraryInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	it, err := h.svc.Update(c.Param("id"), userID(c), input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, it)
}

// DELETE /itineraries/:id
func (h *ItineraryHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Param("id"), userID(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// POST /itineraries/:id/clone
func (h *ItineraryHandler) Clone(c *gin.Context) {
	it, err := h.svc.Clone(c.Param("id"), userID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, it)
}

// PATCH /itineraries/:id/publish
func (h *ItineraryHandler) Publish(c *gin.Context) {
	it, err := h.svc.Publish(c.Param("id"), userID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, it)
}

// GET /explore
func (h *ItineraryHandler) Explore(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
