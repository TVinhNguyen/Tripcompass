package middleware

// ratelimit_redis.go — Redis-backed rate limiter that works across multiple instances.
//
// Uses a sliding-window counter via INCR + EXPIRE:
//   - On first request in window: INCR returns 1, then EXPIRE sets window duration.
//   - Subsequent requests: INCR; if count > limit → 429.
//
// This is slightly optimistic (two commands are not atomic), but the race window
// is tiny and acceptable for rate limiting. For strict accuracy, use a Lua script.
//
// Falls back to the in-memory limiter if rdb is nil (e.g. Redis unavailable).

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// RateLimitRedis returns a gin middleware that rate-limits by IP using Redis.
// maxRequests: maximum requests allowed within windowSecs.
// Falls back to in-memory RateLimit if rdb is nil.
func RateLimitRedis(rdb *redis.Client, maxRequests int, windowSecs int) gin.HandlerFunc {
	if rdb == nil {
		// Graceful degradation: fall back to in-process limiter
		return RateLimit(maxRequests, windowSecs)
	}
	window := time.Duration(windowSecs) * time.Second

	return func(c *gin.Context) {
		ip := c.ClientIP()
		key := fmt.Sprintf("rl:%s:%s:%d", ip, c.FullPath(), windowSecs) // bucket per IP + route + window

		ctx, cancel := context.WithTimeout(c.Request.Context(), 200*time.Millisecond)
		defer cancel()

		count, err := rdb.Incr(ctx, key).Result()
		if err != nil {
			// Redis error — fail open (allow request, don't block legitimate traffic)
			c.Next()
			return
		}
		if count == 1 {
			// First request in this window: set expiry.
			// If EXPIRE fails (e.g. context timeout between INCR and EXPIRE),
			// delete the key to prevent a permanent counter that never expires —
			// which would permanently rate-limit this IP+route.
			if err := rdb.Expire(ctx, key, window).Err(); err != nil {
				rdb.Del(ctx, key)
				c.Next()
				return
			}
		}

		if count > int64(maxRequests) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded, please try again later",
			})
			return
		}

		c.Next()
	}
}
