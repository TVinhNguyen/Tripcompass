package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// bucket tracks request counts per IP.
type bucket struct {
	count   int
	resetAt time.Time
}

var (
	buckets = make(map[string]*bucket)
	mu      sync.Mutex
)

func init() {
	// Cleanup expired buckets every 5 minutes to prevent memory leak
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			mu.Lock()
			now := time.Now()
			for ip, b := range buckets {
				if now.After(b.resetAt) {
					delete(buckets, ip)
				}
			}
			mu.Unlock()
		}
	}()
}

// RateLimit returns a middleware that limits requests per IP.
// maxRequests: maximum requests allowed within windowSecs.
func RateLimit(maxRequests int, windowSecs int) gin.HandlerFunc {
	window := time.Duration(windowSecs) * time.Second

	return func(c *gin.Context) {
		ip := c.ClientIP()

		mu.Lock()
		b, ok := buckets[ip]
		now := time.Now()

		if !ok || now.After(b.resetAt) {
			b = &bucket{count: 0, resetAt: now.Add(window)}
			buckets[ip] = b
		}

		b.count++
		count := b.count
		mu.Unlock()

		if count > maxRequests {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded, please try again later",
			})
			return
		}

		c.Next()
	}
}
