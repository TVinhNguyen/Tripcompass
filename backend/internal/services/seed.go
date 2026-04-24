package services

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"tripcompass-backend/internal/models"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// parseHoursToOpenClose extracts open/close time strings from hours like "08:00 - 17:00"
func parseHoursToOpenClose(hours string) (open, close *string) {
	re := regexp.MustCompile(`(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})`)
	m := re.FindStringSubmatch(hours)
	if len(m) == 3 {
		o, c := m[1], m[2]
		return &o, &c
	}
	return nil, nil
}

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

			var openTime, closeTime *string
			if p.Hours != nil {
				openTime, closeTime = parseHoursToOpenClose(*p.Hours)
			}

			place := models.Place{
				Destination:         dest,
				Category:            category,
				Name:                strings.TrimSpace(p.Name),
				NameEN:              p.NameEN,
				Description:         p.Description,
				Address:             p.Address,
				Area:                p.Area,
				Latitude:            p.Latitude,
				Longitude:           p.Longitude,
				CoverImage:          p.CoverImage,
				Images:              models.StringArray(p.Images),
				Rating:              p.Rating,
				ReviewCount:         p.ReviewCount,
				Hours:               p.Hours,
				RecommendedDuration: p.RecommendedDuration,
				BasePrice:           p.BasePrice,
				Phone:               p.Phone,
				Website:             p.Website,
				ExternalID:          p.ExternalID,
				ExternalSource:      p.ExternalSource,
				Metadata:            metadata,
				SourceURL:           p.SourceURL,
				MustVisit:           p.MustVisit,
				PriorityScore:       p.PriorityScore,
				BestTimeOfDay:       p.BestTimeOfDay,
				Tags:                models.StringArray(p.Tags),
				OpenTime:            openTime,
				CloseTime:           closeTime,
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
					"description":           place.Description,
					"address":               place.Address,
					"area":                  place.Area,
					"latitude":              place.Latitude,
					"longitude":             place.Longitude,
					"cover_image":           place.CoverImage,
					"images":                place.Images,
					"rating":                place.Rating,
					"review_count":          place.ReviewCount,
					"hours":                 place.Hours,
					"open_time":             place.OpenTime,
					"close_time":            place.CloseTime,
					"recommended_duration":  place.RecommendedDuration,
					"base_price":            place.BasePrice,
					"phone":                 place.Phone,
					"website":               place.Website,
					"external_id":           place.ExternalID,
					"external_source":       place.ExternalSource,
					"metadata":              place.Metadata,
					"source_url":            place.SourceURL,
					"must_visit":            place.MustVisit,
					"priority_score":        place.PriorityScore,
					"best_time_of_day":      place.BestTimeOfDay,
					"tags":                  place.Tags,
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
