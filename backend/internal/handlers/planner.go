package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"tripcompass-backend/internal/config"
	"tripcompass-backend/internal/planner"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	plannerCacheTTL    = 1 * time.Hour
	plannerCachePrefix = "planner:v1:"
)

// PlannerHandler handles planner API routes.
// Supports two modes controlled by cfg.UseLLMPlanner:
//   - false (default): Go engine (existing behaviour)
//   - true:            Proxy to planner-ai Python service (LangGraph)
type PlannerHandler struct {
	engine       *planner.Engine
	redis        *redis.Client
	useLLM       bool
	plannerAIURL string
	httpClient   *http.Client
}

// NewPlannerHandler creates a handler. Pass nil for redis to disable caching.
func NewPlannerHandler(db *gorm.DB, rdb *redis.Client, cfg *config.Config) *PlannerHandler {
	return &PlannerHandler{
		engine:       planner.NewEngine(db),
		redis:        rdb,
		useLLM:       cfg.UseLLMPlanner,
		plannerAIURL: cfg.PlannerAIURL,
		httpClient:   &http.Client{Timeout: 120 * time.Second}, // LLM can be slow
	}
}

// cacheKey returns a stable SHA-256 key for a GenerateRequest.
func cacheKey(req planner.GenerateRequest) string {
	dest := strings.ToLower(strings.TrimSpace(req.Destination))
	prefs := strings.Join(req.PreferenceTags, ",")
	raw := fmt.Sprintf("%s|%s|%s|%d|%d|%s",
		dest, req.StartDate, req.EndDate,
		req.BudgetVND/100_000, // bucket to 100K
		req.GuestCount,
		prefs,
	)
	h := sha256.Sum256([]byte(raw))
	return plannerCachePrefix + fmt.Sprintf("%x", h[:8])
}

// POST /api/v1/planner/generate
func (h *PlannerHandler) Generate(c *gin.Context) {
	var req planner.GenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := context.Background()

	// ── Cache read (Go-engine only — planner-ai manages its own cache) ───
	if h.redis != nil && !h.useLLM {
		key := cacheKey(req)
		if cached, err := h.redis.Get(ctx, key).Bytes(); err == nil {
			c.Header("X-Cache", "HIT")
			c.Header("X-Planner-Mode", h.mode())
			var raw json.RawMessage = cached
			c.JSON(http.StatusOK, gin.H{"data": &raw})
			return
		}
	}

	// ── Route to correct planner ──────────────────────────────────────────
	var (
		result json.RawMessage
		err    error
	)

	if h.useLLM && h.plannerAIURL != "" {
		result, err = h.proxyToLLMPlanner(c.Request.Context(), req)
	} else {
		result, err = h.runGoEngine(req)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// ── Cache write (Go-engine only — planner-ai has its own cache layer) ──
	if h.redis != nil && !h.useLLM {
		key := cacheKey(req)
		_ = h.redis.Set(ctx, key, result, plannerCacheTTL).Err()
	}

	c.Header("X-Cache", "MISS")
	c.Header("X-Planner-Mode", h.mode())
	c.JSON(http.StatusOK, gin.H{"data": &result})
}

// proxyToLLMPlanner forwards the request to the Python planner-ai service.
func (h *PlannerHandler) proxyToLLMPlanner(ctx context.Context, req planner.GenerateRequest) (json.RawMessage, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		h.plannerAIURL+"/plan",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("build proxy request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("proxy to planner-ai: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("planner-ai returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return io.ReadAll(resp.Body)
}

// runGoEngine calls the existing Go planner engine.
func (h *PlannerHandler) runGoEngine(req planner.GenerateRequest) (json.RawMessage, error) {
	result, err := h.engine.Generate(req)
	if err != nil {
		return nil, err
	}
	return json.Marshal(result)
}

func (h *PlannerHandler) mode() string {
	if h.useLLM {
		return "llm"
	}
	return "go-engine"
}

// DELETE /admin/planner/cache
// Flushes all planner cache keys. Also forwards to planner-ai if in LLM mode.
func (h *PlannerHandler) FlushCache(c *gin.Context) {
	if h.redis == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Redis not configured"})
		return
	}

	ctx := context.Background()
	pattern := plannerCachePrefix + "*"
	var deleted int64

	var cursor uint64
	for {
		keys, next, err := h.redis.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("SCAN failed: %v", err)})
			return
		}
		if len(keys) > 0 {
			if n, err := h.redis.Del(ctx, keys...).Result(); err == nil {
				deleted += n
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}

	// Also flush Python service cache when in LLM mode
	if h.useLLM && h.plannerAIURL != "" {
		req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, h.plannerAIURL+"/cache", nil)
		_, _ = h.httpClient.Do(req) // best-effort
	}

	c.JSON(http.StatusOK, gin.H{
		"deleted": deleted,
		"message": fmt.Sprintf("Flushed %d planner cache keys (mode: %s)", deleted, h.mode()),
	})
}
