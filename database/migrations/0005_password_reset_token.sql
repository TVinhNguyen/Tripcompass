-- Migration 0005 — Password-reset token columns.
--
-- Background: /auth/forgot-password + /auth/reset-password need a one-shot
-- token tied to the user. The existing verify_token column is reserved for
-- 6-digit email-verification OTPs; reset tokens are 64-char hex (32 random
-- bytes) and shouldn't share storage / expiry semantics.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) so re-applying on an environment
-- that already ran the gormigrate counterpart in migrate.go is a no-op.

SET search_path TO "schema_travel";

ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "reset_token" VARCHAR(128),
    ADD COLUMN IF NOT EXISTS "reset_token_expires_at" TIMESTAMP WITH TIME ZONE;

-- Partial index: only active (non-NULL) reset tokens get indexed, so the
-- lookup hits exactly the rows that matter. Drops automatically when the
-- token is cleared after a successful reset.
CREATE INDEX IF NOT EXISTS "idx_users_reset_token"
    ON "users" ("reset_token")
    WHERE "reset_token" IS NOT NULL;
