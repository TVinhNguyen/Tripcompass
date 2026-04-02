package services

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"tripcompass-backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ItineraryService struct {
	db *gorm.DB
}

func NewItineraryService(db *gorm.DB) *ItineraryService {
	return &ItineraryService{db: db}
}

// ---------- DTOs ----------

type CreateItineraryInput struct {
	Title          string   `json:"title" binding:"required"`
	Destination    string   `json:"destination" binding:"required"`
	Budget         float64  `json:"budget" binding:"required,gt=0"`
	StartDate      string   `json:"start_date" binding:"required"`
	EndDate        string   `json:"end_date" binding:"required"`
	GuestCount     int      `json:"guest_count"`
	Tags           []string `json:"tags"`
	BudgetCategory string   `json:"budget_category"`
	CoverImageURL  *string  `json:"cover_image_url"`
}

type UpdateItineraryInput struct {
	Title          *string            `json:"title"`
	Destination    *string            `json:"destination"`
	Budget         *float64           `json:"budget"`
	StartDate      *string            `json:"start_date"`
	EndDate        *string            `json:"end_date"`
	GuestCount     *int               `json:"guest_count"`
	Tags           models.StringArray `json:"tags"`
	BudgetCategory *string            `json:"budget_category"`
	CoverImageURL  *string            `json:"cover_image_url"`
	Status         *string            `json:"status"` // DRAFT | PUBLISHED
}

// ---------- Queries ----------

type ExploreFilter struct {
	Destination    string
	BudgetCategory string
	Tags           string
	MinBudget      float64
	MaxBudget      float64
	Sort           string
	Page           int
	Limit          int
}

// ---------- Service methods ----------

func (s *ItineraryService) GetMyItineraries(ownerID string) ([]models.Itinerary, error) {
	var list []models.Itinerary
	err := s.db.Where("owner_id = ?", ownerID).
		Preload("Activities").
		Order("created_at DESC").
		Find(&list).Error
	return list, err
}

func (s *ItineraryService) Create(ownerID string, input CreateItineraryInput) (*models.Itinerary, error) {
	uid, err := uuid.Parse(ownerID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	budgetCat := "MODERATE"
	if input.BudgetCategory != "" {
		budgetCat = input.BudgetCategory
	}
	guestCount := 1
	if input.GuestCount > 0 {
		guestCount = input.GuestCount
	}
	tags := models.StringArray(input.Tags)
	if tags == nil {
		tags = models.StringArray{}
	}

	// Parse dates
	startDate, err := parseDate(input.StartDate)
	if err != nil {
		return nil, fmt.Errorf("start_date không hợp lệ (format: YYYY-MM-DD): %w", err)
	}
	endDate, err := parseDate(input.EndDate)
	if err != nil {
		return nil, fmt.Errorf("end_date không hợp lệ (format: YYYY-MM-DD): %w", err)
	}
	if !endDate.Time.After(startDate.Time) && !endDate.Time.Equal(startDate.Time) {
		return nil, errors.New("end_date phải bằng hoặc sau start_date")
	}

	itinerary := models.Itinerary{
		OwnerID:        uid,
		Title:          input.Title,
		Destination:    input.Destination,
		Budget:         input.Budget,
		StartDate:      startDate,
		EndDate:        endDate,
		GuestCount:     guestCount,
		Tags:           tags,
		BudgetCategory: budgetCat,
		CoverImageURL:  input.CoverImageURL,
		Status:         "DRAFT",
	}

	if err := s.db.Create(&itinerary).Error; err != nil {
		return nil, fmt.Errorf("tạo itinerary thất bại: %w", err)
	}
	return &itinerary, nil
}

func (s *ItineraryService) GetOne(id, ownerID string) (*models.Itinerary, error) {
	var it models.Itinerary
	err := s.db.
		Preload("Activities", func(db *gorm.DB) *gorm.DB {
			return db.Order("day_number ASC, order_index ASC")
		}).
		Preload("Owner").
		Where("id = ?", id).First(&it).Error
	if err != nil {
		return nil, err
	}
	// Allow owner or collaborators – for now allow if owner or itinerary is published
	if it.OwnerID.String() != ownerID && it.Status != "PUBLISHED" {
		return nil, errors.New("forbidden")
	}
	return &it, nil
}

func (s *ItineraryService) Update(id, ownerID string, input UpdateItineraryInput) (*models.Itinerary, error) {
	var it models.Itinerary
	if err := s.db.Where("id = ? AND owner_id = ?", id, ownerID).First(&it).Error; err != nil {
		return nil, errors.New("itinerary not found or forbidden")
	}

	updates := map[string]interface{}{}
	if input.Title != nil {
		updates["title"] = *input.Title
	}
	if input.Destination != nil {
		updates["destination"] = *input.Destination
	}
	if input.Budget != nil {
		updates["budget"] = *input.Budget
	}
	if input.GuestCount != nil {
		updates["guest_count"] = *input.GuestCount
	}
	if input.BudgetCategory != nil {
		updates["budget_category"] = *input.BudgetCategory
	}
	if input.CoverImageURL != nil {
		updates["cover_image_url"] = *input.CoverImageURL
	}
	if input.Tags != nil {
		updates["tags"] = input.Tags
	}
	if input.StartDate != nil {
		t, err := parseDate(*input.StartDate)
		if err != nil {
			return nil, fmt.Errorf("start_date không hợp lệ: %w", err)
		}
		updates["start_date"] = t
	}
	if input.EndDate != nil {
		t, err := parseDate(*input.EndDate)
		if err != nil {
			return nil, fmt.Errorf("end_date không hợp lệ: %w", err)
		}
		updates["end_date"] = t
	}

	if input.Status != nil {
		s := *input.Status
		if s != "DRAFT" && s != "PUBLISHED" {
			return nil, fmt.Errorf("status không hợp lệ: phải là DRAFT hoặc PUBLISHED, nhận được %q", s)
		}
		updates["status"] = s
	}

	if err := s.db.Model(&it).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("cập nhật itinerary thất bại: %w", err)
	}
	// Reload để trả về dữ liệu mới nhất
	s.db.First(&it, "id = ?", id)
	return &it, nil
}

