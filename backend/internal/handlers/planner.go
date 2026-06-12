package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
	"tripcompass-backend/internal/config"
	"tripcompass-backend/internal/planner"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	plannerCacheTTL      = 1 * time.Hour
	plannerCachePrefix   = "planner:v1:"
	plannerAICachePrefix = "plan:v2:"
	// maxTripDays caps how long a generated trip may be (F10). An unbounded
	// date range would let an authenticated user drive an arbitrarily large —
	// and, on the LLM path, paid — generation (denial-of-wallet) despite the
	// per-IP/user rate limit.
	maxTripDays = 30
)

// validateTripLength rejects malformed or absurdly long date ranges before the
// request reaches the (potentially paid) planner (F10).
func validateTripLength(startDate, endDate string) error {
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return fmt.Errorf("start_date invalid (expected YYYY-MM-DD)")
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return fmt.Errorf("end_date invalid (expected YYYY-MM-DD)")
	}
	if end.Before(start) {
		return fmt.Errorf("end_date must be on or after start_date")
	}
	if days := int(end.Sub(start).Hours()/24) + 1; days > maxTripDays {
		return fmt.Errorf("trip length %d days exceeds the %d-day maximum", days, maxTripDays)
	}
	return nil
}

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
	raw := fmt.Sprintf("%s|%s|%s|%d|%d|%s|%s|%s|%s|%s|%s|%s",
		dest, req.StartDate, req.EndDate,
		req.BudgetVND/100_000, // bucket to 100K VND increments — prevents cache fragmentation
		// (e.g. 1_234_567 and 1_280_000 map to the same bucket 12, same plan)
		req.GuestCount,
		prefs,
		strings.ToLower(strings.TrimSpace(req.TravelStyle)),
		strings.TrimSpace(req.ArrivalTime),
		strings.TrimSpace(req.DepartureTime),
		strings.TrimSpace(req.DailyStartTime),
		strings.TrimSpace(req.DailyEndTime),
		strings.ToLower(strings.TrimSpace(req.TimeStrictness)),
	)
	h := sha256.Sum256([]byte(raw))
	return plannerCachePrefix + fmt.Sprintf("%x", h[:]) // full 128-bit hash; h[:8] collides at ~5B keys
}

// POST /api/v1/planner/generate
func (h *PlannerHandler) Generate(c *gin.Context) {
	var req planner.GenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// F10: bound the trip length so a huge date range can't fan out into an
	// unbounded (paid) LLM generation.
	if err := validateTripLength(req.StartDate, req.EndDate); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

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
		respondInternalError(c, err)
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
	if h.useLLM && h.plannerAIURL != "" {
		return "llm"
	}
	return "go-engine"
}

type plannerCacheStats struct {
	HitRate       float64 `json:"hit_rate"`
	TotalEntries  int     `json:"total_entries"`
	TotalBytes    int64   `json:"total_bytes"`
	TokensSaved   int64   `json:"tokens_saved"`
	AvgResponseMS int64   `json:"avg_response_ms"`
	AvgTTLSeconds int64   `json:"avg_ttl_seconds"`
}

type plannerCacheEntry struct {
	ID         string  `json:"id"`
	Key        string  `json:"key"`
	Query      string  `json:"query"`
	Source     string  `json:"source"`
	Hits       int     `json:"hits"`
	LastUsed   string  `json:"last_used"`
	Size       string  `json:"size"`
	SizeBytes  int64   `json:"size_bytes"`
	Score      float64 `json:"score"`
	TTLSeconds int64   `json:"ttl_seconds"`
}

type plannerCacheStatsResponse struct {
	Mode            string              `json:"mode"`
	RedisConfigured bool                `json:"redis_configured"`
	CachePrefix     string              `json:"cache_prefix"`
	Stats           plannerCacheStats   `json:"stats"`
	Queries         []plannerCacheEntry `json:"queries"`
	PlannerAIError  string              `json:"planner_ai_error,omitempty"`
}

// GET /admin/planner/cache
// Returns real Redis cache entries. It does not fabricate hit-rate/token data;
// those stay zero until the planner records per-key hit counters.
func (h *PlannerHandler) CacheStats(c *gin.Context) {
	ctx := c.Request.Context()
	resp := plannerCacheStatsResponse{
		Mode:            h.mode(),
		RedisConfigured: h.redis != nil,
		CachePrefix:     plannerCachePrefix,
	}

	if h.redis != nil {
		stats, entries, err := h.scanRedisCache(ctx, plannerCachePrefix+"*", "go-engine", 100)
		if err != nil {
			respondInternalError(c, err)
			return
		}
		resp.Stats = mergeCacheStats(resp.Stats, stats)
		resp.Queries = append(resp.Queries, entries...)
	}

	if h.useLLM && h.plannerAIURL != "" {
		aiStats, aiEntries, err := h.fetchPlannerAICacheStats(ctx)
		if err != nil {
			resp.PlannerAIError = err.Error()
		} else {
			resp.Stats = mergeCacheStats(resp.Stats, aiStats)
			resp.Queries = append(resp.Queries, aiEntries...)
		}
	}

	c.JSON(http.StatusOK, resp)
}

