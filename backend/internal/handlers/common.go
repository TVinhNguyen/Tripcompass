package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"tripcompass-backend/internal/apperror"

	"github.com/gin-gonic/gin"
)

// handleServiceError maps service-layer sentinel errors to HTTP status codes.
// All error messages are English — frontend is responsible for locale-mapping.
func handleServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, apperror.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, apperror.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	case errors.Is(err, apperror.ErrConflict):
		c.JSON(http.StatusConflict, gin.H{"error": "conflict"})
	case errors.Is(err, apperror.ErrInvalidInput):
		// ErrInvalidInput may wrap a human-readable message — safe to surface
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, apperror.ErrUnauthorized):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	default:
		slog.Error("unhandled service error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}

// respondInternalError logs an internal error and returns a generic 500 to the client.
// Use this instead of c.JSON(500, gin.H{"error": err.Error()}) to prevent leaking
// internal details (SQL fragments, file paths, stack traces).
func respondInternalError(c *gin.Context, err error) {
	slog.Error("internal error", "path", c.FullPath(), "method", c.Request.Method, "err", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
}
