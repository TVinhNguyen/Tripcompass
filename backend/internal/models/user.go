package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash *string   `gorm:"column:password_hash" json:"-"`
	FullName     string    `gorm:"column:full_name;not null" json:"full_name"`
	AvatarURL    *string   `gorm:"column:avatar_url" json:"avatar_url"`
	Provider     string    `gorm:"default:local" json:"provider"`
	IsVerified   bool      `gorm:"column:is_verified;not null;default:false" json:"is_verified"`
	VerifyToken  *string   `gorm:"column:verify_token" json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}
