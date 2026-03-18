package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AIChatMessage struct {
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey" json:"id"`
	ItineraryID uuid.UUID       `gorm:"column:itinerary_id;not null" json:"itinerary_id"`
	Role        string          `gorm:"not null" json:"role"`
	Content     string          `gorm:"not null" json:"content"`
	Metadata    json.RawMessage `gorm:"type:jsonb;serializer:json" json:"metadata,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

func (m *AIChatMessage) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}
