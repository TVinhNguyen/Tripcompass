-- 0002_collaborator_pending_invites.sql
--
-- Allow inviting collaborators by email even when the invitee has no account
-- yet. The pending row carries the email; auth.Register attaches it to the
-- new user (and clears the email column) on registration.
--
-- Run order: after 0001 (initial schema).

BEGIN;

SET search_path TO "schema_travel";

-- 1. user_id is no longer mandatory.
ALTER TABLE "collaborators"
    ALTER COLUMN "user_id" DROP NOT NULL;

-- 2. New email column for pending-by-email invites.
ALTER TABLE "collaborators"
    ADD COLUMN IF NOT EXISTS "email" TEXT;

-- 3. At least one of (user_id, email) must be present. Anything else would be
-- a zombie row that no one can claim.
ALTER TABLE "collaborators"
    ADD CONSTRAINT collaborators_invitee_present
        CHECK (user_id IS NOT NULL OR email IS NOT NULL);

-- 4. Block re-inviting the same email twice on the same itinerary.
CREATE UNIQUE INDEX IF NOT EXISTS collaborators_pending_email_uniq
    ON "collaborators" (itinerary_id, lower(email))
    WHERE email IS NOT NULL;

COMMIT;
