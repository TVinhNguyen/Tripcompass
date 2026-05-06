package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AIChatSession struct {
	ID               uuid.UUID       `gorm:"type:uuid;primaryKey" json:"id"`
	UserID           uuid.UUID       `gorm:"column:user_id;not null" json:"user_id"`
	Title            string          `gorm:"not null" json:"title"`
	Destination      *string         `gorm:"column:destination" json:"destination,omitempty"`
	MessageCount     int             `gorm:"column:message_count;not null;default:0" json:"message_count"`
	SavedItineraryID *uuid.UUID      `gorm:"column:saved_itinerary_id" json:"saved_itinerary_id,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
	Messages         []AIChatMessage `gorm:"foreignKey:SessionID" json:"messages,omitempty"`
}

func (s *AIChatSession) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}
