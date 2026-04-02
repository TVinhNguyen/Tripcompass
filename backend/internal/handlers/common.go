package handlers

import (
	"errors"
	"net/http"
	"tripcompass-backend/internal/apperror"

	"github.com/gin-gonic/gin"
)

// handleNotFound maps apperror.ErrNotFound → 404, everything else → 400.
func handleNotFound(c *gin.Context, err error) {
	if errors.Is(err, apperror.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	}
}
