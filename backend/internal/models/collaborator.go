package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Collaborator struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	ItineraryID uuid.UUID  `gorm:"column:itinerary_id;not null" json:"itinerary_id"`
	UserID      uuid.UUID  `gorm:"column:user_id;not null" json:"user_id"`
	User        *User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	InvitedBy   uuid.UUID  `gorm:"column:invited_by;not null" json:"invited_by"`
	Role        string     `gorm:"default:VIEWER" json:"role"`
	Status      string     `gorm:"default:PENDING" json:"status"`
	JoinedAt    *time.Time `gorm:"column:joined_at" json:"joined_at"`
}

func (c *Collaborator) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}
