package ws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// OutboxRow mirrors the `outbox` table created by migration 0003.
//
// gorm:"table:outbox" is set explicitly to avoid the default pluralisation
// rules pointing at a non-existent "outbox" table on case-sensitive DBs.
type OutboxRow struct {
	ID           string          `gorm:"type:uuid;primaryKey;column:id" json:"id"`
	EventType    string          `gorm:"column:event_type;not null" json:"event_type"`
	RoomID       string          `gorm:"column:room_id;not null" json:"room_id"`
	Payload      json.RawMessage `gorm:"column:payload;type:jsonb;not null" json:"payload"`
	CreatedAt    time.Time       `gorm:"column:created_at;not null;default:now()" json:"created_at"`
	DispatchedAt *time.Time      `gorm:"column:dispatched_at" json:"dispatched_at,omitempty"`
	RetryCount   int             `gorm:"column:retry_count;not null;default:0" json:"retry_count"`
	LastError    *string         `gorm:"column:last_error" json:"last_error,omitempty"`
}

func (OutboxRow) TableName() string { return "outbox" }

// MaxRetries is how many times the worker re-tries a failing event before
// giving up and marking it dispatched (with last_error populated for ops).
const MaxRetries = 5

// Enqueue writes an event into the outbox inside the caller's transaction.
// The Publisher fallback uses this when invoked via PublishInTx.
func Enqueue(tx *gorm.DB, eventType, roomID string, payload any) error {
	if tx == nil {
		return errors.New("outbox: nil transaction")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("outbox: marshal payload: %w", err)
	}
	row := OutboxRow{
		ID:        uuid.NewString(),
		EventType: eventType,
		RoomID:    roomID,
		Payload:   body,
	}
	return tx.Create(&row).Error
}

// Worker drains pending outbox rows and broadcasts them through a Publisher.
// One Worker per process is fine — the SELECT ... FOR UPDATE SKIP LOCKED
// claim lets multiple instances coexist without double-dispatching.
type Worker struct {
	db        *gorm.DB
	pub       Publisher
	batchSize int
	interval  time.Duration
}

// NewWorker returns a Worker that polls every `interval` (default 2s) and
// processes up to `batchSize` rows per tick (default 100). interval=0 uses
// the default; batchSize=0 uses the default.
func NewWorker(db *gorm.DB, pub Publisher, batchSize int, interval time.Duration) *Worker {
	if batchSize <= 0 {
		batchSize = 100
	}
	if interval <= 0 {
		interval = 2 * time.Second
	}
	return &Worker{db: db, pub: pub, batchSize: batchSize, interval: interval}
}

// Start kicks the polling loop. Returns when ctx is cancelled. Safe to call
// once at server boot; tests call DrainOnce directly instead.
func (w *Worker) Start(ctx context.Context) {
	t := time.NewTicker(w.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := w.DrainOnce(ctx); err != nil {
				slog.Warn("outbox: drain failed", "err", err)
			}
		}
	}
}

// DrainOnce processes one batch of pending rows. Exposed so tests can run
// the worker deterministically without needing the ticker.
func (w *Worker) DrainOnce(ctx context.Context) error {
	if w.db == nil || w.pub == nil {
		return nil
	}
	return w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var rows []OutboxRow
		// FOR UPDATE SKIP LOCKED makes multi-instance dispatch safe: each
		// worker claims a disjoint slice of pending rows for the duration
		// of this transaction.
		err := tx.
			Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("dispatched_at IS NULL").
			Order("created_at ASC").
			Limit(w.batchSize).
			Find(&rows).Error
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}

		now := time.Now()
		for i := range rows {
			r := &rows[i]
			// Each broadcast is wrapped so a per-row panic doesn't kill the
			// whole batch; we still update the row's retry / last_error.
			err := safeDispatch(w.pub, r)
			if err == nil {
				if uerr := tx.Model(r).Updates(map[string]any{
					"dispatched_at": now,
					"last_error":    nil,
				}).Error; uerr != nil {
					slog.Warn("outbox: mark dispatched failed", "id", r.ID, "err", uerr)
				}
				continue
			}

			updates := map[string]any{
				"retry_count": gorm.Expr("retry_count + 1"),
				"last_error":  err.Error(),
			}
			// Give up after MaxRetries so a poison row doesn't loop forever.
			// last_error is preserved so ops can investigate.
			if r.RetryCount+1 >= MaxRetries {
				updates["dispatched_at"] = now
				slog.Warn("outbox: giving up", "id", r.ID, "retries", r.RetryCount+1, "err", err)
			}
			if uerr := tx.Model(r).Updates(updates).Error; uerr != nil {
				slog.Warn("outbox: mark retry failed", "id", r.ID, "err", uerr)
			}
		}
		return nil
	})
}

func safeDispatch(pub Publisher, r *OutboxRow) (err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("panic during dispatch: %v", rec)
		}
	}()
	pub.PublishEvent(r.RoomID, r.EventType, json.RawMessage(r.Payload))
	return nil
}
