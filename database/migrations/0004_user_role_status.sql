-- Migration 0004 — Per-user role/status for admin UI.
--
-- Background: the admin Users page wants to suspend accounts and promote
-- editors. Previously, "is admin" was derived at runtime from ADMIN_EMAILS
-- only — there was no way to demote an admin who left the company without
-- redeploying, and no way to suspend a misbehaving user without deleting
-- the row.
--
-- This migration adds two columns:
--   role   : 'user' | 'editor' | 'admin'
--   status : 'active' | 'suspended'
--
-- Values stored as VARCHAR + CHECK (not Postgres ENUM) because the existing
-- `role` ENUM in this schema is already taken by the collaborator type
-- (EDITOR/VIEWER) — keeping VARCHAR sidesteps the rename dance.
--
-- ADMIN_EMAILS backfill happens at app startup (AuthService.boot), not here:
-- the env var isn't visible to SQL, and we want the backfill to re-run if
-- the allowlist changes between deploys.

SET search_path TO "schema_travel";

ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE "users"
    DROP CONSTRAINT IF EXISTS "users_role_check",
    ADD CONSTRAINT "users_role_check" CHECK (role IN ('user', 'editor', 'admin'));

ALTER TABLE "users"
    DROP CONSTRAINT IF EXISTS "users_status_check",
    ADD CONSTRAINT "users_status_check" CHECK (status IN ('active', 'suspended'));

CREATE INDEX IF NOT EXISTS "idx_users_role"   ON "users" ("role");
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users" ("status");
