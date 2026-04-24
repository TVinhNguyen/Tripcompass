package services

import (
	"fmt"
	"strings"
	"time"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type PlaceService struct {
	db *gorm.DB
}

func NewPlaceService(db *gorm.DB) *PlaceService {
	return &PlaceService{db: db}
}

// ---------- DTOs ----------

type CreatePlaceInput struct {
	Destination         string               `json:"destination" binding:"required"`
	Category            models.PlaceCategory `json:"category" binding:"required"`
	Name                string               `json:"name" binding:"required"`
	NameEN              *string              `json:"name_en"`
	Description         *string              `json:"description"`
	Address             *string              `json:"address"`
	Area                *string              `json:"area"`
	Latitude            *float64             `json:"latitude"`
	Longitude           *float64             `json:"longitude"`
	CoverImage          *string              `json:"cover_image"`
	Images              []string             `json:"images"`
	Rating              *float64             `json:"rating"`
	ReviewCount         int                  `json:"review_count"`
	Hours               *string              `json:"hours"`
	RecommendedDuration *int                 `json:"recommended_duration"`
	BasePrice           *int                 `json:"base_price"`
	Phone               *string              `json:"phone"`
	Website             *string              `json:"website"`
	ExternalID          *string              `json:"external_id"`
	ExternalSource      *string              `json:"external_source"`
	Metadata            datatypes.JSON       `json:"metadata"`
	SourceURL           *string              `json:"source_url"`
	MustVisit           bool                 `json:"must_visit"`
	PriorityScore       int                  `json:"priority_score"`
	BestTimeOfDay       *string              `json:"best_time_of_day"`
	Tags                []string             `json:"tags"`
}

type UpdatePlaceInput struct {
	Destination         *string              `json:"destination"`
	Category            *models.PlaceCategory `json:"category"`
	Name                *string              `json:"name"`
	NameEN              *string              `json:"name_en"`
	Description         *string              `json:"description"`
	Address             *string              `json:"address"`
	Area                *string              `json:"area"`
	Latitude            *float64             `json:"latitude"`
	Longitude           *float64             `json:"longitude"`
	CoverImage          *string              `json:"cover_image"`
	Rating              *float64             `json:"rating"`
	ReviewCount         *int                 `json:"review_count"`
	Hours               *string              `json:"hours"`
	RecommendedDuration *int                 `json:"recommended_duration"`
	BasePrice           *int                 `json:"base_price"`
	Phone               *string              `json:"phone"`
	Website             *string              `json:"website"`
	ExternalID          *string              `json:"external_id"`
	ExternalSource      *string              `json:"external_source"`
	Metadata            *datatypes.JSON      `json:"metadata"`
	SourceURL           *string              `json:"source_url"`
	MustVisit           *bool                `json:"must_visit"`
	PriorityScore       *int                 `json:"priority_score"`
	BestTimeOfDay       *string              `json:"best_time_of_day"`
	Tags                []string             `json:"tags"`
}

func validPlaceCategory(c models.PlaceCategory) bool {
	switch c {
	case models.CategoryAttraction, models.CategoryFood, models.CategoryStay:
		return true
	default:
		return false
	}
}

// ---------- Methods ----------

// ListResult wraps paginated results.
type PlaceListResult struct {
	Data  []models.Place `json:"data"`
	Total int64          `json:"total"`
	Page  int            `json:"page"`
	Limit int            `json:"limit"`
}

func (s *PlaceService) List(destination, category string, page, limit int) (*PlaceListResult, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	q := s.db.Model(&models.Place{}).Order("destination ASC, name ASC")
	if destination != "" {
		q = q.Where("destination ILIKE ?", "%"+strings.TrimSpace(destination)+"%")
	}
	if category != "" {
		q = q.Where("category = ?", strings.ToUpper(strings.TrimSpace(category)))
	}

	var total int64
	q.Count(&total)

	var list []models.Place
	err := q.Limit(limit).Offset(offset).Find(&list).Error
	return &PlaceListResult{Data: list, Total: total, Page: page, Limit: limit}, err
}

func (s *PlaceService) GetByID(id string) (*models.Place, error) {
	var p models.Place
	if err := s.db.First(&p, "id = ?", id).Error; err != nil {
		return nil, apperror.ErrNotFound
	}
	return &p, nil
}

func (s *PlaceService) Create(input CreatePlaceInput) (*models.Place, error) {
	category := models.PlaceCategory(strings.ToUpper(strings.TrimSpace(string(input.Category))))
	if !validPlaceCategory(category) {
		return nil, fmt.Errorf("category must be one of: ATTRACTION, FOOD, STAY")
	}

	now := time.Now()
	p := models.Place{
		Destination:         strings.ToLower(strings.TrimSpace(input.Destination)),
		Category:            category,
		Name:                input.Name,
		NameEN:              input.NameEN,
		Description:         input.Description,
		Address:             input.Address,
		Area:                input.Area,
		Latitude:            input.Latitude,
		Longitude:           input.Longitude,
		CoverImage:          input.CoverImage,
		Images:              models.StringArray(input.Images),
		Rating:              input.Rating,
		ReviewCount:         input.ReviewCount,
		Hours:               input.Hours,
		RecommendedDuration: input.RecommendedDuration,
		BasePrice:           input.BasePrice,
		Phone:               input.Phone,
		Website:             input.Website,
		ExternalID:          input.ExternalID,
		ExternalSource:      input.ExternalSource,
		Metadata:            input.Metadata,
		SourceURL:           input.SourceURL,
		MustVisit:           input.MustVisit,
		PriorityScore:       input.PriorityScore,
		BestTimeOfDay:       input.BestTimeOfDay,
		Tags:                models.StringArray(input.Tags),
		PriceUpdatedAt:      &now,
	}
	if err := s.db.Create(&p).Error; err != nil {
		return nil, fmt.Errorf("tạo place thất bại: %w", err)
	}
	return &p, nil
}

func (s *PlaceService) Update(id string, input UpdatePlaceInput) (*models.Place, error) {
	var p models.Place
	if err := s.db.First(&p, "id = ?", id).Error; err != nil {
		return nil, apperror.ErrNotFound
	}

	updates := map[string]interface{}{}
	if input.Destination != nil {
		updates["destination"] = strings.ToLower(strings.TrimSpace(*input.Destination))
	}
	if input.Category != nil {
		category := models.PlaceCategory(strings.ToUpper(strings.TrimSpace(string(*input.Category))))
		if !validPlaceCategory(category) {
			return nil, fmt.Errorf("category must be one of: ATTRACTION, FOOD, STAY")
		}
		updates["category"] = category
	}
	if input.Name != nil {
		updates["name"] = *input.Name
	}
	if input.NameEN != nil {
		updates["name_en"] = *input.NameEN
	}
	if input.Address != nil {
		updates["address"] = *input.Address
	}
	if input.Area != nil {
		updates["area"] = *input.Area
	}
	if input.Latitude != nil {
		updates["latitude"] = *input.Latitude
	}
	if input.Longitude != nil {
		updates["longitude"] = *input.Longitude
	}
	if input.CoverImage != nil {
		updates["cover_image"] = *input.CoverImage
	}
	if input.Rating != nil {
		updates["rating"] = *input.Rating
	}
	if input.Hours != nil {
		updates["hours"] = *input.Hours
	}
	if input.RecommendedDuration != nil {
		updates["recommended_duration"] = *input.RecommendedDuration
	}
	if input.BasePrice != nil {
		updates["base_price"] = *input.BasePrice
		now := time.Now()
		updates["price_updated_at"] = now
	}
	if input.Metadata != nil {
		updates["metadata"] = *input.Metadata
	}
	if input.SourceURL != nil {
		updates["source_url"] = *input.SourceURL
	}
	if input.MustVisit != nil {
		updates["must_visit"] = *input.MustVisit
	}
	if input.PriorityScore != nil {
		updates["priority_score"] = *input.PriorityScore
	}
	if input.BestTimeOfDay != nil {
		updates["best_time_of_day"] = *input.BestTimeOfDay
	}
	if input.Tags != nil {
		updates["tags"] = models.StringArray(input.Tags)
	}
	if input.Description != nil {
		updates["description"] = *input.Description
	}
	if input.ReviewCount != nil {
		updates["review_count"] = *input.ReviewCount
	}
	if input.Phone != nil {
		updates["phone"] = *input.Phone
	}
	if input.Website != nil {
		updates["website"] = *input.Website
	}
	if input.ExternalID != nil {
		updates["external_id"] = *input.ExternalID
	}
	if input.ExternalSource != nil {
		updates["external_source"] = *input.ExternalSource
	}

	if err := s.db.Model(&p).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("cập nhật place thất bại: %w", err)
	}
	s.db.First(&p, "id = ?", id)
	return &p, nil
}

func (s *PlaceService) Delete(id string) error {
	res := s.db.Delete(&models.Place{}, "id = ?", id)
	if res.RowsAffected == 0 {
		return apperror.ErrNotFound
	}
	return res.Error
}
