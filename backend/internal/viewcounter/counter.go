package viewcounter

// counter.go — Redis-buffered view counter to prevent hot-row writes on every GET.
//
// Strategy:
//   - INCR itinerary_views:<id> in Redis on each view (O(1), no DB write)
//   - A background goroutine flushes accumulated counts to DB every FlushInterval
//   - If Redis is unavailable, falls back to direct DB write (degraded mode)

import (
	"context"
	"log/slog"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	keyPrefix     = "itinerary_views:"
	dedupePrefix  = "itinerary_view_dedupe:"
	dedupeTTL     = 1 * time.Hour // one viewerKey counts at most once per hour
	FlushInterval = 30 * time.Second
)

// Counter is a Redis-backed buffered view counter.
type Counter struct {
	rdb *redis.Client
	db  *gorm.DB
}

// New creates a Counter. If rdb is nil, every RecordView falls back to a direct DB write.
func New(rdb *redis.Client, db *gorm.DB) *Counter {
	return &Counter{rdb: rdb, db: db}
}

// RecordView increments the view count for itineraryID at most once per
// dedupeTTL window per viewerKey. viewerKey is the caller's IP or user ID —
// anything stable enough to suppress refresh-spam bots inflating popularity.
// Pass "" to skip dedupe (e.g. internal/test paths).
//
// Fast path: Redis SET NX → INCR. Fallback: direct DB UPDATE without dedupe
// (the in-memory degraded mode trades dedupe for "still works without Redis").
func (c *Counter) RecordView(ctx context.Context, itineraryID, viewerKey string) {
	if c.rdb == nil {
		c.directIncrement(itineraryID)
		return
	}
	if viewerKey != "" {
		dk := dedupePrefix + itineraryID + ":" + viewerKey
		ok, err := c.rdb.SetNX(ctx, dk, 1, dedupeTTL).Result()
		if err != nil {
			slog.Warn("viewcounter: redis SETNX failed, counting view anyway", "id", itineraryID, "err", err)
		} else if !ok {
			return // already counted within window
		}
	}
	key := keyPrefix + itineraryID
	if err := c.rdb.Incr(ctx, key).Err(); err != nil {
		slog.Warn("viewcounter: redis INCR failed, falling back to direct write", "id", itineraryID, "err", err)
		c.directIncrement(itineraryID)
	}
}

// directIncrement writes +1 directly to DB (fallback / no-Redis mode).
func (c *Counter) directIncrement(id string) {
	c.db.Exec(`UPDATE itineraries SET view_count = view_count + 1 WHERE id = ?`, id)
}

// StartFlusher runs a background goroutine that periodically flushes Redis counters to DB.
// Call this once after app startup. Stop by cancelling ctx.
func (c *Counter) StartFlusher(ctx context.Context) {
	if c.rdb == nil {
		return // no Redis, nothing to flush
	}
	go func() {
		ticker := time.NewTicker(FlushInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				// Final flush on shutdown
				c.flush(context.Background())
				return
			case <-ticker.C:
				c.flush(ctx)
			}
		}
	}()
}

// flush scans for all pending view keys, reads + deletes them, and writes to DB.
func (c *Counter) flush(ctx context.Context) {
	var cursor uint64
	for {
		keys, next, err := c.rdb.Scan(ctx, cursor, keyPrefix+"*", 100).Result()
		if err != nil {
			slog.Warn("viewcounter: SCAN failed during flush", "err", err)
			return
		}
		for _, key := range keys {
			id := key[len(keyPrefix):]
			// GETDEL: atomically read and remove the counter
			val, err := c.rdb.GetDel(ctx, key).Result()
			if err != nil {
				slog.Warn("viewcounter: GETDEL failed", "key", key, "err", err)
				continue
			}
			count, err := strconv.ParseInt(val, 10, 64)
			if err != nil || count == 0 {
				continue
			}
			if res := c.db.Exec(
				`UPDATE itineraries SET view_count = view_count + ? WHERE id = ?`,
				count, id,
			); res.Error != nil {
				slog.Warn("viewcounter: DB flush failed", "id", id, "count", count, "err", res.Error)
				// Re-add to Redis so we don't lose the count permanently
				c.rdb.IncrBy(ctx, keyPrefix+id, count)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}
