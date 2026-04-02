package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Activity struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	ItineraryID   uuid.UUID  `gorm:"column:itinerary_id;not null;uniqueIndex:uq_activity_order,priority:1" json:"itinerary_id"`
	PlaceID       *uuid.UUID `gorm:"column:place_id;index" json:"place_id"`
	DayNumber     int        `gorm:"column:day_number;not null;uniqueIndex:uq_activity_order,priority:2" json:"day_number"`
	OrderIndex    int        `gorm:"column:order_index;not null;uniqueIndex:uq_activity_order,priority:3" json:"order_index"`
	Title         string     `gorm:"not null" json:"title"`
	Category      string     `gorm:"not null" json:"category"`
	Lat           *float64   `json:"lat"`
	Lng           *float64   `json:"lng"`
	EstimatedCost float64    `gorm:"column:estimated_cost;default:0" json:"estimated_cost"`
	StartTime     *string    `gorm:"column:start_time;type:time without time zone" json:"start_time"`
	EndTime       *string    `gorm:"column:end_time;type:time without time zone" json:"end_time"`
	ImageURL      *string    `gorm:"column:image_url" json:"image_url"`
	Notes         *string    `json:"notes"`
	CreatedAt     time.Time  `json:"created_at"`
}

func (a *Activity) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
