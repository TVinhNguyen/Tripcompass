package services

import (
	"testing"
	"time"

	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ─── parseDate ────────────────────────────────────────────────────────────────

func TestParseDate(t *testing.T) {
	t.Run("valid date", func(t *testing.T) {
		d, err := parseDate("2025-06-15")
		require.NoError(t, err)
		assert.Equal(t, 2025, d.Year())
		assert.Equal(t, time.June, d.Month())
		assert.Equal(t, 15, d.Day())
	})

	t.Run("empty string", func(t *testing.T) {
		_, err := parseDate("")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "không được để trống")
	})

	t.Run("invalid format", func(t *testing.T) {
		_, err := parseDate("15/06/2025")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "format phải là YYYY-MM-DD")
	})

	t.Run("invalid date", func(t *testing.T) {
		_, err := parseDate("2025-13-45")
		assert.Error(t, err)
	})
}

// ─── setItineraryDates ───────────────────────────────────────────────────────

func TestSetItineraryDates(t *testing.T) {
	t.Run("valid range", func(t *testing.T) {
		var it models.Itinerary
		err := setItineraryDates(&it, "2025-06-15", "2025-06-20")
		require.NoError(t, err)
		assert.Equal(t, 15, it.StartDate.Day())
		assert.Equal(t, 20, it.EndDate.Day())
	})

	t.Run("end before start", func(t *testing.T) {
		var it models.Itinerary
		err := setItineraryDates(&it, "2025-06-20", "2025-06-15")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "end_date phải bằng hoặc sau start_date")
	})

	t.Run("same day", func(t *testing.T) {
		var it models.Itinerary
		err := setItineraryDates(&it, "2025-06-15", "2025-06-15")
		require.NoError(t, err)
	})

	t.Run("invalid start date format", func(t *testing.T) {
		var it models.Itinerary
		err := setItineraryDates(&it, "bad", "2025-06-15")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "start_date")
	})

	t.Run("invalid end date format", func(t *testing.T) {
		var it models.Itinerary
		err := setItineraryDates(&it, "2025-06-15", "bad")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "end_date")
	})
}

// ─── Create ──────────────────────────────────────────────────────────────────

func TestItineraryService_Create(t *testing.T) {
	db := setupTestDB(t)
	svc := NewItineraryService(db)
	user := createTestUser(t, db)

	t.Run("success with defaults", func(t *testing.T) {
		input := CreateItineraryInput{
			Title:       "Trip to Da Nang",
			Destination: "Da Nang",
			Budget:      5000000,
			StartDate:   "2025-06-15",
			EndDate:     "2025-06-20",
		}
		it, err := svc.Create(user.ID.String(), input)
		require.NoError(t, err)
		assert.NotEqual(t, uuid.Nil, it.ID)
		assert.Equal(t, "Trip to Da Nang", it.Title)
		assert.Equal(t, "Da Nang", it.Destination)
		assert.Equal(t, 5000000.0, it.Budget)
		assert.Equal(t, "MODERATE", it.BudgetCategory)
		assert.Equal(t, 1, it.GuestCount)
		assert.Equal(t, "DRAFT", it.Status)
		assert.Equal(t, user.ID, it.OwnerID)
	})

	t.Run("success with custom values", func(t *testing.T) {
		input := CreateItineraryInput{
			Title:          "Luxury Trip",
			Destination:    "Phu Quoc",
			Budget:         20000000,
			StartDate:      "2025-07-01",
			EndDate:        "2025-07-05",
			BudgetCategory: "LUXURY",
			GuestCount:     4,
			Tags:           []string{"beach", "resort"},
		}
		it, err := svc.Create(user.ID.String(), input)
		require.NoError(t, err)
		assert.Equal(t, "LUXURY", it.BudgetCategory)
		assert.Equal(t, 4, it.GuestCount)
		assert.Equal(t, models.StringArray{"beach", "resort"}, it.Tags)
	})

	t.Run("invalid user id", func(t *testing.T) {
		input := CreateItineraryInput{
			Title:       "Trip",
			Destination: "Somewhere",
			Budget:      1000,
			StartDate:   "2025-06-15",
			EndDate:     "2025-06-20",
		}
		_, err := svc.Create("not-a-uuid", input)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid user id")
	})

	t.Run("invalid start_date", func(t *testing.T) {
		input := CreateItineraryInput{
			Title:       "Trip",
			Destination: "Somewhere",
			Budget:      1000,
			StartDate:   "bad-date",
			EndDate:     "2025-06-20",
		}
		_, err := svc.Create(user.ID.String(), input)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "start_date không hợp lệ")
	})

	t.Run("end_date before start_date", func(t *testing.T) {
		input := CreateItineraryInput{
			Title:       "Trip",
			Destination: "Somewhere",
			Budget:      1000,
			StartDate:   "2025-06-20",
			EndDate:     "2025-06-15",
		}
		_, err := svc.Create(user.ID.String(), input)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "end_date phải bằng hoặc sau start_date")
	})
}

