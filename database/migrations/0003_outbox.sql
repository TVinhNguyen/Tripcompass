-- 0003_outbox.sql
--
-- Transactional outbox for WebSocket broadcasts. Handlers write the event
-- into this table inside the same DB transaction as the underlying mutation;
-- a background worker drains the table and fans the event out to the hub +
-- Redis pubsub. A crash between commit and broadcast is harmless — the
-- event is still queued and will dispatch on the next worker tick.
--
-- Run order: after 0002.

BEGIN;

SET search_path TO "schema_travel";

CREATE TABLE IF NOT EXISTS "outbox" (
    "id"            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Event payload routing
    "event_type"    TEXT         NOT NULL,
    "room_id"       TEXT         NOT NULL,  -- itinerary id OR "user:<id>"
    "payload"       JSONB        NOT NULL,
    -- Lifecycle
    "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "dispatched_at" TIMESTAMPTZ,
    "retry_count"   INT          NOT NULL DEFAULT 0,
    "last_error"    TEXT
);

-- Partial index keeps the worker's poll cheap — only ever scans pending rows.
CREATE INDEX IF NOT EXISTS outbox_pending_idx
    ON "outbox" (created_at)
    WHERE dispatched_at IS NULL;

COMMIT;
