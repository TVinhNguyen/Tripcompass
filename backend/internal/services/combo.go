package services

import (
	"fmt"
	"strings"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"

	"gorm.io/gorm"
)

type ComboService struct {
	db *gorm.DB
}

func NewComboService(db *gorm.DB) *ComboService {
	return &ComboService{db: db}
}

// ---------- DTOs ----------

type CreateComboInput struct {
	Destination       string   `json:"destination"  binding:"required"`
	Name              string   `json:"name"         binding:"required"`
	CoverImage        *string  `json:"cover_image"`
	Provider          *string  `json:"provider"`
	PricePerPerson    *int     `json:"price_per_person"`
	Includes          []string `json:"includes"`
	Benefits          []string `json:"benefits"`
	DurationDays      *int     `json:"duration_days"`
	RequiresOvernight bool     `json:"requires_overnight"`
	BookURL           *string  `json:"book_url"`
}

type UpdateComboInput struct {
	Destination       *string  `json:"destination"`
	Name              *string  `json:"name"`
	CoverImage        *string  `json:"cover_image"`
	Provider          *string  `json:"provider"`
	PricePerPerson    *int     `json:"price_per_person"`
	Includes          []string `json:"includes"`
	Benefits          []string `json:"benefits"`
	DurationDays      *int     `json:"duration_days"`
	RequiresOvernight *bool    `json:"requires_overnight"`
	BookURL           *string  `json:"book_url"`
}

// ---------- Methods ----------

type ComboListResult struct {
	Data  []models.Combo `json:"data"`
	Total int64          `json:"total"`
	Page  int            `json:"page"`
	Limit int            `json:"limit"`
}

func (s *ComboService) List(destination string, page, limit int) (*ComboListResult, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	q := s.db.Model(&models.Combo{}).Order("destination ASC, name ASC")
	if destination != "" {
		q = q.Where("destination ILIKE ?", "%"+strings.TrimSpace(destination)+"%")
	}

	var total int64
	q.Count(&total)

	var list []models.Combo
	err := q.Limit(limit).Offset(offset).Find(&list).Error
	return &ComboListResult{Data: list, Total: total, Page: page, Limit: limit}, err
}

func (s *ComboService) GetByID(id string) (*models.Combo, error) {
	var c models.Combo
	if err := s.db.First(&c, "id = ?", id).Error; err != nil {
		return nil, apperror.ErrNotFound
	}
	return &c, nil
}

func (s *ComboService) Create(input CreateComboInput) (*models.Combo, error) {
	c := models.Combo{
		Destination:       strings.ToLower(strings.TrimSpace(input.Destination)),
		Name:              input.Name,
		CoverImage:        input.CoverImage,
		Provider:          input.Provider,
		PricePerPerson:    input.PricePerPerson,
		Includes:          models.StringArray(input.Includes),
		Benefits:          models.StringArray(input.Benefits),
		DurationDays:      input.DurationDays,
		RequiresOvernight: input.RequiresOvernight,
		BookURL:           input.BookURL,
	}
	if err := s.db.Create(&c).Error; err != nil {
		return nil, fmt.Errorf("tạo combo thất bại: %w", err)
	}
	return &c, nil
}

func (s *ComboService) Update(id string, input UpdateComboInput) (*models.Combo, error) {
	var c models.Combo
	if err := s.db.First(&c, "id = ?", id).Error; err != nil {
		return nil, apperror.ErrNotFound
	}

	updates := map[string]interface{}{}
	if input.Destination != nil {
		updates["destination"] = strings.ToLower(strings.TrimSpace(*input.Destination))
	}
	if input.Name != nil {
		updates["name"] = *input.Name
	}
	if input.CoverImage != nil {
		updates["cover_image"] = *input.CoverImage
	}
	if input.Provider != nil {
		updates["provider"] = *input.Provider
	}
	if input.PricePerPerson != nil {
		updates["price_per_person"] = *input.PricePerPerson
	}
	if input.Includes != nil {
		updates["includes"] = models.StringArray(input.Includes)
	}
	if input.Benefits != nil {
		updates["benefits"] = models.StringArray(input.Benefits)
	}
	if input.DurationDays != nil {
		updates["duration_days"] = *input.DurationDays
	}
	if input.RequiresOvernight != nil {
		updates["requires_overnight"] = *input.RequiresOvernight
	}
	if input.BookURL != nil {
		updates["book_url"] = *input.BookURL
	}

	if err := s.db.Model(&c).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("cập nhật combo thất bại: %w", err)
	}
	s.db.First(&c, "id = ?", id)
	return &c, nil
}

func (s *ComboService) Delete(id string) error {
	res := s.db.Delete(&models.Combo{}, "id = ?", id)
	if res.RowsAffected == 0 {
		return apperror.ErrNotFound
	}
	return res.Error
}