// ─── GetMyItineraries ────────────────────────────────────────────────────────

func TestItineraryService_GetMyItineraries(t *testing.T) {
	db := setupTestDB(t)
	svc := NewItineraryService(db)
	user1 := createTestUser(t, db)

	// Create second user
	user2 := createTestUserWith(t, db, "other@example.com")

	_ = createTestItinerary(t, db, user1.ID)
	_ = createTestItinerary(t, db, user2.ID)

	t.Run("returns only owner's itineraries", func(t *testing.T) {
		list, err := svc.GetMyItineraries(user1.ID.String())
		require.NoError(t, err)
		assert.Len(t, list, 1)
		assert.Equal(t, user1.ID, list[0].OwnerID)
	})

	t.Run("empty for user with no itineraries", func(t *testing.T) {
		user3 := createTestUserWith(t, db, "lonely@example.com")
		list, err := svc.GetMyItineraries(user3.ID.String())
		require.NoError(t, err)
		assert.Len(t, list, 0)
	})
}

// ─── GetOne ──────────────────────────────────────────────────────────────────

func TestItineraryService_GetOne(t *testing.T) {
	db := setupTestDB(t)
	svc := NewItineraryService(db)
	user := createTestUser(t, db)
	otherUser := createTestUserWith(t, db, "other@example.com")

	it := createTestItinerary(t, db, user.ID)

	t.Run("owner can access", func(t *testing.T) {
		got, err := svc.GetOne(it.ID.String(), user.ID.String())
		require.NoError(t, err)
		assert.Equal(t, it.ID, got.ID)
	})

	t.Run("published accessible by non-owner", func(t *testing.T) {
		// Publish the itinerary
		db.Model(&it).Update("status", "PUBLISHED")
		got, err := svc.GetOne(it.ID.String(), otherUser.ID.String())
		require.NoError(t, err)
		assert.Equal(t, it.ID, got.ID)
	})

	t.Run("draft not accessible by non-owner", func(t *testing.T) {
		// Revert to draft
		db.Model(&it).Update("status", "DRAFT")
		got, err := svc.GetOne(it.ID.String(), otherUser.ID.String())
		assert.Nil(t, got)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "forbidden")
	})

	t.Run("not found", func(t *testing.T) {
		got, err := svc.GetOne(uuid.New().String(), user.ID.String())
		assert.Nil(t, got)
		assert.Error(t, err)
	})
}

// ─── Update ──────────────────────────────────────────────────────────────────

