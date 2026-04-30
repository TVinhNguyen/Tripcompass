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

// isOwnerOfActivity checks the user owns the itinerary that the activity belongs to.
func (s *ActivityService) isOwnerOfActivity(activityID, ownerID string) (*models.Activity, error) {
	var act models.Activity
	if err := s.db.First(&act, "id = ?", activityID).Error; err != nil {
		return nil, apperror.ErrNotFound
	}

	var it models.Itinerary
	if err := s.db.First(&it, "id = ?", act.ItineraryID).Error; err != nil {
		return nil, apperror.ErrNotFound
	}

	if it.OwnerID.String() != ownerID {
		return nil, apperror.ErrForbidden
	}
	return &act, nil
}

func (s *ActivityService) Create(ownerID string, input CreateActivityInput) (*models.Activity, error) {
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

	// Verify ownership
	var it models.Itinerary
	if err := s.db.First(&it, "id = ? AND owner_id = ?", itID, ownerID).Error; err != nil {
		return nil, errors.New("itinerary not found or forbidden")
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

func (s *ActivityService) Update(id, ownerID string, input UpdateActivityInput) (*models.Activity, error) {
	act, err := s.isOwnerOfActivity(id, ownerID)
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

func (s *ActivityService) Delete(id, ownerID string) error {
	_, err := s.isOwnerOfActivity(id, ownerID)
	if err != nil {
		return err
	}
	return s.db.Delete(&models.Activity{}, "id = ?", id).Error
}

func (s *ActivityService) Reorder(ownerID string, items []ReorderItem) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]string, len(items))
	for i, it := range items {
		ids[i] = it.ID
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// First: count how many of the given IDs actually exist.
		var total int64
		if err := tx.Model(&models.Activity{}).
			Where("id IN ?", ids).
			Count(&total).Error; err != nil {
			return err
		}
		if int(total) != len(items) {
			return apperror.ErrNotFound // some IDs don't exist at all
		}

		// Second: count how many belong to ownerID via JOIN.
		var owned int64
		if err := tx.Model(&models.Activity{}).
			Joins("INNER JOIN itineraries ON itineraries.id = activities.itinerary_id").
			Where("activities.id IN ? AND itineraries.owner_id = ?", ids, ownerID).
			Count(&owned).Error; err != nil {
			return err
		}
		if int(owned) != len(items) {
			return apperror.ErrForbidden // activities exist but belong to a different user
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
		return nil
	})
}
