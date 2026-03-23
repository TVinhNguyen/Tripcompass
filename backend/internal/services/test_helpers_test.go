package services

import (
	"testing"
	"time"

	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// setupTestDB creates an in-memory SQLite database with all models auto-migrated.
func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
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

	return db
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
	act := models.Activity{
		ID:            uuid.New(),
		ItineraryID:   itineraryID,
		DayNumber:     1,
		OrderIndex:    0,
		Title:         "Visit Temple",
		Category:      "attraction",
		EstimatedCost: cost,
	}
	if err := db.Create(&act).Error; err != nil {
		t.Fatalf("failed to create test activity: %v", err)
	}
	return act
}
