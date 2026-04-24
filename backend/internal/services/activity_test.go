package services

import (
	"testing"

	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── isOwnerOfActivity ───────────────────────────────────────────────────────

func TestActivityService_IsOwnerOfActivity(t *testing.T) {
	db := setupTestDB(t)
	svc := NewActivityService(db)
	user := createTestUser(t, db)
	it := createTestItinerary(t, db, user.ID)
	act := createTestActivity(t, db, it.ID)

	t.Run("success", func(t *testing.T) {
		got, err := svc.isOwnerOfActivity(act.ID.String(), user.ID.String())
		require.NoError(t, err)
		assert.Equal(t, act.ID, got.ID)
	})

	t.Run("activity not found", func(t *testing.T) {
		_, err := svc.isOwnerOfActivity(uuid.New().String(), user.ID.String())
		assert.Error(t, err)
		assert.ErrorIs(t, err, apperror.ErrNotFound)
	})

	t.Run("wrong owner", func(t *testing.T) {
		otherUser := createTestUserWith(t, db, "other@example.com")
		_, err := svc.isOwnerOfActivity(act.ID.String(), otherUser.ID.String())
		assert.Error(t, err)
		assert.ErrorIs(t, err, apperror.ErrForbidden)
	})
}

// ─── Create ──────────────────────────────────────────────────────────────────

func TestActivityService_Create(t *testing.T) {
	db := setupTestDB(t)
	svc := NewActivityService(db)
	user := createTestUser(t, db)
	it := createTestItinerary(t, db, user.ID)

	t.Run("success", func(t *testing.T) {
		input := CreateActivityInput{
			ItineraryID:   it.ID.String(),
			DayNumber:     1,
			OrderIndex:    0,
			Title:         "Visit Temple",
			Category:      "attraction",
			EstimatedCost: 50000,
		}
		act, err := svc.Create(user.ID.String(), input)
		require.NoError(t, err)
		assert.NotEqual(t, uuid.Nil, act.ID)
		assert.Equal(t, "Visit Temple", act.Title)
		assert.Equal(t, "attraction", act.Category)
		assert.Equal(t, it.ID, act.ItineraryID)
		assert.Equal(t, 1, act.DayNumber)
	})

	t.Run("invalid itinerary_id", func(t *testing.T) {
		input := CreateActivityInput{
			ItineraryID: "not-a-uuid",
			DayNumber:   1,
			Title:       "Test",
			Category:    "food",
		}
		_, err := svc.Create(user.ID.String(), input)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid itinerary_id")
	})

	t.Run("forbidden - not owner", func(t *testing.T) {
		otherUser := createTestUserWith(t, db, "other@example.com")
		input := CreateActivityInput{
			ItineraryID: it.ID.String(),
			DayNumber:   1,
			Title:       "Hack",
			Category:    "food",
		}
		_, err := svc.Create(otherUser.ID.String(), input)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "itinerary not found or forbidden")
	})

	t.Run("with optional fields", func(t *testing.T) {
		lat := 16.0544
		lng := 108.2022
		imgURL := "https://example.com/img.jpg"
		notes := "Bring sunscreen"
		startTime := "09:00"
		endTime := "11:00"

		input := CreateActivityInput{
			ItineraryID:   it.ID.String(),
			DayNumber:     2,
			OrderIndex:    1,
			Title:         "Beach Day",
			Category:      "leisure",
			Lat:           &lat,
			Lng:           &lng,
			EstimatedCost: 200000,
			StartTime:     &startTime,
			EndTime:       &endTime,
			ImageURL:      &imgURL,
			Notes:         &notes,
		}
		act, err := svc.Create(user.ID.String(), input)
		require.NoError(t, err)
		assert.Equal(t, &lat, act.Lat)
		assert.Equal(t, &lng, act.Lng)
		assert.Equal(t, &imgURL, act.ImageURL)
		assert.Equal(t, &notes, act.Notes)
		assert.Equal(t, &startTime, act.StartTime)
		assert.Equal(t, &endTime, act.EndTime)
	})
}

// ─── Update ──────────────────────────────────────────────────────────────────

