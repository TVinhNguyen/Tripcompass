package services

import (
	"github.com/lib/pq"
	"fmt"
	"strings"
	"time"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"

	"github.com/lib/pq"
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
	Destination         *string               `json:"destination"`
	Category            *models.PlaceCategory `json:"category"`
	Name                *string               `json:"name"`
	NameEN              *string               `json:"name_en"`
	Description         *string               `json:"description"`
	Address             *string               `json:"address"`
	Area                *string               `json:"area"`
	Latitude            *float64              `json:"latitude"`
	Longitude           *float64              `json:"longitude"`
	CoverImage          *string               `json:"cover_image"`
	Rating              *float64              `json:"rating"`
	ReviewCount         *int                  `json:"review_count"`
	Hours               *string               `json:"hours"`
	RecommendedDuration *int                  `json:"recommended_duration"`
	BasePrice           *int                  `json:"base_price"`
	Phone               *string               `json:"phone"`
	Website             *string               `json:"website"`
	ExternalID          *string               `json:"external_id"`
	ExternalSource      *string               `json:"external_source"`
	Metadata            *datatypes.JSON       `json:"metadata"`
	SourceURL           *string               `json:"source_url"`
	MustVisit           *bool                 `json:"must_visit"`
	PriorityScore       *int                  `json:"priority_score"`
	BestTimeOfDay       *string               `json:"best_time_of_day"`
	Tags                []string              `json:"tags"`
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

type PlaceListFilter struct {
	Q           string
	Destination string
	Category    string
	Area        string
	Tags        []string
	MinRating   float64
	MinPrice    int
	MaxPrice    int
	MustVisit   *bool
	Sort        string
	Page        int
	Limit       int
}

type DestinationStat struct {
	Name  string `json:"name"`
	Slug  string `json:"slug"`
	Count int64  `json:"count"`
}

func (s *PlaceService) List(destination, category string, page, limit int) (*PlaceListResult, error) {
	return s.Search(PlaceListFilter{
		Destination: destination,
		Category:    category,
		Page:        page,
		Limit:       limit,
	})
}

func (s *PlaceService) Search(filter PlaceListFilter) (*PlaceListResult, error) {
	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	q := s.db.Model(&models.Place{})
	if filter.Q != "" {
		like := "%" + strings.TrimSpace(filter.Q) + "%"
		q = q.Where("(name ILIKE ? OR name_en ILIKE ? OR description ILIKE ? OR address ILIKE ?)", like, like, like, like)
	}
	if filter.Destination != "" {
		q = q.Where("destination ILIKE ?", "%"+strings.TrimSpace(filter.Destination)+"%")
	}
	if filter.Category != "" {
		q = q.Where("category = ?", strings.ToUpper(strings.TrimSpace(filter.Category)))
	}
	if filter.Area != "" {
		q = q.Where("area ILIKE ?", "%"+strings.TrimSpace(filter.Area)+"%")
	}
	if len(filter.Tags) > 0 {
		q = q.Where("tags && ?", pq.Array(filter.Tags))
	}
	if filter.MinRating > 0 {
		q = q.Where("rating >= ?", filter.MinRating)
	}
	if filter.MinPrice > 0 {
		q = q.Where("base_price >= ?", filter.MinPrice)
	}
	if filter.MaxPrice > 0 {
		q = q.Where("base_price <= ?", filter.MaxPrice)
	}
	if filter.MustVisit != nil {
		q = q.Where("must_visit = ?", *filter.MustVisit)
	}

	var total int64
	q.Count(&total)

	order := "destination ASC, name ASC"
	switch strings.ToLower(strings.TrimSpace(filter.Sort)) {
	case "rating":
		order = "rating DESC NULLS LAST, review_count DESC, name ASC"
	case "popular":
		order = "review_count DESC, rating DESC NULLS LAST, name ASC"
	case "priority":
		order = "priority_score DESC, rating DESC NULLS LAST, name ASC"
	case "name":
		order = "name ASC"
	}

	var list []models.Place
	err := q.Order(order).Limit(limit).Offset(offset).Find(&list).Error
	return &PlaceListResult{Data: list, Total: total, Page: page, Limit: limit}, err
}

func (s *PlaceService) ListDestinations() ([]DestinationStat, error) {
	var rows []struct {
		Name  string
		Count int64
	}
	if err := s.db.Model(&models.Place{}).
		Select("destination AS name, COUNT(*) AS count").
		Where("destination <> ''").
		Group("destination").
		Order("count DESC, destination ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]DestinationStat, 0, len(rows))
	for _, row := range rows {
		result = append(result, DestinationStat{
			Name:  row.Name,
			Slug:  slugifyDestination(row.Name),
			Count: row.Count,
		})
	}
	return result, nil
}

func slugifyDestination(s string) string {
	replacer := strings.NewReplacer(
		"Đ", "D", "đ", "d",
		"À", "A", "Á", "A", "Ả", "A", "Ã", "A", "Ạ", "A", "Ă", "A", "Ằ", "A", "Ắ", "A", "Ẳ", "A", "Ẵ", "A", "Ặ", "A", "Â", "A", "Ầ", "A", "Ấ", "A", "Ẩ", "A", "Ẫ", "A", "Ậ", "A",
		"à", "a", "á", "a", "ả", "a", "ã", "a", "ạ", "a", "ă", "a", "ằ", "a", "ắ", "a", "ẳ", "a", "ẵ", "a", "ặ", "a", "â", "a", "ầ", "a", "ấ", "a", "ẩ", "a", "ẫ", "a", "ậ", "a",
		"È", "E", "É", "E", "Ẻ", "E", "Ẽ", "E", "Ẹ", "E", "Ê", "E", "Ề", "E", "Ế", "E", "Ể", "E", "Ễ", "E", "Ệ", "E",
		"è", "e", "é", "e", "ẻ", "e", "ẽ", "e", "ẹ", "e", "ê", "e", "ề", "e", "ế", "e", "ể", "e", "ễ", "e", "ệ", "e",
		"Ì", "I", "Í", "I", "Ỉ", "I", "Ĩ", "I", "Ị", "I", "ì", "i", "í", "i", "ỉ", "i", "ĩ", "i", "ị", "i",
		"Ò", "O", "Ó", "O", "Ỏ", "O", "Õ", "O", "Ọ", "O", "Ô", "O", "Ồ", "O", "Ố", "O", "Ổ", "O", "Ỗ", "O", "Ộ", "O", "Ơ", "O", "Ờ", "O", "Ớ", "O", "Ở", "O", "Ỡ", "O", "Ợ", "O",
		"ò", "o", "ó", "o", "ỏ", "o", "õ", "o", "ọ", "o", "ô", "o", "ồ", "o", "ố", "o", "ổ", "o", "ỗ", "o", "ộ", "o", "ơ", "o", "ờ", "o", "ớ", "o", "ở", "o", "ỡ", "o", "ợ", "o",
		"Ù", "U", "Ú", "U", "Ủ", "U", "Ũ", "U", "Ụ", "U", "Ư", "U", "Ừ", "U", "Ứ", "U", "Ử", "U", "Ữ", "U", "Ự", "U",
		"ù", "u", "ú", "u", "ủ", "u", "ũ", "u", "ụ", "u", "ư", "u", "ừ", "u", "ứ", "u", "ử", "u", "ữ", "u", "ự", "u",
		"Ỳ", "Y", "Ý", "Y", "Ỷ", "Y", "Ỹ", "Y", "Ỵ", "Y", "ỳ", "y", "ý", "y", "ỷ", "y", "ỹ", "y", "ỵ", "y",
	)
	s = strings.ToLower(replacer.Replace(strings.TrimSpace(s)))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
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
		Images:              nilSafePQArray(input.Images),
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
		Tags:                nilSafePQArray(input.Tags),
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
		updates["tags"] = pq.StringArray(input.Tags)
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
