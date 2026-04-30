package services

import (
	"github.com/lib/pq"
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"tripcompass-backend/internal/apperror"
	"tripcompass-backend/internal/models"
	"tripcompass-backend/internal/viewcounter"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ItineraryService struct {
	db *gorm.DB
	vc *viewcounter.Counter // H10: buffered view counter, may be nil
}

func NewItineraryService(db *gorm.DB) *ItineraryService {
	return &ItineraryService{db: db}
}

// WithViewCounter attaches a Redis-buffered view counter to the service.
func (s *ItineraryService) WithViewCounter(vc *viewcounter.Counter) *ItineraryService {
	s.vc = vc
	return s
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
	Tags           pq.StringArray `json:"tags"`
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
	tags := pq.StringArray(input.Tags)
	if tags == nil {
		tags = pq.StringArray{}
	}

	startDate, err := parseDate(input.StartDate)
	if err != nil {
		return nil, fmt.Errorf("%w: start_date invalid (expected YYYY-MM-DD): %v", apperror.ErrInvalidInput, err)
	}
	endDate, err := parseDate(input.EndDate)
	if err != nil {
		return nil, fmt.Errorf("%w: end_date invalid (expected YYYY-MM-DD): %v", apperror.ErrInvalidInput, err)
	}
	if !endDate.Time.After(startDate.Time) && !endDate.Time.Equal(startDate.Time) {
		return nil, fmt.Errorf("%w: end_date must be on or after start_date", apperror.ErrInvalidInput)
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
		return nil, fmt.Errorf("create itinerary: %w", err)
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
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, err
	}
	// Allow owner or collaborators – for now allow if owner or itinerary is published
	if it.OwnerID.String() != ownerID && it.Status != "PUBLISHED" {
		return nil, apperror.ErrForbidden
	}
	return &it, nil
}

func (s *ItineraryService) Update(id, ownerID string, input UpdateItineraryInput) (*models.Itinerary, error) {
	var it models.Itinerary
	if err := s.db.Where("id = ? AND owner_id = ?", id, ownerID).First(&it).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, apperror.ErrNotFound // owner mismatch or missing — return 404, not 403 (avoids leaking existence)
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
			return nil, fmt.Errorf("%w: start_date invalid (expected YYYY-MM-DD)", apperror.ErrInvalidInput)
		}
		updates["start_date"] = t
	}
	if input.EndDate != nil {
		t, err := parseDate(*input.EndDate)
		if err != nil {
			return nil, fmt.Errorf("%w: end_date invalid (expected YYYY-MM-DD)", apperror.ErrInvalidInput)
		}
		updates["end_date"] = t
	}

	if input.Status != nil {
		s := *input.Status
		if s != "DRAFT" && s != "PUBLISHED" {
			return nil, fmt.Errorf("%w: status must be DRAFT or PUBLISHED, got %q", apperror.ErrInvalidInput, s)
		}
		updates["status"] = s
	}

	if err := s.db.Model(&it).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update itinerary: %w", err)
	}
	// Reload để trả về dữ liệu mới nhất
	s.db.First(&it, "id = ?", id)
	return &it, nil
}

func (s *ItineraryService) Delete(id, ownerID string) error {
	res := s.db.Where("id = ? AND owner_id = ?", id, ownerID).Delete(&models.Itinerary{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return apperror.ErrNotFound // 404: not found or not owned (don't leak existence to non-owners)
	}
	return nil
}

func (s *ItineraryService) Clone(id, requesterID string) (*models.Itinerary, error) {
	var original models.Itinerary
	if err := s.db.Preload("Activities").Where("id = ?", id).First(&original).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperror.ErrNotFound
		}
		return nil, err
	}
	if original.Status != "PUBLISHED" && original.OwnerID.String() != requesterID {
		return nil, apperror.ErrForbidden
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
		Tags:           pq.StringArray(original.Tags),
		BudgetCategory: original.BudgetCategory,
		CoverImageURL:  original.CoverImageURL,
		Status:         "DRAFT",
		ClonedFromID:   &clonedFrom,
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&clone).Error; err != nil {
			return err
		}
		newActs := make([]models.Activity, 0, len(original.Activities))
		for _, act := range original.Activities {
			newActs = append(newActs, models.Activity{
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
			})
		}
		if len(newActs) > 0 {
			if err := tx.CreateInBatches(newActs, 50).Error; err != nil {
				return err
			}
		}
		return tx.Model(&original).UpdateColumn("clone_count", gorm.Expr("clone_count + 1")).Error
	})
	if err != nil {
		return nil, err
	}

	s.db.Preload("Activities").First(&clone, "id = ?", clone.ID)
	return &clone, nil
}

// Publish sets itinerary status explicitly. Accepted statuses: "PUBLISHED", "DRAFT".
func (s *ItineraryService) Publish(id, ownerID, status string) (*models.Itinerary, error) {
	if status != "PUBLISHED" && status != "DRAFT" {
		return nil, fmt.Errorf("%w: status must be PUBLISHED or DRAFT", apperror.ErrInvalidInput)
	}
	var it models.Itinerary
	if err := s.db.Where("id = ? AND owner_id = ?", id, ownerID).First(&it).Error; err != nil {
		return nil, apperror.ErrNotFound
	}
	if err := s.db.Model(&it).UpdateColumn("status", status).Error; err != nil {
		return nil, fmt.Errorf("update status: %w", err)
	}
	it.Status = status
	return &it, nil
}

// GetPublic returns a published itinerary visible to anyone (no auth required).
func (s *ItineraryService) GetPublic(id string) (*models.Itinerary, error) {
	var it models.Itinerary
	err := s.db.
		Preload("Activities", func(db *gorm.DB) *gorm.DB {
			return db.Order("day_number ASC, order_index ASC")
		}).
		Preload("Owner").
		Where("id = ? AND status = ?", id, "PUBLISHED").First(&it).Error
	if err != nil {
		return nil, err
	}
	// H10: buffered view increment — Redis INCR, flushed to DB every 30s by StartFlusher.
	// Falls back to direct DB write if Redis/vc is unavailable.
	if s.vc != nil {
		s.vc.RecordView(context.Background(), it.ID.String())
	} else {
		s.db.Model(&it).UpdateColumn("view_count", gorm.Expr("view_count + 1"))
	}
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
		Preload("Activities", func(db *gorm.DB) *gorm.DB {
			return db.Order("day_number ASC, order_index ASC")
		}).
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
		return models.DateOnly{}, fmt.Errorf("%w: date must not be empty", apperror.ErrInvalidInput)
	}
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return models.DateOnly{}, fmt.Errorf("%w: date must be YYYY-MM-DD, got %q", apperror.ErrInvalidInput, s)
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
		return fmt.Errorf("%w: end_date must be on or after start_date", apperror.ErrInvalidInput)
	}
	it.StartDate = start
	it.EndDate = end
	return nil
}

// CheckWSAccess verifies that userID is either the owner or an ACCEPTED collaborator.
// Used by the WebSocket handler to avoid direct DB access from the transport layer.
func (s *ItineraryService) CheckWSAccess(itineraryID, userID string) error {
	var it models.Itinerary
	if err := s.db.First(&it, "id = ?", itineraryID).Error; err != nil {
		return apperror.ErrNotFound
	}
	if it.OwnerID.String() == userID {
		return nil
	}
	var collab models.Collaborator
	err := s.db.Where("itinerary_id = ? AND user_id = ? AND status = ?",
		itineraryID, userID, "ACCEPTED").First(&collab).Error
	if err == nil {
		return nil
	}
	return apperror.ErrForbidden
}
