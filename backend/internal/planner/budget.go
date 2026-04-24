package planner

import (
	"sort"
	"strings"
	"tripcompass-backend/internal/models"
)

const (
	attrBudgetRatio   = 0.45
	foodBudgetRatio   = 0.40
	maxDurationPerDay = 600 // minutes
)

// SelectAttractions picks places within the attraction budget, filtered by BudgetConstraints.
//
// Priority order:
//  1. must_visit (always included, even if slightly over budget)
//  2. free attractions (always included when OnlyFreeAttractions=false)
//  3. paid attractions sorted by (priority_score + preference_score) desc, within budget cap
//
// Constraints from strategy:
//   - OnlyFreeAttractions: skip all paid places (survival mode)
//   - MaxAttractionPrice: skip paid places above this per-person ticket price
//   - AllowFullDayPremium: skip full-day attractions (Bà Nà, Cù Lao Chàm) if false
func SelectAttractions(
	places []models.Place,
	budgetVND, guestCount int,
	prefs []string,
	constraints BudgetConstraints,
) []SlotPlace {
	// Effective attraction budget for total spend tracking
	attrBudget := int(float64(budgetVND) * attrBudgetRatio)
	if constraints.MaxAttractionPrice == 0 && !constraints.OnlyFreeAttractions {
		// Premium tier: give more room for attractions
		attrBudget = int(float64(budgetVND) * 0.55)
	}

	spent := 0
	selected := []SlotPlace{}

	mustVisit := []models.Place{}
	free := []models.Place{}
	paid := []models.Place{}

	for _, p := range places {
		price := 0
		if p.BasePrice != nil {
			price = *p.BasePrice
		}

		// Determine if this is a full-day premium place
		isFullDay := isFullDayPlace(p)

		// Skip full-day premium when tier doesn't allow (Budget/Survival), including must-visit.
		// Full-day premium places like Ba Na Hills (1M/person) are simply unaffordable at these tiers.
		if isFullDay && !constraints.AllowFullDayPremium {
			continue
		}

		// Survival: only free attractions (must-visit override: allow if free)
		if constraints.OnlyFreeAttractions && price > 0 && !p.MustVisit {
			continue
		}

		// Filter by max per-person ticket price.
		// Must-visit places get a 2x override (e.g. 200k cap → allow up to 400k).
		// Full-day premium is already excluded above so this only affects normal must-visit.
		if constraints.MaxAttractionPrice > 0 && price > 0 {
			cap := constraints.MaxAttractionPrice
			if p.MustVisit {
				cap = cap * 2 // small override for must-visit, not unlimited
			}
			if price > cap {
				continue
			}
		}

		if p.MustVisit {
			mustVisit = append(mustVisit, p)
		} else if price == 0 {
			free = append(free, p)
		} else {
			paid = append(paid, p)
		}
	}

	// Sort paid by (priority_score + preference_score) desc, then rating desc
	sort.Slice(paid, func(i, j int) bool {
		si := float64(paid[i].PriorityScore) + scoreWithPreference(toSlotPlace(paid[i]), prefs)
		sj := float64(paid[j].PriorityScore) + scoreWithPreference(toSlotPlace(paid[j]), prefs)
		if si != sj {
			return si > sj
		}
		ri, rj := 0.0, 0.0
		if paid[i].Rating != nil {
			ri = *paid[i].Rating
		}
		if paid[j].Rating != nil {
			rj = *paid[j].Rating
		}
		return ri > rj
	})

	addPlace := func(p models.Place) {
		sp := toSlotPlace(p)
		selected = append(selected, sp)
		if p.BasePrice != nil {
			spent += *p.BasePrice * guestCount
		}
	}

	// 1. Always add must_visit (even slightly over budget)
	for _, p := range mustVisit {
		addPlace(p)
	}

	// 2. Free attractions
	for _, p := range free {
		addPlace(p)
	}

	// 3. Paid within remaining attraction budget
	for _, p := range paid {
		cost := 0
		if p.BasePrice != nil {
			cost = *p.BasePrice * guestCount
		}
		if spent+cost <= attrBudget {
			addPlace(p)
		}
	}

	return selected
}

