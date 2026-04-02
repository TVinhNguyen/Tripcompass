package models

import (
	"time"

	"github.com/google/uuid"
)

type UserSavedPlace struct {
	UserID  uuid.UUID `gorm:"column:user_id;type:uuid;primaryKey" json:"user_id"`
	PlaceID uuid.UUID `gorm:"column:place_id;type:uuid;primaryKey" json:"place_id"`
	SavedAt time.Time `gorm:"column:saved_at;not null;default:now()" json:"saved_at"`
}

func (UserSavedPlace) TableName() string {
	return "user_saved_places"
}
