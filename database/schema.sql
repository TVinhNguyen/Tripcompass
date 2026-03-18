CREATE SCHEMA IF NOT EXISTS "schema_travel";
SET search_path TO "schema_travel";

-- Enums
CREATE TYPE "budget_category" AS ENUM ('BUDGET', 'MODERATE', 'LUXURY');
CREATE TYPE "category" AS ENUM ('FOOD', 'LODGING', 'TRANSPORT', 'ATTRACTION');
CREATE TYPE "provider" AS ENUM ('local', 'google', 'facebook');
CREATE TYPE "role" AS ENUM ('EDITOR', 'VIEWER');
CREATE TYPE "role_ai_chat_message" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "status" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "status_collab" AS ENUM ('PENDING', 'ACCEPTED');

-- Tables
CREATE TABLE "users" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "password_hash" VARCHAR(255),
  "full_name" VARCHAR(255) NOT NULL,
  "avatar_url" VARCHAR(255),
  "provider" "provider" NOT NULL DEFAULT 'local',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "itineraries" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "destination" VARCHAR(255) NOT NULL,
  "budget" NUMERIC NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "status" "status" NOT NULL DEFAULT 'DRAFT',
  "cover_image_url" TEXT,
  "rating" REAL NOT NULL DEFAULT 0,
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "clone_count" INTEGER NOT NULL DEFAULT 0,
  "cloned_from_id" UUID,
  "guest_count" INTEGER NOT NULL DEFAULT 1,
  "tags" TEXT[] DEFAULT '{}',
  "budget_category" "budget_category" NOT NULL DEFAULT 'MODERATE',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "activities" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "itinerary_id" UUID NOT NULL,
  "day_number" INTEGER NOT NULL,
  "order_index" INTEGER NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "category" "category" NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "estimated_cost" NUMERIC NOT NULL DEFAULT 0,
  "start_time" TIME,
  "end_time" TIME,
  "image_url" VARCHAR(255),
  "notes" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "collaborators" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "itinerary_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "invited_by" UUID NOT NULL,
  "role" "role" NOT NULL DEFAULT 'VIEWER',
  "status" "status_collab" NOT NULL DEFAULT 'PENDING',
  "joined_at" TIMESTAMP
);

CREATE TABLE "ai_chat_messages" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "itinerary_id" UUID NOT NULL,
  "role" "role_ai_chat_message" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Foreign Keys (đúng chiều)
ALTER TABLE "itineraries"
  ADD CONSTRAINT "fk_itineraries_owner" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "itineraries"
  ADD CONSTRAINT "fk_itineraries_cloned" FOREIGN KEY ("cloned_from_id") REFERENCES "itineraries" ("id") ON DELETE SET NULL;

ALTER TABLE "activities"
  ADD CONSTRAINT "fk_activities_itinerary" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries" ("id") ON DELETE CASCADE;

ALTER TABLE "collaborators"
  ADD CONSTRAINT "fk_collaborators_itinerary" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries" ("id") ON DELETE CASCADE;

ALTER TABLE "collaborators"
  ADD CONSTRAINT "fk_collaborators_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "collaborators"
  ADD CONSTRAINT "fk_collaborators_invited_by" FOREIGN KEY ("invited_by") REFERENCES "users" ("id");

ALTER TABLE "ai_chat_messages"
  ADD CONSTRAINT "fk_chat_itinerary" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries" ("id") ON DELETE CASCADE;