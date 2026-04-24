package planner

import "strings"

// ─── Budget Tier ──────────────────────────────────────────────────────────────

// BudgetTier classifies a trip by daily budget per person.
type BudgetTier int

const (
	TierSurvival BudgetTier = iota // daily < minCost(dest)
	TierBudget                      // minCost <= daily < 700k
	TierStandard                    // 700k <= daily < 2M
	TierPremium                     // daily >= 2M
)

func (t BudgetTier) String() string {
	switch t {
	case TierSurvival:
		return "survival"
	case TierBudget:
		return "budget"
	case TierStandard:
		return "standard"
	case TierPremium:
		return "premium"
	default:
		return "standard"
	}
}

// ─── Budget Constraints ───────────────────────────────────────────────────────

// BudgetConstraints is derived from BudgetTier and constrains engine queries.
type BudgetConstraints struct {
	MaxAttractionPrice  int    // VND per person per ticket; 0 = no limit
	OnlyFreeAttractions bool   // true in extreme survival mode
	FoodMode            string // "street" | "local" | "restaurant" | "fine"
	MaxMealCost         int    // VND per person per meal; 0 = no limit
	AllowDayTrips       bool   // inject neighboring destinations (Hội An, Mỹ Sơn)
	AllowFullDayPremium bool   // allow Bà Nà Hills, Cù Lao Chàm (>500k/person)
	WarnMessage         string // user-visible budget warning; empty = no warning
}

// ─── Slot Template ────────────────────────────────────────────────────────────

// SlotTemplate controls the daily schedule pacing and number of activities.
type SlotTemplate string

const (
	TemplateRelaxed  SlotTemplate = "relaxed"  // 09:00 start, ≤2 activities/day
	TemplateStandard SlotTemplate = "standard" // 08:00 start, ≤3 activities/day (default)
	TemplateActive   SlotTemplate = "active"   // 07:00 start, ≤4 activities/day
)

// morningStartMin returns the start-of-day time in minutes for each template.
func (t SlotTemplate) morningStartMin() int {
	switch t {
	case TemplateRelaxed:
		return 9 * 60 // 09:00
	case TemplateActive:
		return 7 * 60 // 07:00
	default:
		return 8 * 60 // 08:00
	}
}

// maxActivitiesPerDay returns the cap on activities per standard day.
func (t SlotTemplate) maxActivitiesPerDay() int {
	switch t {
	case TemplateRelaxed:
		return 2
	case TemplateActive:
		return 4
	default:
		return 3
	}
}

// ─── Planning Strategy ────────────────────────────────────────────────────────

// PlanningStrategy is computed once before the engine runs and drives all
// downstream decisions: which places are queried, how slots are built, etc.
type PlanningStrategy struct {
	Tier     BudgetTier
	Budget   BudgetConstraints
	Template SlotTemplate
}

// ─── Minimum daily cost table ─────────────────────────────────────────────────

// destMinDailyCostVND maps destination → minimum viable daily cost per person (VND).
// Calculation basis: cheapest hostel dorm + 3 local street-food meals.
var destMinDailyCostVND = map[string]int{
	"hà nội":      200_000,
	"đà nẵng":     250_000,
	"hội an":      300_000,
	"hồ chí minh": 230_000,
	"nha trang":   270_000,
	"đà lạt":      220_000,
	"phú quốc":    400_000,
	"mũi né":      250_000,
	"huế":         220_000,
	"vũng tàu":    240_000,
	"quảng bình":  200_000,
}

// MinDailyCost returns the minimum viable daily cost per person for a destination.
func MinDailyCost(destination string) int {
	dest := strings.ToLower(strings.TrimSpace(destination))
	if cost, ok := destMinDailyCostVND[dest]; ok {
		return cost
	}
	return 250_000 // conservative default
}

// ─── BuildStrategy ────────────────────────────────────────────────────────────

