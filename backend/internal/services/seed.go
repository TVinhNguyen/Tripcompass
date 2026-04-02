package services

import (
	"fmt"
	"strings"
	"time"
	"tripcompass-backend/internal/models"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type SeedService struct {
	db *gorm.DB
}

func NewSeedService(db *gorm.DB) *SeedService {
	return &SeedService{db: db}
}

// ---------- DTOs ----------

type SeedInput struct {
	Destination string             `json:"destination" binding:"required"`
	Places      []CreatePlaceInput `json:"places"`
	Combos      []CreateComboInput `json:"combos"`
}

type SeedResult struct {
	Destination   string `json:"destination"`
	PlacesCreated int    `json:"places_created"`
	PlacesUpdated int    `json:"places_updated"`
	CombosCreated int    `json:"combos_created"`
	CombosUpdated int    `json:"combos_updated"`
}

// ---------- Methods ----------

func (s *SeedService) BulkUpsert(input SeedInput) (*SeedResult, error) {
	dest := strings.ToLower(strings.TrimSpace(input.Destination))
	if dest == "" {
		return nil, fmt.Errorf("destination is required")
	}

	now := time.Now()
	result := &SeedResult{Destination: dest}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Upsert places
		for _, p := range input.Places {
			category := models.PlaceCategory(strings.ToUpper(strings.TrimSpace(string(p.Category))))
			if !validPlaceCategory(category) {
				return fmt.Errorf("place '%s' has invalid category", p.Name)
			}

			metadata := p.Metadata
			if len(metadata) == 0 {
				metadata = datatypes.JSON([]byte("{}"))
			}

			place := models.Place{
				Destination:         dest,
				Category:            category,
				Name:                strings.TrimSpace(p.Name),
				NameEN:              p.NameEN,
				Address:             p.Address,
				Area:                p.Area,
				Latitude:            p.Latitude,
				Longitude:           p.Longitude,
				CoverImage:          p.CoverImage,
				Rating:              p.Rating,
				Hours:               p.Hours,
				RecommendedDuration: p.RecommendedDuration,
				BasePrice:           p.BasePrice,
				Metadata:            metadata,
				SourceURL:           p.SourceURL,
				PriceUpdatedAt:      &now,
			}

			var existing models.Place
			err := tx.Where("destination = ? AND category = ? AND name = ?", dest, place.Category, place.Name).First(&existing).Error
			if err == gorm.ErrRecordNotFound {
				if err := tx.Create(&place).Error; err != nil {
					return fmt.Errorf("create place '%s': %w", place.Name, err)
				}
				result.PlacesCreated++
			} else if err == nil {
				updates := map[string]interface{}{
					"name_en":               place.NameEN,
					"address":               place.Address,
					"area":                  place.Area,
					"latitude":              place.Latitude,
					"longitude":             place.Longitude,
					"cover_image":           place.CoverImage,
					"rating":                place.Rating,
					"hours":                 place.Hours,
					"recommended_duration":  place.RecommendedDuration,
					"base_price":            place.BasePrice,
					"metadata":              place.Metadata,
					"source_url":            place.SourceURL,
					"price_updated_at":      now,
				}
				if err := tx.Model(&existing).Updates(updates).Error; err != nil {
					return fmt.Errorf("update place '%s': %w", place.Name, err)
				}
				result.PlacesUpdated++
			} else {
				return fmt.Errorf("query place '%s': %w", place.Name, err)
			}
		}

		// Upsert combos
		for _, c := range input.Combos {
			combo := models.Combo{
				Destination:       dest,
				Name:              strings.TrimSpace(c.Name),
				CoverImage:        c.CoverImage,
				Provider:          c.Provider,
				PricePerPerson:    c.PricePerPerson,
				Includes:          models.StringArray(c.Includes),
				Benefits:          models.StringArray(c.Benefits),
				DurationDays:      c.DurationDays,
				RequiresOvernight: c.RequiresOvernight,
				BookURL:           c.BookURL,
				PriceUpdatedAt:    &now,
			}

			var existing models.Combo
			err := tx.Where("destination = ? AND name = ?", dest, combo.Name).First(&existing).Error
			if err == gorm.ErrRecordNotFound {
				if err := tx.Create(&combo).Error; err != nil {
					return fmt.Errorf("create combo '%s': %w", combo.Name, err)
				}
				result.CombosCreated++
			} else if err == nil {
				updates := map[string]interface{}{
					"cover_image":        combo.CoverImage,
					"provider":           combo.Provider,
					"price_per_person":   combo.PricePerPerson,
					"includes":           combo.Includes,
					"benefits":           combo.Benefits,
					"duration_days":      combo.DurationDays,
					"requires_overnight": combo.RequiresOvernight,
					"book_url":           combo.BookURL,
					"price_updated_at":   now,
				}
				if err := tx.Model(&existing).Updates(updates).Error; err != nil {
					return fmt.Errorf("update combo '%s': %w", combo.Name, err)
				}
				result.CombosUpdated++
			} else {
				return fmt.Errorf("query combo '%s': %w", combo.Name, err)
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return result, nil
}
