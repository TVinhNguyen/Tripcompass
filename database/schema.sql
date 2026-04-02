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

CREATE TYPE "place_category" AS ENUM ('ATTRACTION', 'FOOD', 'STAY');

-- Tables
CREATE TABLE "users" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid (),
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "password_hash" VARCHAR(255),
    "full_name" VARCHAR(255) NOT NULL,
    "avatar_url" VARCHAR(255),
    "provider" "provider" NOT NULL DEFAULT 'local',
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "itineraries" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid (),
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
    "tags" TEXT [] DEFAULT '{}',
    "budget_category" "budget_category" NOT NULL DEFAULT 'MODERATE',
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "activities" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid (),
    "itinerary_id" UUID NOT NULL,
    "place_id" UUID,
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
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid (),
    "itinerary_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "invited_by" UUID NOT NULL,
    "role" "role" NOT NULL DEFAULT 'VIEWER',
    "status" "status_collab" NOT NULL DEFAULT 'PENDING',
    "joined_at" TIMESTAMP
);

CREATE TABLE "ai_chat_messages" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid (),
    "itinerary_id" UUID NOT NULL,
    "role" "role_ai_chat_message" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "places" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid (),
    "destination" VARCHAR(255) NOT NULL,
    "category" "place_category" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_en" VARCHAR(255),
    "address" TEXT,
    "area" VARCHAR(255),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "cover_image" TEXT,
    "rating" DOUBLE PRECISION,
    "hours" TEXT,
    "recommended_duration" INTEGER,
    "base_price" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "source_url" TEXT,
    "price_updated_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "user_saved_places" (
    "user_id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "saved_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("user_id", "place_id")
);

CREATE TABLE "combos" (
    "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid (),
    "destination" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "cover_image" TEXT,
    "provider" VARCHAR(255),
    "price_per_person" INTEGER,
    "includes" TEXT [] DEFAULT '{}',
    "benefits" TEXT [] DEFAULT '{}',
    "duration_days" INTEGER,
    "requires_overnight" BOOLEAN NOT NULL DEFAULT FALSE,
    "book_url" TEXT,
    "price_updated_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_place_dest" ON "places" ("destination");

CREATE INDEX "idx_place_dest_cat" ON "places" ("destination", "category");

CREATE INDEX "idx_place_area" ON "places" ("area");

CREATE INDEX "idx_place_coords" ON "places" ("latitude", "longitude");

CREATE INDEX "idx_place_rating" ON "places" ("rating");

CREATE INDEX "idx_combo_dest" ON "combos" ("destination");

CREATE INDEX "idx_combo_dest_price" ON "combos" (
    "destination",
    "price_per_person"
);

-- Foreign Keys (đúng chiều)
ALTER TABLE "itineraries"
ADD CONSTRAINT "fk_itineraries_owner" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "itineraries"
ADD CONSTRAINT "fk_itineraries_cloned" FOREIGN KEY ("cloned_from_id") REFERENCES "itineraries" ("id") ON DELETE SET NULL;

ALTER TABLE "activities"
ADD CONSTRAINT "fk_activities_itinerary" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries" ("id") ON DELETE CASCADE;

ALTER TABLE "activities"
ADD CONSTRAINT "fk_activities_place" FOREIGN KEY ("place_id") REFERENCES "places" ("id") ON DELETE SET NULL;

ALTER TABLE "activities"
ADD CONSTRAINT "uq_activity_order" UNIQUE (
    "itinerary_id",
    "day_number",
    "order_index"
);

ALTER TABLE "collaborators"
ADD CONSTRAINT "fk_collaborators_itinerary" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries" ("id") ON DELETE CASCADE;

ALTER TABLE "collaborators"
ADD CONSTRAINT "fk_collaborators_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "collaborators"
ADD CONSTRAINT "fk_collaborators_invited_by" FOREIGN KEY ("invited_by") REFERENCES "users" ("id");

ALTER TABLE "ai_chat_messages"
ADD CONSTRAINT "fk_chat_itinerary" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries" ("id") ON DELETE CASCADE;

ALTER TABLE "user_saved_places"
ADD CONSTRAINT "fk_saved_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "user_saved_places"
ADD CONSTRAINT "fk_saved_place" FOREIGN KEY ("place_id") REFERENCES "places" ("id") ON DELETE CASCADE;