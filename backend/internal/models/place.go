package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type PlaceCategory string

const (
	CategoryAttraction PlaceCategory = "ATTRACTION"
	CategoryFood       PlaceCategory = "FOOD"
	CategoryStay       PlaceCategory = "STAY"
)

type Place struct {
	ID                  uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	Destination         string         `gorm:"not null;index:idx_place_dest;index:idx_place_dest_cat" json:"destination"`
	Category            PlaceCategory  `gorm:"type:varchar(50);not null;index:idx_place_dest_cat" json:"category"`
	Name                string         `gorm:"not null" json:"name"`
	NameEN              *string        `gorm:"column:name_en" json:"name_en"`
	Address             *string        `json:"address"`
	Area                *string        `gorm:"index:idx_place_area" json:"area"`
	Latitude            *float64       `gorm:"column:latitude;index:idx_place_coords" json:"latitude"`
	Longitude           *float64       `gorm:"column:longitude;index:idx_place_coords" json:"longitude"`
	CoverImage          *string        `gorm:"column:cover_image" json:"cover_image"`
	Rating              *float64       `gorm:"index:idx_place_rating" json:"rating"`
	Hours               *string        `json:"hours"`
	RecommendedDuration *int           `gorm:"column:recommended_duration" json:"recommended_duration"`
	BasePrice           *int           `gorm:"column:base_price" json:"base_price"`
	Metadata            datatypes.JSON `gorm:"type:jsonb" json:"metadata"`
	SourceURL           *string        `gorm:"column:source_url" json:"source_url"`
	PriceUpdatedAt      *time.Time     `gorm:"column:price_updated_at" json:"price_updated_at"`
	CreatedAt           time.Time      `json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
}

func (p *Place) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}