func TestActivityService_Update(t *testing.T) {
	db := setupTestDB(t)
	svc := NewActivityService(db)
	user := createTestUser(t, db)
	it := createTestItinerary(t, db, user.ID)
	act := createTestActivity(t, db, it.ID)

	t.Run("partial update - title only", func(t *testing.T) {
		newTitle := "Updated Activity"
		input := UpdateActivityInput{Title: &newTitle}
		updated, err := svc.Update(act.ID.String(), user.ID.String(), input)
		require.NoError(t, err)
		assert.Equal(t, "Updated Activity", updated.Title)
		// Category should remain unchanged
		assert.Equal(t, act.Category, updated.Category)
	})

	t.Run("update all fields", func(t *testing.T) {
		day := 3
		order := 5
		title := "Full Update"
		category := "food"
		lat := 16.0
		lng := 108.0
		cost := 999999.0
		start := "14:00"
		end := "16:00"
		img := "https://img.com/new.jpg"
		notes := "Updated notes"

		input := UpdateActivityInput{
			DayNumber:     &day,
			OrderIndex:    &order,
			Title:         &title,
			Category:      &category,
			Lat:           &lat,
			Lng:           &lng,
			EstimatedCost: &cost,
			StartTime:     &start,
			EndTime:       &end,
			ImageURL:      &img,
			Notes:         &notes,
		}
		updated, err := svc.Update(act.ID.String(), user.ID.String(), input)
		require.NoError(t, err)
		assert.Equal(t, "Full Update", updated.Title)
		assert.Equal(t, "food", updated.Category)
	})

	t.Run("forbidden owner", func(t *testing.T) {
		otherUser := createTestUserWith(t, db, "other2@example.com")
		newTitle := "Hacked"
		input := UpdateActivityInput{Title: &newTitle}
		_, err := svc.Update(act.ID.String(), otherUser.ID.String(), input)
		assert.Error(t, err)
		assert.ErrorIs(t, err, apperror.ErrForbidden)
	})
}

// ─── Delete ──────────────────────────────────────────────────────────────────

func TestActivityService_Delete(t *testing.T) {
	db := setupTestDB(t)
	svc := NewActivityService(db)
	user := createTestUser(t, db)
	it := createTestItinerary(t, db, user.ID)

	t.Run("success", func(t *testing.T) {
		act := createTestActivity(t, db, it.ID)
		err := svc.Delete(act.ID.String(), user.ID.String())
		assert.NoError(t, err)

		var count int64
		db.Model(&models.Activity{}).Where("id = ?", act.ID).Count(&count)
		assert.Equal(t, int64(0), count)
	})

	t.Run("forbidden", func(t *testing.T) {
		act := createTestActivity(t, db, it.ID)
		otherUser := createTestUserWith(t, db, "other3@example.com")
		err := svc.Delete(act.ID.String(), otherUser.ID.String())
		assert.Error(t, err)
		assert.ErrorIs(t, err, apperror.ErrForbidden)
	})

	t.Run("activity not found", func(t *testing.T) {
		err := svc.Delete(uuid.New().String(), user.ID.String())
		assert.Error(t, err)
		assert.ErrorIs(t, err, apperror.ErrNotFound)
	})
}

// ─── Reorder ─────────────────────────────────────────────────────────────────

func TestActivityService_Reorder(t *testing.T) {
	db := setupTestDB(t)
	svc := NewActivityService(db)
	user := createTestUser(t, db)
	it := createTestItinerary(t, db, user.ID)

	act1 := createTestActivity(t, db, it.ID)
	act2 := createTestActivity(t, db, it.ID)

	t.Run("success", func(t *testing.T) {
		items := []ReorderItem{
			{ID: act1.ID.String(), DayNumber: 2, OrderIndex: 1},
			{ID: act2.ID.String(), DayNumber: 2, OrderIndex: 2},
		}
		err := svc.Reorder(user.ID.String(), items)
		assert.NoError(t, err)

		// Verify changes
		var a1 models.Activity
		db.First(&a1, "id = ?", act1.ID)
		assert.Equal(t, 2, a1.DayNumber)
		assert.Equal(t, 1, a1.OrderIndex)

		var a2 models.Activity
		db.First(&a2, "id = ?", act2.ID)
		assert.Equal(t, 2, a2.DayNumber)
		assert.Equal(t, 2, a2.OrderIndex)
	})

	t.Run("activity not found", func(t *testing.T) {
		items := []ReorderItem{
			{ID: uuid.New().String(), DayNumber: 1, OrderIndex: 0},
		}
		err := svc.Reorder(user.ID.String(), items)
		assert.Error(t, err)
		assert.ErrorIs(t, err, apperror.ErrNotFound)
	})

	t.Run("forbidden owner", func(t *testing.T) {
		otherUser := createTestUserWith(t, db, "reorder@example.com")
		items := []ReorderItem{
			{ID: act1.ID.String(), DayNumber: 3, OrderIndex: 0},
		}
		err := svc.Reorder(otherUser.ID.String(), items)
		assert.Error(t, err)
		assert.ErrorIs(t, err, apperror.ErrForbidden)
	})
}
