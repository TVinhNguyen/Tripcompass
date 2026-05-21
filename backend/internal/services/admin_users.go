// Package services — admin_users.go
//
// Per-user management for the /admin/users page: list with filters, role
// promotion, suspension. Role/status writes are guarded with a whitelist
// (matches the CHECK constraint added in migration 0004).

package services

import (
	"fmt"
	"time"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AdminUserService struct {
	db *gorm.DB
}

func NewAdminUserService(db *gorm.DB) *AdminUserService {
	return &AdminUserService{db: db}
}

// AdminUserRow mirrors what the /admin/users frontend expects.
type AdminUserRow struct {
	ID             uuid.UUID `json:"id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	Role           string    `json:"role"`
	Status         string    `json:"status"`
	ItineraryCount int64     `json:"itinerary_count"`
	AvatarURL      string    `json:"avatar_url"`
	CreatedAt      time.Time `json:"created_at"`
}

func (s *AdminUserService) List(search, roleFilter string, limit int) ([]AdminUserRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	q := s.db.Table("users u").
		Select(`u.id, u.email, u.full_name AS name, u.role, u.status,
		        COALESCE(u.avatar_url, '') AS avatar_url, u.created_at,
		        (SELECT COUNT(*) FROM itineraries i WHERE i.owner_id = u.id) AS itinerary_count`).
		Order("u.created_at DESC").
		Limit(limit)

	if search != "" {
		like := "%" + search + "%"
		q = q.Where("LOWER(u.email) LIKE LOWER(?) OR LOWER(u.full_name) LIKE LOWER(?)", like, like)
	}
	if roleFilter != "" {
		q = q.Where("u.role = ?", roleFilter)
	}

	var rows []AdminUserRow
	if err := q.Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	return rows, nil
}

func (s *AdminUserService) UpdateRole(userID, newRole string) error {
	switch newRole {
	case models.UserRoleUser, models.UserRoleEditor, models.UserRoleAdmin:
		// ok
	default:
		return fmt.Errorf("%w: invalid role %q", apperror.ErrInvalidInput, newRole)
	}
	res := s.db.Model(&models.User{}).Where("id = ?", userID).Update("role", newRole)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return apperror.ErrNotFound
	}
	return nil
}

func (s *AdminUserService) UpdateStatus(userID, newStatus string) error {
	switch newStatus {
	case models.UserStatusActive, models.UserStatusSuspended:
		// ok
	default:
		return fmt.Errorf("%w: invalid status %q", apperror.ErrInvalidInput, newStatus)
	}
	res := s.db.Model(&models.User{}).Where("id = ?", userID).Update("status", newStatus)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return apperror.ErrNotFound
	}
	return nil
}
