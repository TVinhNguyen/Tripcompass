package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User roles persisted in users.role. The string values match the CHECK
// constraint in migration 0004.
const (
	UserRoleUser   = "user"
	UserRoleEditor = "editor"
	UserRoleAdmin  = "admin"
)

const (
	UserStatusActive    = "active"
	UserStatusSuspended = "suspended"
)

type User struct {
	ID                    uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Email                 string     `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash          *string    `gorm:"column:password_hash" json:"-"`
	FullName              string     `gorm:"column:full_name;not null" json:"full_name"`
	AvatarURL             *string    `gorm:"column:avatar_url" json:"avatar_url"`
	Provider              string     `gorm:"default:local" json:"provider"`
	IsVerified            bool       `gorm:"column:is_verified;not null;default:false" json:"is_verified"`
	VerifyToken           *string    `gorm:"column:verify_token" json:"-"`
	VerifyTokenExpiresAt  *time.Time `gorm:"column:verify_token_expires_at" json:"-"` // C6: token expiry
	// Password reset — independent from VerifyToken so the two flows can't
	// collide (a user can re-verify email + request a password reset at the
	// same time without the second action invalidating the first).
	ResetToken           *string    `gorm:"column:reset_token" json:"-"`
	ResetTokenExpiresAt  *time.Time `gorm:"column:reset_token_expires_at" json:"-"`
	Role                  string     `gorm:"column:role;not null;default:user" json:"role"`
	Status                string     `gorm:"column:status;not null;default:active" json:"status"`
	CreatedAt             time.Time  `json:"created_at"`

	// IsAdmin previously lived here as a gorm:"-" computed field stamped by
	// AuthService.markAdmin at response time. It moved to session.Session
	// so the User model stays a pure persistence row and the admin rule
	// has exactly one source of truth (session.Resolver.isAdmin).
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}
