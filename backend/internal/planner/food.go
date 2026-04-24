package planner

import (
	"fmt"
	"strings"
	"tripcompass-backend/internal/models"
)

// DayFoodMap maps meal_type → []SlotPlace for one day.
type DayFoodMap map[string][]SlotPlace // key: "breakfast"|"lunch"|"dinner"

// BuildFoodMap assigns food venues to each day ensuring no global repeats.
// foodMode from BudgetConstraints filters venues by quality tier:
//   - "street"     → prefer street stalls, roadside eateries (<50k/person)
//   - "local"      → prefer local Vietnamese restaurants (50-100k/person)
//   - "restaurant" → prefer mid-range restaurants (100-200k/person)
//   - "fine"       → prefer upscale dining (>200k/person)
//
// maxMealCost enforces a hard price cap per person (0 = no limit).
// Returns map[dayNum]DayFoodMap and any violations (e.g. NO_FOOD_VENUES).
func BuildFoodMap(
	foodPlaces []models.Place,
	dayAssignments map[int][]SlotPlace,
	numDays int,
	dest string,
	foodMode string,
	maxMealCost int,
) (map[int]DayFoodMap, []Violation) {
	all := toSlotPlaces(foodPlaces)

	// Price cap: hard-filter venues exceeding maxMealCost per person.
	// 0 means no cap. Always keep free venues.
	priceFiltered := all
	if maxMealCost > 0 {
		priceFiltered = make([]SlotPlace, 0, len(all))
		for _, v := range all {
			if v.BasePrice == 0 || v.BasePrice <= maxMealCost {
				priceFiltered = append(priceFiltered, v)
			}
		}
		if len(priceFiltered) == 0 {
			priceFiltered = all // safety: never leave pool fully empty
		}
	}

	// Filter by food mode within the price-filtered pool.
	filtered := filterByFoodMode(priceFiltered, foodMode)
	if len(filtered) == 0 {
		filtered = priceFiltered // fallback: ignore mode filter if no matches
	}

	var violations []Violation
	if len(filtered) == 0 {
		violations = append(violations, Violation{
			Rule:     "NO_FOOD_VENUES",
			Severity: "warning",
			Message:  fmt.Sprintf("Không có địa điểm ăn uống nào trong DB cho '%s'", dest),
		})
		return map[int]DayFoodMap{}, violations
	}

	// lastUsedDay tracks on which day a venue was last used.
	// Venues are allowed to repeat after a cooldown of numDays/3 days (min 2).
	lastUsedDay := map[string]int{}
	cooldown := numDays / 3
	if cooldown < 2 {
		cooldown = 2
	}

	result := map[int]DayFoodMap{}

	for day := 1; day <= numDays; day++ {
		// Only request meals that will actually appear in the day plan.
		// Mirrors the mealsForDayType() logic from slots.go.
		dayType := mealDayType(day, numDays, dayAssignments[day])
		mealTypes := mealsForFoodDayType(dayType)

		dayMeals := DayFoodMap{}
		usedToday := map[string]bool{}

		attrSlots := dayAssignments[day]
		var centerLat, centerLng float64
		if len(attrSlots) > 0 && attrSlots[0].Lat != 0 {
			centerLat = attrSlots[0].Lat
			centerLng = attrSlots[0].Lng
		}

		// Build per-day used set: venues used recently (within cooldown window)
		usedRecently := map[string]bool{}
		for id, usedDay := range lastUsedDay {
			if day-usedDay < cooldown {
				usedRecently[id] = true
			}
		}

		for _, meal := range mealTypes {
			chosen := pickFood(filtered, meal, centerLat, centerLng, usedRecently, usedToday)
			if chosen == nil {
				// Fallback: relax mode filter but keep price cap and cooldown
				chosen = pickFood(priceFiltered, meal, centerLat, centerLng, usedRecently, usedToday)
			}
			if chosen == nil {
				// Last resort: ignore cooldown, only avoid same-day repeat
				chosen = pickFood(filtered, meal, centerLat, centerLng, map[string]bool{}, usedToday)
			}
			if chosen == nil {
				chosen = pickFood(priceFiltered, meal, centerLat, centerLng, map[string]bool{}, usedToday)
			}
			if chosen != nil {
				lastUsedDay[chosen.ID] = day
				usedToday[chosen.ID] = true
				dayMeals[meal] = []SlotPlace{*chosen}
			}
		}

		result[day] = dayMeals
	}

	return result, violations
}

