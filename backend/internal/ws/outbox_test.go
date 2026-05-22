package ws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ─── Test infra ──────────────────────────────────────────────────────────────

// setupOutboxDB returns a gorm handle bound to the test Postgres + the
// outbox table created. Tests that can't reach Postgres (CI without service
// container) call t.Skip — the existing services tests follow the same
// convention.
func setupOutboxDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		envOr("TEST_DB_HOST", "localhost"),
		envOr("TEST_DB_PORT", "5432"),
		envOr("TEST_DB_USER", "postgres"),
		envOr("TEST_DB_PASSWORD", "postgres"),
		envOr("TEST_DB_NAME", "tripcompass_test"),
	)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Skipf("postgres unavailable for outbox tests: %v", err)
	}
	if err := db.AutoMigrate(&OutboxRow{}); err != nil {
		t.Fatalf("migrate outbox: %v", err)
	}
	t.Cleanup(func() { db.Exec("TRUNCATE TABLE outbox") })
	return db
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// fakePub records every PublishEvent call so tests can assert what was
// dispatched. Behaviour can be flipped to fail via failNext (returns
// acked=false + error — the real failure mode of the production Publisher
// when Redis publish errors) or panicNow (covers safeDispatch's panic
// recovery path).
type fakePub struct {
	mu       sync.Mutex
	calls    []fakeCall
	failNext int
	panicNow bool
}

type fakeCall struct {
	RoomID    string
	EventType string
	Payload   string
}

func (f *fakePub) PublishEvent(roomID, eventType string, payload any) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.panicNow {
		f.panicNow = false
		panic("intentional panic in publisher")
	}
	if f.failNext > 0 {
		f.failNext--
		return false, errors.New("synthetic dispatch failure")
	}
	body, _ := json.Marshal(payload)
	f.calls = append(f.calls, fakeCall{RoomID: roomID, EventType: eventType, Payload: string(body)})
	return true, nil
}

func (f *fakePub) PublishToUser(_ string, _ string, _ any) (bool, error) {
	return true, nil
}
func (f *fakePub) PublishInTx(_ *gorm.DB, _, _ string, _ any) error {
	return nil
}
func (f *fakePub) PublishToUserInTx(_ *gorm.DB, _, _ string, _ any) error {
	return nil
}

// ─── Tests ───────────────────────────────────────────────────────────────────

func TestEnqueueAndDrainOnce(t *testing.T) {
	db := setupOutboxDB(t)

	// Enqueue inside a transaction (mirrors the handler call path).
	err := db.Transaction(func(tx *gorm.DB) error {
		return Enqueue(tx, "activity.created", "room-1", map[string]any{"hello": "world"})
	})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	var before int64
	db.Model(&OutboxRow{}).Where("dispatched_at IS NULL").Count(&before)
	if before != 1 {
		t.Fatalf("want 1 pending row, got %d", before)
	}

	pub := &fakePub{}
	w := NewWorker(db, pub, 0, 0)
	if err := w.DrainOnce(context.Background()); err != nil {
		t.Fatalf("DrainOnce: %v", err)
	}

	if len(pub.calls) != 1 {
		t.Fatalf("want 1 dispatch, got %d", len(pub.calls))
	}
	if pub.calls[0].RoomID != "room-1" || pub.calls[0].EventType != "activity.created" {
		t.Fatalf("unexpected dispatch: %+v", pub.calls[0])
	}

	var after int64
	db.Model(&OutboxRow{}).Where("dispatched_at IS NULL").Count(&after)
	if after != 0 {
		t.Fatalf("want 0 pending after drain, got %d", after)
	}
}

func TestDrainRetryOnFailure(t *testing.T) {
	db := setupOutboxDB(t)

	if err := db.Transaction(func(tx *gorm.DB) error {
		return Enqueue(tx, "activity.updated", "room-x", map[string]any{"x": 1})
	}); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	pub := &fakePub{failNext: 2}
	w := NewWorker(db, pub, 0, 0)

	for i := 0; i < 2; i++ {
		if err := w.DrainOnce(context.Background()); err != nil {
			t.Fatalf("DrainOnce attempt %d: %v", i+1, err)
		}
	}

	// After two failures the row should still be pending with retry_count=2
	// and last_error populated.
	var row OutboxRow
	if err := db.Where("dispatched_at IS NULL").First(&row).Error; err != nil {
		t.Fatalf("row should still be pending: %v", err)
	}
	if row.RetryCount != 2 {
		t.Fatalf("want retry_count=2, got %d", row.RetryCount)
	}
	if row.LastError == nil || *row.LastError == "" {
		t.Fatalf("want last_error populated, got %v", row.LastError)
	}

	// Third drain succeeds.
	if err := w.DrainOnce(context.Background()); err != nil {
		t.Fatalf("DrainOnce final: %v", err)
	}
	var pending int64
	db.Model(&OutboxRow{}).Where("dispatched_at IS NULL").Count(&pending)
	if pending != 0 {
		t.Fatalf("row still pending after success drain")
	}
}

func TestDrainGivesUpAfterMaxRetries(t *testing.T) {
	db := setupOutboxDB(t)

	if err := db.Transaction(func(tx *gorm.DB) error {
		return Enqueue(tx, "activity.updated", "room-y", map[string]any{})
	}); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	// Always-failing publisher.
	pub := &fakePub{failNext: 99}
	w := NewWorker(db, pub, 0, 0)
	for i := 0; i < MaxRetries; i++ {
		_ = w.DrainOnce(context.Background())
	}

	var row OutboxRow
	if err := db.First(&row, "room_id = ?", "room-y").Error; err != nil {
		t.Fatalf("row missing: %v", err)
	}
	if row.DispatchedAt == nil {
		t.Fatalf("worker should give up and mark dispatched_at after MaxRetries")
	}
	if row.RetryCount < MaxRetries {
		t.Fatalf("retry_count=%d, want >= %d", row.RetryCount, MaxRetries)
	}
}

func TestEnqueueRequiresTransaction(t *testing.T) {
	if err := Enqueue(nil, "x", "y", nil); err == nil {
		t.Fatal("Enqueue(nil, ...) should reject nil transaction")
	}
}

func TestWorkerStartCancelsCleanly(t *testing.T) {
	db := setupOutboxDB(t)
	w := NewWorker(db, &fakePub{}, 0, 10*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { w.Start(ctx); close(done) }()
	cancel()
	select {
	case <-done:
		// ok
	case <-time.After(time.Second):
		t.Fatal("Start did not return after ctx cancel")
	}
}
