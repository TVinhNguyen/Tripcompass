package database

import (
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

func Migrate(db *gorm.DB) error {
	m := gormigrate.New(db, gormigrate.DefaultOptions, []*gormigrate.Migration{
		{
			// Baseline: database was initialized by database/schema.sql.
			ID: "202604020001_baseline",
			Migrate: func(tx *gorm.DB) error {
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			// Forward migration example: keep idempotent for existing environments.
			ID: "202604020002_activity_place_constraints",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`ALTER TABLE activities ADD COLUMN IF NOT EXISTS place_id UUID;`,
					`DO $$
BEGIN
	IF to_regclass('places') IS NOT NULL
	   AND to_regclass('activities') IS NOT NULL
	   AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_activities_place') THEN
        ALTER TABLE activities
        ADD CONSTRAINT fk_activities_place
        FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL;
    END IF;
END $$;`,
					`DO $$
BEGIN
	IF to_regclass('activities') IS NOT NULL
	   AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_activity_order') THEN
        ALTER TABLE activities
        ADD CONSTRAINT uq_activity_order UNIQUE (itinerary_id, day_number, order_index);
    END IF;
END $$;`,
				}

				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}

				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			// Add images column to places table.
			ID: "202604020003_add_images_to_places",
			Migrate: func(tx *gorm.DB) error {
				return tx.Exec(`ALTER TABLE places ADD COLUMN IF NOT EXISTS images text[];`).Error
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			// Add planner fields to places table.
			ID: "202604040004_add_planner_fields_to_places",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`ALTER TABLE places ADD COLUMN IF NOT EXISTS must_visit boolean NOT NULL DEFAULT false;`,
					`ALTER TABLE places ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 0;`,
					`ALTER TABLE places ADD COLUMN IF NOT EXISTS best_time_of_day varchar(20) DEFAULT 'any';`,
					`ALTER TABLE places ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';`,
					`ALTER TABLE places ADD COLUMN IF NOT EXISTS open_time time without time zone;`,
					`ALTER TABLE places ADD COLUMN IF NOT EXISTS close_time time without time zone;`,
					`CREATE INDEX IF NOT EXISTS idx_place_must_visit ON places (must_visit) WHERE must_visit = true;`,
					`CREATE INDEX IF NOT EXISTS idx_place_priority ON places (destination, priority_score DESC);`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			// Add destination_neighbors and place_seasons tables for day-trip logic.
			ID: "202604110005_add_day_trip_tables",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					// destination_neighbors: maps a base destination to a nearby day-trip destination
					`CREATE TABLE IF NOT EXISTS schema_travel.destination_neighbors (
						id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						destination   TEXT NOT NULL,
						neighbor      TEXT NOT NULL,
						travel_min_ow INT  NOT NULL,
						trip_type     VARCHAR(20) NOT NULL DEFAULT 'day_trip',
						min_trip_days INT NOT NULL DEFAULT 4,
						notes         TEXT
					);`,
					`CREATE INDEX IF NOT EXISTS idx_dn_dest
						ON schema_travel.destination_neighbors (destination);`,

					// place_seasons: months a place is open (empty row = year-round)
					`CREATE TABLE IF NOT EXISTS schema_travel.place_seasons (
						id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
						place_id    UUID      NOT NULL REFERENCES schema_travel.places(id) ON DELETE CASCADE,
						open_months INTEGER[] NOT NULL,
						notes       TEXT
					);`,
					`CREATE INDEX IF NOT EXISTS idx_ps_place
						ON schema_travel.place_seasons (place_id);`,

					// Seed: Đà Nẵng neighbors
					`INSERT INTO schema_travel.destination_neighbors
						(destination, neighbor, travel_min_ow, trip_type, min_trip_days, notes)
					VALUES
						('đà nẵng', 'hội an',    60,  'day_trip',  4, '30km south, scenic coastal road'),
						('đà nẵng', 'mỹ sơn',    75,  'half_day',  6, 'UNESCO sanctuary 70km southwest'),
						('đà nẵng', 'cù lao chàm', 120, 'day_trip', 7, 'Boat required, seasonal Mar-Aug'),
						('đà nẵng', 'huế',       120, 'day_trip',  7, 'Hai Van Pass route 100km north')
					ON CONFLICT DO NOTHING;`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				sqls := []string{
					`DROP TABLE IF EXISTS schema_travel.place_seasons;`,
					`DROP TABLE IF EXISTS schema_travel.destination_neighbors;`,
				}
				for _, q := range sqls {
					_ = tx.Exec(q).Error
				}
				return nil
			},
		},
		{
			ID: "202604150006_auth_enhancements",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`ALTER TABLE schema_travel.users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;`,
					`ALTER TABLE schema_travel.users ADD COLUMN IF NOT EXISTS verify_token VARCHAR(64);`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP COLUMN IF EXISTS is_verified;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP COLUMN IF EXISTS verify_token;`).Error
				return nil
			},
		},
		{
			// C6: Add verify_token_expires_at so email verification tokens expire after 24h.
			ID: "202604300007_verify_token_expiry",
			Migrate: func(tx *gorm.DB) error {
				return tx.Exec(`ALTER TABLE schema_travel.users
					ADD COLUMN IF NOT EXISTS verify_token_expires_at TIMESTAMPTZ;`).Error
			},
			Rollback: func(tx *gorm.DB) error {
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP COLUMN IF EXISTS verify_token_expires_at;`).Error
				return nil
			},
		},
		{
			// AI Planner chat sessions are persisted per user; Redis remains short-term working memory.
			ID: "202605060008_ai_chat_sessions",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`CREATE TABLE IF NOT EXISTS schema_travel.ai_chat_sessions (
						id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						user_id UUID NOT NULL REFERENCES schema_travel.users(id) ON DELETE CASCADE,
						title TEXT NOT NULL,
						destination TEXT,
						message_count INTEGER NOT NULL DEFAULT 0,
						saved_itinerary_id UUID REFERENCES schema_travel.itineraries(id) ON DELETE SET NULL,
						created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
						updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
					);`,
					`CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_user_updated
						ON schema_travel.ai_chat_sessions (user_id, updated_at DESC);`,
					`ALTER TABLE schema_travel.ai_chat_messages
						ADD COLUMN IF NOT EXISTS session_id UUID;`,
					`ALTER TABLE schema_travel.ai_chat_messages
						ALTER COLUMN itinerary_id DROP NOT NULL;`,
					`DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_session') THEN
		ALTER TABLE schema_travel.ai_chat_messages
		ADD CONSTRAINT fk_chat_session
		FOREIGN KEY (session_id) REFERENCES schema_travel.ai_chat_sessions(id) ON DELETE CASCADE;
	END IF;
END $$;`,
					`CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_created
						ON schema_travel.ai_chat_messages (session_id, created_at ASC);`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			// GIN indexes on tags arrays for `tags && ARRAY[...]` overlap queries
			// used by /places and /explore filter (services/place.go, services/itinerary.go).
			ID: "202605070009_tags_gin_index",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`CREATE INDEX IF NOT EXISTS idx_places_tags_gin
						ON schema_travel.places USING GIN (tags);`,
					`CREATE INDEX IF NOT EXISTS idx_itineraries_tags_gin
						ON schema_travel.itineraries USING GIN (tags);`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				return nil
			},
		},
		{
			// E: Pending collaborator invites by email. user_id is no longer
			// mandatory; email holds the address until LinkPendingInvites runs.
			ID: "202605110010_collaborator_pending_invites",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`ALTER TABLE schema_travel.collaborators
						ALTER COLUMN user_id DROP NOT NULL;`,
					`ALTER TABLE schema_travel.collaborators
						ADD COLUMN IF NOT EXISTS email TEXT;`,
					`DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collaborators_invitee_present') THEN
		ALTER TABLE schema_travel.collaborators
		ADD CONSTRAINT collaborators_invitee_present
			CHECK (user_id IS NOT NULL OR email IS NOT NULL);
	END IF;
END $$;`,
					`CREATE UNIQUE INDEX IF NOT EXISTS collaborators_pending_email_uniq
						ON schema_travel.collaborators (itinerary_id, lower(email))
						WHERE email IS NOT NULL;`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				_ = tx.Exec(`DROP INDEX IF EXISTS schema_travel.collaborators_pending_email_uniq;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.collaborators DROP CONSTRAINT IF EXISTS collaborators_invitee_present;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.collaborators DROP COLUMN IF EXISTS email;`).Error
				return nil
			},
		},
		{
			// K: Transactional outbox for WebSocket broadcasts.
			ID: "202605110011_outbox",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`CREATE TABLE IF NOT EXISTS schema_travel.outbox (
						id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
						event_type    TEXT         NOT NULL,
						room_id       TEXT         NOT NULL,
						payload       JSONB        NOT NULL,
						created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
						dispatched_at TIMESTAMPTZ,
						retry_count   INT          NOT NULL DEFAULT 0,
						last_error    TEXT
					);`,
					`CREATE INDEX IF NOT EXISTS outbox_pending_idx
						ON schema_travel.outbox (created_at)
						WHERE dispatched_at IS NULL;`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				_ = tx.Exec(`DROP TABLE IF EXISTS schema_travel.outbox;`).Error
				return nil
			},
		},
		{
			// L: Model parent/child attractions so planner prompts schedule
			// top-level places and describe important sub-attractions in notes.
			ID: "202605170012_place_parent_sub_attractions",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`ALTER TABLE schema_travel.places
						ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES schema_travel.places(id) ON DELETE SET NULL;`,
					`ALTER TABLE schema_travel.places
						ADD COLUMN IF NOT EXISTS sub_attractions TEXT[] NOT NULL DEFAULT '{}';`,
					`CREATE INDEX IF NOT EXISTS idx_places_parent_id
						ON schema_travel.places (parent_id);`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				_ = tx.Exec(`DROP INDEX IF EXISTS schema_travel.idx_places_parent_id;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.places DROP COLUMN IF EXISTS sub_attractions;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.places DROP COLUMN IF EXISTS parent_id;`).Error
				return nil
			},
		},
		{
			// Per-user role/status for the admin UI. Mirrors
			// database/migrations/0004_user_role_status.sql so a fresh deploy
			// that skips the static SQL file gets the same shape.
			//
			// Idempotent (ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS)
			// so it co-exists with environments where 0004.sql was already
			// applied manually.
			ID: "202605200013_user_role_status",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`ALTER TABLE schema_travel.users
						ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';`,
					`ALTER TABLE schema_travel.users
						ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';`,
					`ALTER TABLE schema_travel.users
						DROP CONSTRAINT IF EXISTS users_role_check;`,
					`ALTER TABLE schema_travel.users
						ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'editor', 'admin'));`,
					`ALTER TABLE schema_travel.users
						DROP CONSTRAINT IF EXISTS users_status_check;`,
					`ALTER TABLE schema_travel.users
						ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended'));`,
					`CREATE INDEX IF NOT EXISTS idx_users_role   ON schema_travel.users (role);`,
					`CREATE INDEX IF NOT EXISTS idx_users_status ON schema_travel.users (status);`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				_ = tx.Exec(`DROP INDEX IF EXISTS schema_travel.idx_users_status;`).Error
				_ = tx.Exec(`DROP INDEX IF EXISTS schema_travel.idx_users_role;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP CONSTRAINT IF EXISTS users_status_check;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP CONSTRAINT IF EXISTS users_role_check;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP COLUMN IF EXISTS status;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP COLUMN IF EXISTS role;`).Error
				return nil
			},
		},
		{
			// Password-reset tokens. Mirrors database/migrations/0005_password_reset_token.sql
			// so a fresh deploy that skips the static SQL file gets the same shape.
			// 64-char hex (32 random bytes) doesn't share verify_token's column —
			// keeps verification OTP and reset link rotation independent.
			ID: "202605200014_password_reset_token",
			Migrate: func(tx *gorm.DB) error {
				sqls := []string{
					`ALTER TABLE schema_travel.users
						ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128);`,
					`ALTER TABLE schema_travel.users
						ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP WITH TIME ZONE;`,
					`CREATE INDEX IF NOT EXISTS idx_users_reset_token
						ON schema_travel.users (reset_token)
						WHERE reset_token IS NOT NULL;`,
				}
				for _, q := range sqls {
					if err := tx.Exec(q).Error; err != nil {
						return err
					}
				}
				return nil
			},
			Rollback: func(tx *gorm.DB) error {
				_ = tx.Exec(`DROP INDEX IF EXISTS schema_travel.idx_users_reset_token;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP COLUMN IF EXISTS reset_token_expires_at;`).Error
				_ = tx.Exec(`ALTER TABLE schema_travel.users DROP COLUMN IF EXISTS reset_token;`).Error
				return nil
			},
		},
	})

	return m.Migrate()
}
