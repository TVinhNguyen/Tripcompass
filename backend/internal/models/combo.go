package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Combo struct {
	ID          uuid.UUID   `gorm:"type:uuid;primaryKey"                                           json:"id"`
	Destination string      `gorm:"not null;index:idx_combo_dest;index:idx_combo_dest_price,priority:1" json:"destination"`
	Name        string      `gorm:"not null"                                                       json:"name"`
	CoverImage  *string     `gorm:"column:cover_image"                                             json:"cover_image"`
	Provider    *string     `                                                                       json:"provider"`
	// Composite index (destination, price_per_person) — used by Lookup ORDER BY price ASC
	PricePerPerson    *int        `gorm:"column:price_per_person;index:idx_combo_dest_price,priority:2"  json:"price_per_person"`
	Includes          StringArray `gorm:"type:text[]"                                                    json:"includes"`
	Benefits          StringArray `gorm:"type:text[]"                                                    json:"benefits"`
	DurationDays      *int        `gorm:"column:duration_days"                                           json:"duration_days"`
	RequiresOvernight bool        `gorm:"column:requires_overnight;not null;default:false"               json:"requires_overnight"`
	BookURL           *string     `gorm:"column:book_url"                                                json:"book_url"`
	PriceUpdatedAt    *time.Time  `gorm:"column:price_updated_at"                                        json:"price_updated_at"`
	CreatedAt         time.Time   `json:"created_at"`
	UpdatedAt         time.Time   `json:"updated_at"`
}

func (co *Combo) BeforeCreate(tx *gorm.DB) error {
	if co.ID == uuid.Nil {
		co.ID = uuid.New()
	}
	return nil
}
