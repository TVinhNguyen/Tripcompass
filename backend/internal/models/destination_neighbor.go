package models

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DestinationNeighbor represents a day-trip or half-day-trip neighbor of a destination.
// Example: Đà Nẵng → Hội An (60 min one-way, day_trip, inject when trip >= 4 days).
type DestinationNeighbor struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"                         json:"id"`
	Destination string    `gorm:"not null;index:idx_dn_dest"                   json:"destination"`   // "đà nẵng"
	Neighbor    string    `gorm:"not null"                                     json:"neighbor"`      // "hội an"
	TravelMinOW int       `gorm:"column:travel_min_ow;not null"                json:"travel_min_ow"` // one-way minutes
	TripType    string    `gorm:"type:varchar(20);not null;default:'day_trip'" json:"trip_type"`     // "day_trip"|"half_day"
	MinTripDays int       `gorm:"column:min_trip_days;not null;default:4"      json:"min_trip_days"` // inject when numDays >= this
	Notes       string    `gorm:"type:text"                                    json:"notes"`
}

func (d *DestinationNeighbor) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

// PlaceSeason records which months a place is accessible/recommended.
// Places without a PlaceSeason record are considered available year-round.
type PlaceSeason struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey"                          json:"id"`
	PlaceID    uuid.UUID `gorm:"column:place_id;not null;index:idx_ps_place"   json:"place_id"`
	OpenMonths IntArray  `gorm:"type:integer[];column:open_months;not null"    json:"open_months"` // e.g. [3,4,5,6,7,8]
	Notes      string    `gorm:"type:text"                                     json:"notes"`
}

func (p *PlaceSeason) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}
