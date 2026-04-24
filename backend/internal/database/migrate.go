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
	})

	return m.Migrate()
}
