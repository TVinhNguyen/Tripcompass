// Package services — admin_stats.go
//
// Aggregations for the admin dashboard's top KPI tiles. Kept separate from
// the per-user CRUD service so a high-traffic stats endpoint doesn't share a
// connection pool slot or test fixture with mutation paths.

package services

import (
	"fmt"
	"time"
	"tripcompass-backend/internal/models"

	"gorm.io/gorm"
)

type AdminStatsService struct {
	db *gorm.DB
}

func NewAdminStatsService(db *gorm.DB) *AdminStatsService {
	return &AdminStatsService{db: db}
}

type AdminStats struct {
	TotalUsers       int64 `json:"total_users"`
	TotalItineraries int64 `json:"total_itineraries"`
	TotalPlaces      int64 `json:"total_places"`
	AIRequestsWeek   int64 `json:"ai_requests_week"`
}

func (s *AdminStatsService) Stats() (*AdminStats, error) {
	var out AdminStats
	if err := s.db.Model(&models.User{}).Count(&out.TotalUsers).Error; err != nil {
		return nil, fmt.Errorf("count users: %w", err)
	}
	if err := s.db.Table("itineraries").Count(&out.TotalItineraries).Error; err != nil {
		return nil, fmt.Errorf("count itineraries: %w", err)
	}
	if err := s.db.Table("places").Count(&out.TotalPlaces).Error; err != nil {
		return nil, fmt.Errorf("count places: %w", err)
	}
	// "AI requests" = user-authored chat messages in the last 7 days. Assistant
	// rows are tool outputs and shouldn't inflate the count.
	weekAgo := time.Now().AddDate(0, 0, -7)
	if err := s.db.Table("ai_chat_messages").
		Where("role = ? AND created_at >= ?", "USER", weekAgo).
		Count(&out.AIRequestsWeek).Error; err != nil {
		return nil, fmt.Errorf("count ai requests: %w", err)
	}
	return &out, nil
}