func TestItineraryService_Update(t *testing.T) {
	db := setupTestDB(t)
	svc := NewItineraryService(db)
	user := createTestUser(t, db)
	it := createTestItinerary(t, db, user.ID)

	t.Run("partial update - title only", func(t *testing.T) {
		newTitle := "Updated Title"
		input := UpdateItineraryInput{Title: &newTitle}
		updated, err := svc.Update(it.ID.String(), user.ID.String(), input)
		require.NoError(t, err)
		assert.Equal(t, "Updated Title", updated.Title)
		// Destination should remain unchanged
		assert.Equal(t, it.Destination, updated.Destination)
	})

	t.Run("update dates", func(t *testing.T) {
		newStart := "2025-08-01"
		newEnd := "2025-08-10"
		input := UpdateItineraryInput{StartDate: &newStart, EndDate: &newEnd}
		updated, err := svc.Update(it.ID.String(), user.ID.String(), input)
		require.NoError(t, err)
		assert.Equal(t, 1, updated.StartDate.Day())
		assert.Equal(t, 10, updated.EndDate.Day())
	})

	t.Run("invalid status", func(t *testing.T) {
		badStatus := "INVALID"
		input := UpdateItineraryInput{Status: &badStatus}
		_, err := svc.Update(it.ID.String(), user.ID.String(), input)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "status không hợp lệ")
	})

	t.Run("valid status - DRAFT", func(t *testing.T) {
		status := "DRAFT"
		input := UpdateItineraryInput{Status: &status}
		updated, err := svc.Update(it.ID.String(), user.ID.String(), input)
		require.NoError(t, err)
		assert.Equal(t, "DRAFT", updated.Status)
	})

	t.Run("forbidden - wrong owner", func(t *testing.T) {
		otherUser := createTestUserWith(t, db, "wrong@example.com")
		newTitle := "Hacked"
		input := UpdateItineraryInput{Title: &newTitle}
		_, err := svc.Update(it.ID.String(), otherUser.ID.String(), input)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "itinerary not found or forbidden")
	})
}

// ─── Delete ──────────────────────────────────────────────────────────────────

func TestItineraryService_Delete(t *testing.T) {
	db := setupTestDB(t)
	svc := NewItineraryService(db)
	user := createTestUser(t, db)

	t.Run("success", func(t *testing.T) {
		it := createTestItinerary(t, db, user.ID)
		err := svc.Delete(it.ID.String(), user.ID.String())
		assert.NoError(t, err)

		// Verify it's gone
		var count int64
		db.Model(&models.Itinerary{}).Where("id = ?", it.ID).Count(&count)
		assert.Equal(t, int64(0), count)
	})

	t.Run("not found or forbidden", func(t *testing.T) {
		err := svc.Delete(uuid.New().String(), user.ID.String())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "itinerary not found or forbidden")
	})
}

// ─── Clone ───────────────────────────────────────────────────────────────────

func TestItineraryService_Clone(t *testing.T) {
	db := setupTestDB(t)
	svc := NewItineraryService(db)
	owner := createTestUser(t, db)
	requester := createTestUserWith(t, db, "requester@example.com")

	t.Run("clone published by non-owner", func(t *testing.T) {
		it := createTestItinerary(t, db, owner.ID)
		_ = createTestActivity(t, db, it.ID)
		db.Model(&it).Update("status", "PUBLISHED")

		clone, err := svc.Clone(it.ID.String(), requester.ID.String())
		require.NoError(t, err)
		assert.NotEqual(t, it.ID, clone.ID)
		assert.Equal(t, requester.ID, clone.OwnerID)
		assert.Contains(t, clone.Title, "(clone)")
		assert.Equal(t, it.Destination, clone.Destination)
		assert.Equal(t, "DRAFT", clone.Status)
		assert.Equal(t, it.ID, *clone.ClonedFromID)
		assert.Len(t, clone.Activities, 1)

		// Verify clone_count incremented on original
		var original models.Itinerary
		db.First(&original, "id = ?", it.ID)
		assert.Equal(t, 1, original.CloneCount)
	})

	t.Run("clone own draft", func(t *testing.T) {
		it := createTestItinerary(t, db, owner.ID)
		clone, err := svc.Clone(it.ID.String(), owner.ID.String())
		require.NoError(t, err)
		assert.Equal(t, owner.ID, clone.OwnerID)
	})

	t.Run("forbidden - draft by non-owner", func(t *testing.T) {
		it := createTestItinerary(t, db, owner.ID)
		clone, err := svc.Clone(it.ID.String(), requester.ID.String())
		assert.Nil(t, clone)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "forbidden")
	})

	t.Run("not found", func(t *testing.T) {
		clone, err := svc.Clone(uuid.New().String(), owner.ID.String())
		assert.Nil(t, clone)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "itinerary not found")
	})
}

// ─── Publish ─────────────────────────────────────────────────────────────────