func (h *PlannerHandler) scanRedisCache(ctx context.Context, pattern, source string, limit int) (plannerCacheStats, []plannerCacheEntry, error) {
	var stats plannerCacheStats
	entries := make([]plannerCacheEntry, 0)
	var ttlTotal int64
	var ttlCount int64
	var cursor uint64

	for {
		keys, next, err := h.redis.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return stats, nil, err
		}

		for _, key := range keys {
			stats.TotalEntries++

			size, _ := h.redis.StrLen(ctx, key).Result()
			stats.TotalBytes += size

			ttlSeconds := int64(-1)
			if ttl, err := h.redis.TTL(ctx, key).Result(); err == nil {
				ttlSeconds = int64(ttl.Seconds())
				if ttlSeconds > 0 {
					ttlTotal += ttlSeconds
					ttlCount++
				}
			}

			if len(entries) < limit {
				query := cacheEntryLabel(key, source)
				if raw, err := h.redis.Get(ctx, key).Bytes(); err == nil {
					query = describeCachedPlan(key, source, raw)
				}
				entries = append(entries, plannerCacheEntry{
					ID:         key,
					Key:        key,
					Query:      query,
					Source:     source,
					Hits:       0,
					LastUsed:   "Không theo dõi",
					Size:       formatBytes(size),
					SizeBytes:  size,
					Score:      ttlScore(ttlSeconds),
					TTLSeconds: ttlSeconds,
				})
			}
		}

		cursor = next
		if cursor == 0 {
			break
		}
	}

	if ttlCount > 0 {
		stats.AvgTTLSeconds = ttlTotal / ttlCount
	}
	return stats, entries, nil
}

