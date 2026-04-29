package pagination

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

const (
	DefaultLimit = 20
	MaxLimit     = 100
)

// Parse extracts and validates page, limit, and offset from query params.
// Limit is clamped to [1, maxLimit]. Page defaults to 1 if ≤ 0.
func Parse(c *gin.Context, defaultLimit, maxLimit int) (page, limit, offset int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	limit, _ = strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(defaultLimit)))
	if limit < 1 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	offset = (page - 1) * limit
	return
}