// isFullDayPlace returns true if a place is a full-day attraction (≥360 min or metadata flag).
func isFullDayPlace(p models.Place) bool {
	if len(p.Metadata) > 0 {
		metaStr := string(p.Metadata)
		if strings.Contains(metaStr, `"full_day":true`) || strings.Contains(metaStr, `"full_day": true`) {
			return true
		}
	}
	if p.RecommendedDuration != nil && *p.RecommendedDuration >= 360 {
		return true
	}
	return false
}

// toSlotPlace converts a models.Place to a SlotPlace for the planner.
func toSlotPlace(p models.Place) SlotPlace {
	sp := SlotPlace{
		ID:          p.ID.String(),
		Name:        p.Name,
		Category:    string(p.Category),
		IsMustVisit: p.MustVisit,
		Tags:        []string(p.Tags),
		IsFullDay:   isFullDayPlace(p),
	}
	if p.NameEN != nil {
		sp.NameEN = *p.NameEN
	}
	if p.Address != nil {
		sp.Address = *p.Address
	}
	if p.Area != nil {
		sp.Area = *p.Area
	}
	if p.Latitude != nil {
		sp.Lat = *p.Latitude
	}
	if p.Longitude != nil {
		sp.Lng = *p.Longitude
	}
	if p.CoverImage != nil {
		sp.CoverImage = *p.CoverImage
	}
	sp.Images = []string(p.Images)
	if p.BasePrice != nil {
		sp.BasePrice = *p.BasePrice
		sp.IsFree = *p.BasePrice == 0
	} else {
		sp.IsFree = true
	}
	if p.RecommendedDuration != nil {
		sp.Duration = *p.RecommendedDuration
	}
	if p.Hours != nil {
		sp.Hours = *p.Hours
	}
	if p.BestTimeOfDay != nil {
		sp.BestTimeOfDay = *p.BestTimeOfDay
	}
	if p.PriceUpdatedAt != nil {
		t := *p.PriceUpdatedAt
		sp.PriceUpdatedAt = &t
	}
	return sp
}

// scoreWithPreference returns a bonus score based on how well a place's tags
// match the user's preference tags. Each matching tag adds 3.0 points.
func scoreWithPreference(p SlotPlace, prefs []string) float64 {
	if len(prefs) == 0 {
		return 0
	}
	score := 0.0
	for _, tag := range p.Tags {
		for _, pref := range prefs {
			if strings.EqualFold(tag, pref) {
				score += 3.0
			}
		}
	}
	return score
}

// dynamicBudgetRatio adjusts attraction/food budget split based on budget level and destination.
func dynamicBudgetRatio(budgetVND int, dest string, numDays, guestCount int) (attrRatio, foodRatio float64) {
	mealCost := MealCostVND(dest)
	estimatedFood := float64(mealCost * guestCount * 3 * numDays)
	foodPct := estimatedFood / float64(budgetVND)
	switch {
	case foodPct > 0.5:
		return 0.25, 0.60 // budget trip: food dominates
	case foodPct < 0.15:
		return 0.55, 0.25 // luxury trip: more room for premium attractions
	default:
		return attrBudgetRatio, foodBudgetRatio // standard 45/40
	}
}

// FoodBudgetVND returns the food budget portion.
func FoodBudgetVND(totalBudget int) int {
	return int(float64(totalBudget) * foodBudgetRatio)
}

// destFoodCostVND maps destination → estimated meal cost per person per meal (VND).
var destFoodCostVND = map[string]int{
	"hà nội":       65_000,
	"đà nẵng":      85_000,
	"hội an":       100_000,
	"hồ chí minh":  100_000,
	"nha trang":    80_000,
	"đà lạt":       70_000,
	"phú quốc":     120_000,
	"mũi né":       75_000,
	"quảng bình":   60_000,
	"huế":          75_000,
	"vũng tàu":     85_000,
}

// MealCostVND returns the estimated meal cost per person per meal for a destination.
func MealCostVND(destination string) int {
	dest := strings.ToLower(strings.TrimSpace(destination))
	if cost, ok := destFoodCostVND[dest]; ok {
		return cost
	}
	return 80_000 // default
}
