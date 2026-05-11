package services

import (
	"errors"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ActivityService struct {
	db *gorm.DB
}

func NewActivityService(db *gorm.DB) *ActivityService {
	return &ActivityService{db: db}
}

type CreateActivityInput struct {
	ItineraryID   string   `json:"itinerary_id" binding:"required"`
	PlaceID       *string  `json:"place_id"`
	DayNumber     int      `json:"day_number" binding:"required,min=1"`
	OrderIndex    int      `json:"order_index"`
	Title         string   `json:"title" binding:"required"`
	Category      string   `json:"category" binding:"required"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	EstimatedCost float64  `json:"estimated_cost"`
	StartTime     *string  `json:"start_time"`
	EndTime       *string  `json:"end_time"`
	ImageURL      *string  `json:"image_url"`
	Notes         *string  `json:"notes"`
}

type UpdateActivityInput struct {
	PlaceID       *string  `json:"place_id"`
	DayNumber     *int     `json:"day_number"`
	OrderIndex    *int     `json:"order_index"`
	Title         *string  `json:"title"`
	Category      *string  `json:"category"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	EstimatedCost *float64 `json:"estimated_cost"`
	StartTime     *string  `json:"start_time"`
	EndTime       *string  `json:"end_time"`
	ImageURL      *string  `json:"image_url"`
	Notes         *string  `json:"notes"`
}

type ReorderItem struct {
	ID         string `json:"id" binding:"required"`
	DayNumber  int    `json:"day_number" binding:"required,min=1"`
	OrderIndex int    `json:"order_index" binding:"min=0"`
}

// checkActivityEditAccess loads the activity and verifies the user can edit its itinerary.
// Allows owner or ACCEPTED collaborator with role=EDITOR.
func (s *ActivityService) checkActivityEditAccess(activityID, userID string) (*models.Activity, error) {
	var act models.Activity
	if err := s.db.First(&act, "id = ?", activityID).Error; err != nil {
		return nil, apperror.ErrNotFound
	}
	if err := CheckEditAccess(s.db, act.ItineraryID.String(), userID); err != nil {
		return nil, err
	}
	return &act, nil
}

func (s *ActivityService) Create(userID string, input CreateActivityInput) (*models.Activity, error) {
	itID, err := uuid.Parse(input.ItineraryID)
	if err != nil {
		return nil, errors.New("invalid itinerary_id")
	}

	var placeUUID *uuid.UUID
	if input.PlaceID != nil {
		pid := *input.PlaceID
		if pid != "" {
			parsedPlaceID, err := uuid.Parse(pid)
			if err != nil {
				return nil, errors.New("invalid place_id")
			}

			var count int64
			if err := s.db.Model(&models.Place{}).Where("id = ?", parsedPlaceID).Count(&count).Error; err != nil {
				return nil, err
			}
			if count == 0 {
				return nil, errors.New("place not found")
			}
			placeUUID = &parsedPlaceID
		}
	}

	// Verify edit access (owner or EDITOR collaborator)
	if err := CheckEditAccess(s.db, itID.String(), userID); err != nil {
		return nil, err
	}

	act := models.Activity{
		ItineraryID:   itID,
		PlaceID:       placeUUID,
		DayNumber:     input.DayNumber,
		OrderIndex:    input.OrderIndex,
		Title:         input.Title,
		Category:      input.Category,
		Lat:           input.Lat,
		Lng:           input.Lng,
		EstimatedCost: input.EstimatedCost,
		StartTime:     input.StartTime,
		EndTime:       input.EndTime,
		ImageURL:      input.ImageURL,
		Notes:         input.Notes,
	}

	if err := s.db.Create(&act).Error; err != nil {
		return nil, err
	}
	return &act, nil
}

func (s *ActivityService) Update(id, userID string, input UpdateActivityInput) (*models.Activity, error) {
	act, err := s.checkActivityEditAccess(id, userID)
	if err != nil {
		return nil, err
	}

	updates := map[string]interface{}{}
	if input.PlaceID != nil {
		if *input.PlaceID == "" {
			updates["place_id"] = nil
		} else {
			parsedPlaceID, err := uuid.Parse(*input.PlaceID)
			if err != nil {
				return nil, errors.New("invalid place_id")
			}

			var count int64
			if err := s.db.Model(&models.Place{}).Where("id = ?", parsedPlaceID).Count(&count).Error; err != nil {
				return nil, err
			}
			if count == 0 {
				return nil, errors.New("place not found")
			}

			updates["place_id"] = parsedPlaceID
		}
	}
	if input.DayNumber != nil {
		updates["day_number"] = *input.DayNumber
	}
	if input.OrderIndex != nil {
		updates["order_index"] = *input.OrderIndex
	}
	if input.Title != nil {
		updates["title"] = *input.Title
	}
	if input.Category != nil {
		updates["category"] = *input.Category
	}
	if input.Lat != nil {
		updates["lat"] = *input.Lat
	}
	if input.Lng != nil {
		updates["lng"] = *input.Lng
	}
	if input.EstimatedCost != nil {
		updates["estimated_cost"] = *input.EstimatedCost
	}
	if input.StartTime != nil {
		updates["start_time"] = *input.StartTime
	}
	if input.EndTime != nil {
		updates["end_time"] = *input.EndTime
	}
	if input.ImageURL != nil {
		updates["image_url"] = *input.ImageURL
	}
	if input.Notes != nil {
		updates["notes"] = *input.Notes
	}

	if err := s.db.Model(act).Updates(updates).Error; err != nil {
		return nil, err
	}
	return act, nil
}

// Delete removes the activity and returns the itinerary_id it belonged to,
// so the caller can broadcast a WebSocket event to the right room.
func (s *ActivityService) Delete(id, userID string) (uuid.UUID, error) {
	act, err := s.checkActivityEditAccess(id, userID)
	if err != nil {
		return uuid.Nil, err
	}
	if err := s.db.Delete(&models.Activity{}, "id = ?", id).Error; err != nil {
		return uuid.Nil, err
	}
	return act.ItineraryID, nil
}

// Reorder applies day_number/order_index updates and returns the itinerary_id
// the items belong to, so the caller can broadcast a WebSocket event.
func (s *ActivityService) Reorder(userID string, items []ReorderItem) (uuid.UUID, error) {
	if len(items) == 0 {
		return uuid.Nil, nil
	}
	ids := make([]string, len(items))
	for i, it := range items {
		ids[i] = it.ID
	}

	var itineraryID uuid.UUID
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Verify all activities exist and belong to the same itinerary.
		var rows []models.Activity
		if err := tx.Select("id", "itinerary_id").
			Where("id IN ?", ids).Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) != len(items) {
			return apperror.ErrNotFound
		}
		// All activities must share one itinerary — otherwise reorder semantics break.
		itID := rows[0].ItineraryID
		for _, r := range rows {
			if r.ItineraryID != itID {
				return apperror.ErrInvalidInput
			}
		}
		// Check edit access on the itinerary (owner or EDITOR collaborator).
		if err := CheckEditAccess(tx, itID.String(), userID); err != nil {
			return err
		}

		for _, item := range items {
			if err := tx.Model(&models.Activity{}).
				Where("id = ?", item.ID).
				Updates(map[string]interface{}{
					"day_number":  item.DayNumber,
					"order_index": item.OrderIndex,
				}).Error; err != nil {
				return err
			}
		}
		itineraryID = itID
		return nil
	})
	return itineraryID, err
}