func (s *ItineraryService) Delete(id, ownerID string) error {
	res := s.db.Where("id = ? AND owner_id = ?", id, ownerID).Delete(&models.Itinerary{})
	if res.RowsAffected == 0 {
		return errors.New("itinerary not found or forbidden")
	}
	return res.Error
}

func (s *ItineraryService) Clone(id, requesterID string) (*models.Itinerary, error) {
	var original models.Itinerary
	if err := s.db.Preload("Activities").Where("id = ?", id).First(&original).Error; err != nil {
		return nil, errors.New("itinerary not found")
	}
	if original.Status != "PUBLISHED" && original.OwnerID.String() != requesterID {
		return nil, errors.New("forbidden")
	}

	uid, _ := uuid.Parse(requesterID)
	clonedFrom := original.ID
	clone := models.Itinerary{
		OwnerID:        uid,
		Title:          original.Title + " (clone)",
		Destination:    original.Destination,
		Budget:         original.Budget,
		StartDate:      original.StartDate,
		EndDate:        original.EndDate,
		GuestCount:     original.GuestCount,
		Tags:           models.StringArray(original.Tags),
		BudgetCategory: original.BudgetCategory,
		CoverImageURL:  original.CoverImageURL,
		Status:         "DRAFT",
		ClonedFromID:   &clonedFrom,
	}

	if err := s.db.Create(&clone).Error; err != nil {
		return nil, err
	}

	// Clone activities
	for _, act := range original.Activities {
		newAct := models.Activity{
			ItineraryID:   clone.ID,
			DayNumber:     act.DayNumber,
			OrderIndex:    act.OrderIndex,
			Title:         act.Title,
			Category:      act.Category,
			Lat:           act.Lat,
			Lng:           act.Lng,
			EstimatedCost: act.EstimatedCost,
			StartTime:     act.StartTime,
			EndTime:       act.EndTime,
			ImageURL:      act.ImageURL,
			Notes:         act.Notes,
		}
		s.db.Create(&newAct)
	}

	// increment clone count on original
	s.db.Model(&original).UpdateColumn("clone_count", gorm.Expr("clone_count + 1"))

	// reload
	s.db.Preload("Activities").First(&clone, "id = ?", clone.ID)
	return &clone, nil
}

func (s *ItineraryService) Publish(id, ownerID string) (*models.Itinerary, error) {
	var it models.Itinerary
	if err := s.db.Where("id = ? AND owner_id = ?", id, ownerID).First(&it).Error; err != nil {
		return nil, errors.New("itinerary not found or forbidden")
	}
	newStatus := "PUBLISHED"
	if it.Status == "PUBLISHED" {
		newStatus = "DRAFT"
	}
	s.db.Model(&it).UpdateColumn("status", newStatus)
	it.Status = newStatus
	return &it, nil
}

func (s *ItineraryService) Explore(filter ExploreFilter) ([]models.Itinerary, int64, error) {
	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 || limit > 50 {
		limit = 20
	}
	offset := (page - 1) * limit

	query := s.db.Model(&models.Itinerary{}).
		Preload("Owner").
		Where("status = ?", "PUBLISHED")

	if filter.Destination != "" {
		query = query.Where("destination ILIKE ?", "%"+strings.TrimSpace(filter.Destination)+"%")
	}
	if filter.BudgetCategory != "" {
		query = query.Where("budget_category = ?", filter.BudgetCategory)
	}
	if filter.MinBudget > 0 {
		query = query.Where("budget >= ?", filter.MinBudget)
	}
	if filter.MaxBudget > 0 {
		query = query.Where("budget <= ?", filter.MaxBudget)
	}

	var total int64
	query.Count(&total)

	sort := "created_at DESC"
	switch filter.Sort {
	case "rating":
		sort = "rating DESC"
	case "popular":
		sort = "view_count DESC"
	case "clone":
		sort = "clone_count DESC"
	}

	var list []models.Itinerary
	err := query.Order(sort).Limit(limit).Offset(offset).Find(&list).Error
	return list, total, err
}

// ---------- helpers ----------

const dateLayout = "2006-01-02"

func parseDate(s string) (models.DateOnly, error) {
	if s == "" {
		return models.DateOnly{}, errors.New("date không được để trống")
	}
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return models.DateOnly{}, fmt.Errorf("format phải là YYYY-MM-DD, nhận được: %q", s)
	}
	return models.DateOnly{Time: t}, nil
}

func setItineraryDates(it *models.Itinerary, startDate, endDate string) error {
	start, err := parseDate(startDate)
	if err != nil {
		return fmt.Errorf("start_date: %w", err)
	}
	end, err := parseDate(endDate)
	if err != nil {
		return fmt.Errorf("end_date: %w", err)
	}
	if end.Time.Before(start.Time) {
		return errors.New("end_date phải bằng hoặc sau start_date")
	}
	it.StartDate = start
	it.EndDate = end
	return nil
}
