package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"tripcompass-backend/internal/pagination"
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

// GET /api/v1/places?destination=nha+trang&category=FOOD&page=1&limit=20
func (h *PlaceHandler) List(c *gin.Context) {
	page, limit, _ := pagination.Parse(c, 20, 100)
	minRating, _ := strconv.ParseFloat(c.DefaultQuery("min_rating", "0"), 64)
	mustVisit := parseOptionalBool(c.Query("must_visit"))

	result, err := h.svc.Search(services.PlaceListFilter{
		Q:           c.Query("q"),
		Destination: c.Query("destination"),
		Category:    c.Query("category"),
		Area:        c.Query("area"),
		Tags:        splitCSV(c.Query("tags")),
		MinRating:   minRating,
		MinPrice:    parseOptionalInt(c.Query("min_price")),
		MaxPrice:    parseOptionalInt(c.Query("max_price")),
		MustVisit:   mustVisit,
		Sort:        c.Query("sort"),
		Page:        page,
		Limit:       limit,
	})
	if err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// GET /api/v1/places/destinations
func (h *PlaceHandler) Destinations(c *gin.Context) {
	result, err := h.svc.ListDestinations()
	if err != nil {
		respondInternalError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

// GET /api/v1/places/:id
func (h *PlaceHandler) Get(c *gin.Context) {
	p, err := h.svc.GetByID(c.Param("id"))
	if err != nil {
		handleServiceError(c, err)
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
		handleServiceError(c, err)
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
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

// DELETE /api/v1/places/:id
func (h *PlaceHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Param("id")); err != nil {
		handleServiceError(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

func splitCSV(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if v := strings.TrimSpace(part); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func parseOptionalInt(raw string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(raw))
	return n
}

func parseOptionalBool(raw string) *bool {
	if raw == "" {
		return nil
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return nil
	}
	return &v
}