// BuildStrategy derives the full PlanningStrategy from a GenerateRequest.
// This is called once at the top of Engine.Generate() before any DB queries.
func BuildStrategy(req GenerateRequest) PlanningStrategy {
	numDays := 1
	if n, err := computeNumDays(req.StartDate, req.EndDate); err == nil && n > 0 {
		numDays = n
	}
	guestCount := req.GuestCount
	if guestCount <= 0 {
		guestCount = 2
	}

	// Guard: zero or negative budget
	if req.BudgetVND <= 0 {
		return PlanningStrategy{
			Tier: TierSurvival,
			Budget: BudgetConstraints{
				OnlyFreeAttractions: true,
				FoodMode:            "street",
				MaxMealCost:         30_000,
				WarnMessage:         "Ngân sách không hợp lệ. Chỉ hiển thị các điểm tham quan miễn phí.",
			},
			Template: TemplateStandard,
		}
	}

	dailyPerPerson := req.BudgetVND / guestCount / numDays
	minCost := MinDailyCost(req.Destination)

	var tier BudgetTier
	switch {
	case dailyPerPerson < minCost:
		tier = TierSurvival
	case dailyPerPerson < 700_000:
		tier = TierBudget
	case dailyPerPerson < 2_000_000:
		tier = TierStandard
	default:
		tier = TierPremium
	}

	constraints := budgetConstraintsForTier(tier, dailyPerPerson, minCost)

	// Dynamic MaxMealCost: cap by actual per-meal allowance from food budget.
	// Food budget is 40% of total. Per meal per person = foodBudget / guests / (days*3).
	// Use the lower of the tier cap and the trip-specific per-meal allowance.
	if req.BudgetVND > 0 && guestCount > 0 && numDays > 0 {
		foodBudget := int(float64(req.BudgetVND) * 0.40)
		perMealPerPerson := foodBudget / guestCount / (numDays * 3)
		if perMealPerPerson > 0 && (constraints.MaxMealCost == 0 || perMealPerPerson < constraints.MaxMealCost) {
			constraints.MaxMealCost = perMealPerPerson
		}
	}

	return PlanningStrategy{
		Tier:     tier,
		Budget:   constraints,
		Template: templateFromRequest(req),
	}
}

// budgetConstraintsForTier returns the constraints for a given tier.
func budgetConstraintsForTier(tier BudgetTier, dailyPerPerson, minCost int) BudgetConstraints {
	switch tier {
	case TierSurvival:
		onlyFree := dailyPerPerson < minCost/2
		warn := "Ngân sách thấp hơn mức tối thiểu tại điểm đến. Lịch trình được điều chỉnh phù hợp."
		if onlyFree {
			warn = "Ngân sách rất hạn chế (dưới 50% mức tối thiểu). Chỉ hiển thị các điểm tham quan miễn phí."
		}
		return BudgetConstraints{
			MaxAttractionPrice:  50_000,
			OnlyFreeAttractions: onlyFree,
			FoodMode:            "street",
			MaxMealCost:         30_000,
			AllowDayTrips:       false,
			AllowFullDayPremium: false,
			WarnMessage:         warn,
		}
	case TierBudget:
		return BudgetConstraints{
			MaxAttractionPrice:  200_000,
			OnlyFreeAttractions: false,
			FoodMode:            "local",
			MaxMealCost:         120_000, // local restaurants in Vietnam avg 80-120k/person
			AllowDayTrips:       false,
			AllowFullDayPremium: false,
		}
	case TierStandard:
		return BudgetConstraints{
			MaxAttractionPrice:  1_500_000,
			OnlyFreeAttractions: false,
			FoodMode:            "restaurant",
			MaxMealCost:         200_000,
			AllowDayTrips:       true,
			AllowFullDayPremium: true,
		}
	default: // TierPremium
		return BudgetConstraints{
			MaxAttractionPrice:  0, // no limit
			OnlyFreeAttractions: false,
			FoodMode:            "fine",
			MaxMealCost:         0, // no limit
			AllowDayTrips:       true,
			AllowFullDayPremium: true,
		}
	}
}

// templateFromRequest infers the SlotTemplate from travel style and preference tags.
func templateFromRequest(req GenerateRequest) SlotTemplate {
	style := strings.ToLower(strings.TrimSpace(req.TravelStyle))
	switch style {
	case "active", "adventure":
		return TemplateActive
	case "relaxed", "chill", "beach":
		return TemplateRelaxed
	}

	// Infer from preference tags when travel_style is absent
	activeTags := map[string]bool{"adventure": true, "hiking": true, "sport": true, "active": true}
	relaxedTags := map[string]bool{"beach": true, "chill": true, "relaxed": true, "spa": true}
	activeScore, relaxedScore := 0, 0
	for _, p := range req.PreferenceTags {
		pl := strings.ToLower(p)
		if activeTags[pl] {
			activeScore++
		}
		if relaxedTags[pl] {
			relaxedScore++
		}
	}
	if activeScore > relaxedScore {
		return TemplateActive
	}
	if relaxedScore > activeScore {
		return TemplateRelaxed
	}
	return TemplateStandard
}