// mealDayType classifies a day as arrival/departure/full_day/standard for meal planning.
func mealDayType(dayNum, numDays int, places []SlotPlace) string {
	if dayNum == 1 {
		return "arrival"
	}
	if dayNum == numDays {
		return "departure"
	}
	for _, p := range places {
		if p.IsFullDay {
			return "full_day"
		}
	}
	return "standard"
}

// mealsForFoodDayType returns the meal types to assign for a given day type.
// Mirrors the slot consumption order in each day builder.
func mealsForFoodDayType(dayType string) []string {
	switch dayType {
	case "arrival":
		return []string{"dinner"}
	case "departure":
		return []string{"breakfast"}
	default: // standard, full_day
		return []string{"lunch", "dinner"}
	}
}

// filterByFoodMode returns venues whose tags or price match the given food mode.
func filterByFoodMode(venues []SlotPlace, mode string) []SlotPlace {
	if mode == "" || mode == "restaurant" {
		return venues // default: no filter
	}

	modeTags := map[string][]string{
		"street": {"street-food", "vỉa hè", "bình dân", "hàng rong", "cheap"},
		"local":  {"local", "quán cơm", "vietnamese", "bình dân", "nhà hàng địa phương"},
		"fine":   {"fine-dining", "luxury", "rooftop", "upscale", "cao cấp"},
	}

	targetTags, ok := modeTags[mode]
	if !ok {
		return venues
	}

	result := []SlotPlace{}
	for _, v := range venues {
		for _, tag := range v.Tags {
			matched := false
			for _, t := range targetTags {
				if strings.EqualFold(tag, t) {
					matched = true
					break
				}
			}
			if matched {
				result = append(result, v)
				break
			}
		}
	}
	return result
}

// pickFood selects the best food venue for a meal type near a location.
func pickFood(
	venues []SlotPlace,
	mealType string,
	centerLat, centerLng float64,
	usedGlobal, usedToday map[string]bool,
) *SlotPlace {
	type scored struct {
		p     SlotPlace
		score float64
	}
	var candidates []scored

	for _, v := range venues {
		if usedGlobal[v.ID] || usedToday[v.ID] {
			continue
		}
		score := 0.0
		// Distance bonus: closer is better (inverse km)
		if centerLat != 0 && v.Lat != 0 {
			km := HaversineKm(centerLat, centerLng, v.Lat, v.Lng)
			if km < 0.1 {
				score += 10
			} else {
				score += 1.0 / km
			}
		}
		// Meal type keyword bonus
		score += mealTypeScore(v, mealType)
		candidates = append(candidates, scored{v, score})
	}

	if len(candidates) == 0 {
		// Fallback: any venue not used today
		for _, v := range venues {
			if !usedGlobal[v.ID] && !usedToday[v.ID] {
				cp := v
				return &cp
			}
		}
		return nil
	}

	best := candidates[0]
	for _, c := range candidates[1:] {
		if c.score > best.score {
			best = c
		}
	}
	cp := best.p
	return &cp
}

func mealTypeScore(v SlotPlace, mealType string) float64 {
	// Tags take priority over name keywords
	for _, tag := range v.Tags {
		switch mealType {
		case "breakfast":
			if tag == "breakfast-spot" || tag == "morning" || tag == "early-open" {
				return 3.0
			}
		case "lunch":
			if tag == "lunch-spot" || tag == "quick-meal" {
				return 3.0
			}
		case "dinner":
			if tag == "seafood" || tag == "dinner-spot" || tag == "bbq" || tag == "hotpot" {
				return 3.0
			}
		}
	}
	// Fallback: keyword in place name
	name := v.Name
	switch mealType {
	case "breakfast":
		for _, kw := range []string{"sáng", "bún", "bánh mì", "phở", "breakfast", "cháo"} {
			if strings.Contains(name, kw) {
				return 2.0
			}
		}
	case "dinner":
		for _, kw := range []string{"tối", "hải sản", "nướng", "lẩu", "dinner", "seafood"} {
			if strings.Contains(name, kw) {
				return 2.0
			}
		}
	}
	return 0
}

func toSlotPlaces(places []models.Place) []SlotPlace {
	result := make([]SlotPlace, 0, len(places))
	for _, p := range places {
		result = append(result, toSlotPlace(p))
	}
	return result
}
