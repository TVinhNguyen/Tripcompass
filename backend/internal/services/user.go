package services

import (
	"errors"
	"fmt"
	"tripcompass-backend/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// UserService handles user profile management.
type UserService struct {
	db *gorm.DB
}

func NewUserService(db *gorm.DB) *UserService {
	return &UserService{db: db}
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

type UpdateProfileInput struct {
	FullName  *string `json:"full_name"`
	AvatarURL *string `json:"avatar_url"`
}

type ChangePasswordInput struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Methods
// ─────────────────────────────────────────────────────────────────────────────

// GetByID returns a user by UUID string.
func (s *UserService) GetByID(id string) (*models.User, error) {
	var u models.User
	if err := s.db.First(&u, "id = ?", id).Error; err != nil {
		return nil, errors.New("user not found")
	}
	return &u, nil
}

// UpdateProfile updates full_name and/or avatar_url.
func (s *UserService) UpdateProfile(userID string, input UpdateProfileInput) (*models.User, error) {
	var u models.User
	if err := s.db.First(&u, "id = ?", userID).Error; err != nil {
		return nil, errors.New("user not found")
	}

	updates := map[string]interface{}{}
	if input.FullName != nil {
		if *input.FullName == "" {
			return nil, errors.New("full_name cannot be empty")
		}
		updates["full_name"] = *input.FullName
	}
	if input.AvatarURL != nil {
		updates["avatar_url"] = *input.AvatarURL
	}

	if len(updates) == 0 {
		return &u, nil
	}

	if err := s.db.Model(&u).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}

	s.db.First(&u, "id = ?", userID)
	return &u, nil
}

// ChangePassword verifies old password then sets new one.
func (s *UserService) ChangePassword(userID string, input ChangePasswordInput) error {
	var u models.User
	if err := s.db.First(&u, "id = ?", userID).Error; err != nil {
		return errors.New("user not found")
	}

	if u.PasswordHash == nil {
		return errors.New("social login accounts cannot change password this way")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*u.PasswordHash), []byte(input.OldPassword)); err != nil {
		return errors.New("current password is incorrect")
	}

	if input.OldPassword == input.NewPassword {
		return errors.New("new password must be different from current password")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	hashStr := string(hash)
	return s.db.Model(&u).Update("password_hash", hashStr).Error
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved Places
// ─────────────────────────────────────────────────────────────────────────────

// GetSavedPlaces returns all places saved by the user.
func (s *UserService) GetSavedPlaces(userID string) ([]models.Place, error) {
	var places []models.Place
	err := s.db.
		Joins("INNER JOIN schema_travel.user_saved_places usp ON usp.place_id = places.id").
		Where("usp.user_id = ?", userID).
		Order("usp.saved_at DESC").
		Find(&places).Error
	return places, err
}

// SavePlace adds a place to user's saved list (idempotent).
func (s *UserService) SavePlace(userID, placeID string) error {
	// Verify place exists
	var count int64
	s.db.Model(&models.Place{}).Where("id = ?", placeID).Count(&count)
	if count == 0 {
		return errors.New("place not found")
	}

	// Try insert, ignore conflict (already saved)
	result := s.db.Exec(
		`INSERT INTO schema_travel.user_saved_places (user_id, place_id, saved_at)
		 VALUES (?, ?, NOW()) ON CONFLICT DO NOTHING`,
		userID, placeID,
	)
	return result.Error
}

// UnsavePlace removes a place from user's saved list.
func (s *UserService) UnsavePlace(userID, placeID string) error {
	res := s.db.Exec(
		`DELETE FROM schema_travel.user_saved_places WHERE user_id = ? AND place_id = ?`,
		userID, placeID,
	)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("saved place not found")
	}
	return nil
}