func (h *PlannerHandler) fetchPlannerAICacheStats(ctx context.Context) (plannerCacheStats, []plannerCacheEntry, error) {
	var empty plannerCacheStats
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.plannerAIURL+"/cache/stats", nil)
	if err != nil {
		return empty, nil, err
	}
	if token := strings.TrimSpace(os.Getenv("CACHE_ADMIN_TOKEN")); token != "" {
		req.Header.Set("X-Admin-Token", token)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return empty, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return empty, nil, fmt.Errorf("planner-ai cache stats unavailable")
	}

	var payload struct {
		Stats   plannerCacheStats   `json:"stats"`
		Queries []plannerCacheEntry `json:"queries"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return empty, nil, err
	}
	return payload.Stats, payload.Queries, nil
}

func mergeCacheStats(a, b plannerCacheStats) plannerCacheStats {
	total := a.TotalEntries + b.TotalEntries
	out := plannerCacheStats{
		TotalEntries:  total,
		TotalBytes:    a.TotalBytes + b.TotalBytes,
		TokensSaved:   a.TokensSaved + b.TokensSaved,
		AvgResponseMS: 0,
	}
	if total > 0 {
		out.AvgTTLSeconds = weightedAverage(a.AvgTTLSeconds, a.TotalEntries, b.AvgTTLSeconds, b.TotalEntries)
		out.AvgResponseMS = weightedAverage(a.AvgResponseMS, a.TotalEntries, b.AvgResponseMS, b.TotalEntries)
	}
	return out
}

func weightedAverage(a int64, aCount int, b int64, bCount int) int64 {
	total := aCount + bCount
	if total == 0 {
		return 0
	}
	return (a*int64(aCount) + b*int64(bCount)) / int64(total)
}

func describeCachedPlan(key, source string, raw []byte) string {
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return cacheEntryLabel(key, source)
	}
	destination := stringField(payload, "destination")
	if destination == "" {
		destination = nestedStringField(payload, "final_plan", "destination")
	}
	if destination == "" {
		destination = nestedStringField(payload, "plan", "destination")
	}
	if destination == "" {
		return cacheEntryLabel(key, source)
	}
	return fmt.Sprintf("%s plan: %s", source, destination)
}

func stringField(payload map[string]any, key string) string {
	if v, ok := payload[key].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func nestedStringField(payload map[string]any, parent, child string) string {
	if obj, ok := payload[parent].(map[string]any); ok {
		return stringField(obj, child)
	}
	return ""
}

func cacheEntryLabel(key, source string) string {
	short := key
	if len(short) > 18 {
		short = short[len(short)-18:]
	}
	return fmt.Sprintf("%s cache %s", source, short)
}

func ttlScore(ttlSeconds int64) float64 {
	if ttlSeconds <= 0 {
		return 0
	}
	score := float64(ttlSeconds) / float64(plannerCacheTTL/time.Second)
	if score > 1 {
		return 1
	}
	return score
}

func formatBytes(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := int64(unit), 0
	for v := n / unit; v >= unit; v /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(n)/float64(div), "KMGTPE"[exp])
}

// DELETE /admin/planner/cache
// Flushes all planner cache keys. Also forwards to planner-ai if in LLM mode.
func (h *PlannerHandler) FlushCache(c *gin.Context) {
	if h.redis == nil && !(h.useLLM && h.plannerAIURL != "") {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Redis not configured"})
		return
	}

	ctx := c.Request.Context()
	var deleted int64
	if h.redis != nil {
		pattern := plannerCachePrefix + "*"

		var cursor uint64
		for {
			keys, next, err := h.redis.Scan(ctx, cursor, pattern, 100).Result()
			if err != nil {
				respondInternalError(c, err)
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
	}

	var plannerAIDeleted int64
	var plannerAIError string
	// Also flush Python service cache when in LLM mode
	if h.useLLM && h.plannerAIURL != "" {
		req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, h.plannerAIURL+"/cache/plans", nil)
		if token := strings.TrimSpace(os.Getenv("CACHE_ADMIN_TOKEN")); token != "" {
			req.Header.Set("X-Admin-Token", token)
		}
		resp, err := h.httpClient.Do(req)
		if err != nil {
			plannerAIError = "planner-ai cache flush unavailable"
		} else {
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				plannerAIError = "planner-ai cache flush unavailable"
			} else {
				var payload struct {
					Deleted int64 `json:"deleted"`
					Plans   int64 `json:"plans"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil {
					plannerAIDeleted = payload.Deleted
					if payload.Plans > 0 {
						plannerAIDeleted = payload.Plans
					}
				}
			}
		}
	}

	totalDeleted := deleted + plannerAIDeleted
	payload := gin.H{
		"deleted":            totalDeleted,
		"go_deleted":         deleted,
		"planner_ai_deleted": plannerAIDeleted,
		"message":            fmt.Sprintf("Flushed %d planner cache keys (mode: %s)", totalDeleted, h.mode()),
	}
	if plannerAIError != "" {
		payload["planner_ai_error"] = plannerAIError
	}
	c.JSON(http.StatusOK, payload)
}

// DELETE /admin/planner/cache/key?key=...
// Deletes a single planner cache key. Only known planner cache prefixes are accepted.
func (h *PlannerHandler) DeleteCacheKey(c *gin.Context) {
	key := strings.TrimSpace(c.Query("key"))
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing cache key"})
		return
	}

	ctx := c.Request.Context()
	var deleted int64

	switch {
	case strings.HasPrefix(key, plannerCachePrefix):
		if h.redis == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Redis not configured"})
			return
		}
		n, err := h.redis.Del(ctx, key).Result()
		if err != nil {
			respondInternalError(c, err)
			return
		}
		deleted = n

	case strings.HasPrefix(key, plannerAICachePrefix):
		if !(h.useLLM && h.plannerAIURL != "") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Planner AI cache is not enabled"})
			return
		}
		n, err := h.deletePlannerAICacheKey(ctx, key)
		if err != nil {
			respondInternalError(c, err)
			return
		}
		deleted = n

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported planner cache key"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"deleted": deleted,
		"key":     key,
		"message": fmt.Sprintf("Deleted %d planner cache key", deleted),
	})
}

func (h *PlannerHandler) deletePlannerAICacheKey(ctx context.Context, key string) (int64, error) {
	u, err := url.Parse(h.plannerAIURL + "/cache/key")
	if err != nil {
		return 0, err
	}
	q := u.Query()
	q.Set("key", key)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, u.String(), nil)
	if err != nil {
		return 0, err
	}
	if token := strings.TrimSpace(os.Getenv("CACHE_ADMIN_TOKEN")); token != "" {
		req.Header.Set("X-Admin-Token", token)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("planner-ai delete cache key unavailable")
	}

	var payload struct {
		Deleted int64 `json:"deleted"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return 0, err
	}
	return payload.Deleted, nil
}
