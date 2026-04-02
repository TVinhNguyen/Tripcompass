package services

import (
	"errors"
	"strings"
	"time"
	"tripcompass-backend/internal/models"

	"gorm.io/gorm"
)

// LookupService provides the combined destination query used by the ai-service.
type LookupService struct {
	db *gorm.DB
}

func NewLookupService(db *gorm.DB) *LookupService {
	return &LookupService{db: db}
}

// LookupResult is the response shape for GET /knowledge-base/lookup.
type LookupResult struct {
	Places []models.Place `json:"places"`
	Combos []models.Combo `json:"combos"`
}

// Lookup returns fresh places and combos for a destination.
// staleDays controls how old price_updated_at can be for places.
func (s *LookupService) Lookup(destination string, staleDays int) (*LookupResult, error) {
	dest := strings.ToLower(strings.TrimSpace(destination))
	if dest == "" {
		return nil, errors.New("destination is required")
	}
	if staleDays <= 0 {
		staleDays = 30
	}
	cutoff := time.Now().AddDate(0, 0, -staleDays)

	var places []models.Place
	s.db.Where("destination = ? AND (price_updated_at IS NULL OR price_updated_at >= ?)", dest, cutoff).
		Order("rating DESC NULLS LAST, base_price ASC NULLS LAST").
		Find(&places)

	var combos []models.Combo
	s.db.Where("destination = ?", dest).
		Order("price_per_person ASC NULLS LAST").
		Find(&combos)

	return &LookupResult{
		Places: places,
		Combos: combos,
	}, nil
}
