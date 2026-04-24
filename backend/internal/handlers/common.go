package handlers

import (
	"errors"
	"net/http"
	"tripcompass-backend/internal/apperror"

	"github.com/gin-gonic/gin"
)

// handleServiceError maps service-layer sentinel errors to HTTP status codes.
func handleServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, apperror.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, apperror.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	}
}
