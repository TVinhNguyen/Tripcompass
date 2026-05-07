package planner

import "time"

// GenerateRequest is the input for the planner engine.
type GenerateRequest struct {
	Destination    string   `json:"destination" binding:"required"`
	StartDate      string   `json:"start_date" binding:"required"` // YYYY-MM-DD
	EndDate        string   `json:"end_date" binding:"required"`   // YYYY-MM-DD
	BudgetVND      int      `json:"budget_vnd" binding:"required"`
	GuestCount     int      `json:"guest_count"`
	PreferenceTags []string `json:"preference_tags,omitempty"`  // ["beach","culture","food","adventure","nature","nightlife"]
	TravelStyle    string   `json:"travel_style,omitempty"`     // "relaxed" | "standard" | "active"
	TravelMonth    int      `json:"travel_month,omitempty"`     // 1-12; inferred from StartDate if absent
	ArrivalTime    string   `json:"arrival_time,omitempty"`     // "10:00" default "15:00"
	DepartureTime  string   `json:"departure_time,omitempty"`   // "18:00" default "10:00"
}

// GenerateResponse is the full output returned to the caller.
type GenerateResponse struct {
	Days               []DayPlan    `json:"days"`
	BudgetRecap        BudgetRecap  `json:"budget_recap"`
	ComboResult        *ComboResult `json:"combo_result,omitempty"`
	Violations         []Violation  `json:"violations,omitempty"`
	BudgetTier         string       `json:"budget_tier"`                    // "survival"|"budget"|"standard"|"premium"
	BudgetWarning      string       `json:"budget_warning,omitempty"`       // user-facing warning for low budget
	SlotTemplate       string       `json:"slot_template"`                  // "relaxed"|"standard"|"active"
	PriceStaleWarnings []string     `json:"price_stale_warnings,omitempty"` // places with stale prices
}

// DayPlan represents one day in the itinerary.
type DayPlan struct {
	DayNum      int        `json:"day_num"`
	DateStr     string     `json:"date_str"` // "Mon 15/04/2026"
	DayType     string     `json:"day_type"` // arrival|standard|full_day|departure
	Slots       []TimeSlot `json:"slots"`
	PrimaryArea string     `json:"primary_area"`
	TravelMin   int        `json:"travel_min"`
	BufferMin   int        `json:"buffer_min"`
}

// TimeSlot is one block in a day (activity or meal).
type TimeSlot struct {
	Start        string     `json:"start"`     // "08:00"
	End          string     `json:"end"`       // "11:30"
	SlotType     string     `json:"slot_type"` // morning_activity|lunch|dinner|buffer|evening
	Place        *SlotPlace `json:"place,omitempty"`
	IsBuffer     bool       `json:"is_buffer"`
	ComboCovered bool       `json:"combo_covered,omitempty"`
}

// SlotPlace is a denormalized place embedded in a time slot.
type SlotPlace struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	NameEN         string     `json:"name_en,omitempty"`
	Category       string     `json:"category"`
	Address        string     `json:"address,omitempty"`
	Area           string     `json:"area,omitempty"`
	Lat            float64    `json:"lat"`
	Lng            float64    `json:"lng"`
	CoverImage     string     `json:"cover_image,omitempty"`
	Images         []string   `json:"images,omitempty"`
	BasePrice      int        `json:"base_price"`
	Duration       int        `json:"duration_min"`
	Hours          string     `json:"hours,omitempty"`
	BestTimeOfDay  string     `json:"best_time_of_day,omitempty"` // "morning"|"afternoon"|"evening"|"any"
	PriceUpdatedAt *time.Time `json:"price_updated_at,omitempty"` // for stale price detection
	IsMustVisit    bool       `json:"is_must_visit"`
	IsFullDay      bool       `json:"is_full_day"`
	IsFree         bool       `json:"is_free"`
	Tags           []string   `json:"tags,omitempty"`
}

// BudgetRecap summarizes spending.
type BudgetRecap struct {
	TotalBudgetVND      int  `json:"total_budget_vnd"`
	AttractionBudgetVND int  `json:"attraction_budget_vnd"`
	AttractionSpentVND  int  `json:"attraction_spent_vnd"`
	FoodBudgetVND       int  `json:"food_budget_vnd"`
	FoodSpentVND        int  `json:"food_spent_vnd"`  // estimated food cost
	MiscBudgetVND       int  `json:"misc_budget_vnd"` // 15% for transport/shopping
	RemainingVND        int  `json:"remaining_vnd"`   // total_budget - attraction - food
	WithinBudget        bool `json:"within_budget"`
}

// ComboResult holds the best combo recommendation.
type ComboResult struct {
	UseCombo       bool    `json:"use_combo"`
	Name           string  `json:"name,omitempty"`
	Provider       string  `json:"provider,omitempty"`
	PricePerPerson int     `json:"price_per_person,omitempty"`
	PriceTotal     int     `json:"price_total,omitempty"`
	SavingsVND     int     `json:"savings_vnd,omitempty"`
	SavingsPct     float64 `json:"savings_pct,omitempty"`
	IncludesLunch  bool    `json:"includes_lunch,omitempty"`
	Reason         string  `json:"reason,omitempty"`
}

// Violation is a scheduling rule violation.
type Violation struct {
	Rule     string `json:"rule"`     // FOOD_REPEAT|OUTDOOR_NIGHT|OVER_BUDGET|STALE_PRICE|CLOSED_HOURS
	Severity string `json:"severity"` // error|warning
	Message  string `json:"message"`
	Day      int    `json:"day,omitempty"`
}
