package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Itinerary struct {
	ID             uuid.UUID   `gorm:"type:uuid;primaryKey" json:"id"`
	OwnerID        uuid.UUID   `gorm:"column:owner_id;not null" json:"owner_id"`
	Owner          *User       `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	Title          string      `gorm:"not null" json:"title"`
	Destination    string      `gorm:"not null" json:"destination"`
	Budget         float64     `gorm:"not null" json:"budget"`
	StartDate      DateOnly    `gorm:"column:start_date;type:date" json:"start_date"`
	EndDate        DateOnly    `gorm:"column:end_date;type:date" json:"end_date"`
	Status         string      `gorm:"not null;default:DRAFT" json:"status"` // DRAFT | PUBLISHED
	CoverImageURL  *string     `gorm:"column:cover_image_url" json:"cover_image_url"`
	Rating         float32     `gorm:"not null;default:0" json:"rating"`
	ViewCount      int         `gorm:"column:view_count;not null;default:0" json:"view_count"`
	CloneCount     int         `gorm:"column:clone_count;not null;default:0" json:"clone_count"`
	ClonedFromID   *uuid.UUID  `gorm:"column:cloned_from_id" json:"cloned_from_id"`
	GuestCount     int         `gorm:"column:guest_count;not null;default:1" json:"guest_count"`
	Tags           StringArray `gorm:"type:text[]" json:"tags"`
	BudgetCategory string      `gorm:"column:budget_category;not null;default:MODERATE" json:"budget_category"` // BUDGET | MODERATE | LUXURY
	CreatedAt      time.Time   `json:"created_at"`
	Activities     []Activity  `gorm:"foreignKey:ItineraryID" json:"activities,omitempty"`
}

func (i *Itinerary) BeforeCreate(tx *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	return nil
}