func TestItineraryService_Publish(t *testing.T) {
	db := setupTestDB(t)
	svc := NewItineraryService(db)
	user := createTestUser(t, db)

	t.Run("toggle DRAFT to PUBLISHED", func(t *testing.T) {
		it := createTestItinerary(t, db, user.ID)
		result, err := svc.Publish(it.ID.String(), user.ID.String())
		require.NoError(t, err)
		assert.Equal(t, "PUBLISHED", result.Status)
	})

	t.Run("toggle PUBLISHED to DRAFT", func(t *testing.T) {
		it := createTestItinerary(t, db, user.ID)
		db.Model(&it).Update("status", "PUBLISHED")
		result, err := svc.Publish(it.ID.String(), user.ID.String())
		require.NoError(t, err)
		assert.Equal(t, "DRAFT", result.Status)
	})

	t.Run("not found or forbidden", func(t *testing.T) {
		_, err := svc.Publish(uuid.New().String(), user.ID.String())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "itinerary not found or forbidden")
	})
}

// ─── Explore ─────────────────────────────────────────────────────────────────

func TestItineraryService_Explore(t *testing.T) {
	db := setupTestDB(t)
	svc := NewItineraryService(db)
	user := createTestUser(t, db)

	// Create published itineraries
	for i := 0; i < 5; i++ {
		it := createTestItinerary(t, db, user.ID)
		db.Model(&it).Updates(map[string]interface{}{
			"status":      "PUBLISHED",
			"destination": "Da Nang",
			"budget":      float64(1000000 * (i + 1)),
			"rating":      float32(i + 1),
		})
	}
	// One draft (should not appear)
	_ = createTestItinerary(t, db, user.ID)

	t.Run("default pagination", func(t *testing.T) {
		list, total, err := svc.Explore(ExploreFilter{})
		require.NoError(t, err)
		assert.Equal(t, int64(5), total)
		assert.Len(t, list, 5)
	})

	t.Run("with limit and page", func(t *testing.T) {
		list, total, err := svc.Explore(ExploreFilter{Page: 1, Limit: 2})
		require.NoError(t, err)
		assert.Equal(t, int64(5), total)
		assert.Len(t, list, 2)
	})

	t.Run("page 2", func(t *testing.T) {
		list, total, err := svc.Explore(ExploreFilter{Page: 2, Limit: 2})
		require.NoError(t, err)
		assert.Equal(t, int64(5), total)
		assert.Len(t, list, 2)
	})

	t.Run("filter by destination", func(t *testing.T) {
		list, _, err := svc.Explore(ExploreFilter{Destination: "Da Nang"})
		require.NoError(t, err)
		assert.Len(t, list, 5)
	})

	t.Run("filter by non-matching destination", func(t *testing.T) {
		list, total, err := svc.Explore(ExploreFilter{Destination: "Tokyo"})
		require.NoError(t, err)
		assert.Equal(t, int64(0), total)
		assert.Len(t, list, 0)
	})

	t.Run("sort by rating", func(t *testing.T) {
		list, _, err := svc.Explore(ExploreFilter{Sort: "rating"})
		require.NoError(t, err)
		assert.Len(t, list, 5)
		// First should have highest rating
		assert.True(t, list[0].Rating >= list[1].Rating)
	})

	t.Run("limit defaults", func(t *testing.T) {
		// limit 0 → default 20
		_, _, err := svc.Explore(ExploreFilter{Limit: 0})
		require.NoError(t, err)

		// limit > 50 → default 20
		_, _, err = svc.Explore(ExploreFilter{Limit: 100})
		require.NoError(t, err)
	})

	t.Run("page defaults", func(t *testing.T) {
		// page 0 → page 1
		list, _, err := svc.Explore(ExploreFilter{Page: 0, Limit: 2})
		require.NoError(t, err)
		assert.Len(t, list, 2)
	})
}

// ─── helper ──────────────────────────────────────────────────────────────────

func createTestUserWith(t *testing.T, db *gorm.DB, email string) models.User {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	hashStr := string(hash)
	user := models.User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: &hashStr,
		FullName:     "Test User",
		Provider:     "local",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}
	return user
}
