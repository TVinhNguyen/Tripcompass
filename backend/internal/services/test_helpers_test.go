package services

import (
	"fmt"
	"os"
	"testing"
	"time"

	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// setupTestDB connects to a PostgreSQL test database with all models auto-migrated.
func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	host := envOrDefault("TEST_DB_HOST", "localhost")
	port := envOrDefault("TEST_DB_PORT", "5432")
	user := envOrDefault("TEST_DB_USER", "postgres")
	password := envOrDefault("TEST_DB_PASSWORD", "postgres")
	dbname := envOrDefault("TEST_DB_NAME", "tripcompass_test")

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	err = db.AutoMigrate(
		&models.User{},
		&models.Itinerary{},
		&models.Activity{},
		&models.Collaborator{},
		&models.AIChatMessage{},
	)
	if err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}

	// Clean tables before each test for isolation
	t.Cleanup(func() {
		db.Exec("TRUNCATE TABLE activities, collaborators, ai_chat_messages, itineraries, users CASCADE")
	})

	return db
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// createTestUser inserts a user with a bcrypt-hashed password into the database.
func createTestUser(t *testing.T, db *gorm.DB) models.User {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	hashStr := string(hash)
	user := models.User{
		ID:           uuid.New(),
		Email:        "test@example.com",
		PasswordHash: &hashStr,
		FullName:     "Test User",
		Provider:     "local",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}
	return user
}

// createTestItinerary inserts a test itinerary owned by the given user.
func createTestItinerary(t *testing.T, db *gorm.DB, ownerID uuid.UUID) models.Itinerary {
	t.Helper()
	start := time.Now().Add(24 * time.Hour)
	end := start.Add(72 * time.Hour)
	itinerary := models.Itinerary{
		ID:             uuid.New(),
		OwnerID:        ownerID,
		Title:          "Test Trip",
		Destination:    "Đà Nẵng",
		Budget:         5000000,
		StartDate:      models.DateOnly{Time: start},
		EndDate:        models.DateOnly{Time: end},
		Status:         "DRAFT",
		BudgetCategory: "MODERATE",
		GuestCount:     2,
		Tags:           models.StringArray{"beach", "food"},
	}
	if err := db.Create(&itinerary).Error; err != nil {
		t.Fatalf("failed to create test itinerary: %v", err)
	}
	return itinerary
}

// createTestActivity inserts a test activity for the given itinerary.
func createTestActivity(t *testing.T, db *gorm.DB, itineraryID uuid.UUID) models.Activity {
	t.Helper()
	cost := 100000.0
	var nextOrder int
	db.Model(&models.Activity{}).
		Where("itinerary_id = ? AND day_number = ?", itineraryID, 1).
		Select("COALESCE(MAX(order_index), -1) + 1").
		Scan(&nextOrder)

	act := models.Activity{
		ID:            uuid.New(),
		ItineraryID:   itineraryID,
		DayNumber:     1,
		OrderIndex:    nextOrder,
		Title:         "Visit Temple",
		Category:      "attraction",
		EstimatedCost: cost,
	}
	if err := db.Create(&act).Error; err != nil {
		t.Fatalf("failed to create test activity: %v", err)
	}
	return act
}
