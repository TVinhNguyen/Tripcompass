package planner

// slots.go — BuildDayPlan dispatcher + shared timing constants.
// Each day-type builder lives in its own file:
//   - slots_standard.go  → buildStandardDay
//   - slots_special.go   → buildArrivalDay, buildDepartureDay, buildFullDay
//   - slots_helpers.go   → mealsForDayType, determineDayType, computeDate, compute*

import "fmt"

// ─── Timing constants ─────────────────────────────────────────────────────────
// All times are in minutes-since-midnight.

const (
	defaultMorningStart = 8 * 60  // 08:00 (standard template morning start)
	defaultArrivalStart = 15 * 60 // 15:00 (default arrival check-in time)
	defaultLastDayStart = 7 * 60  // 07:00 (departure day start)
	lunchStartMin       = 11*60 + 30
	lunchEndMin         = 13 * 60
	dinnerStartMin      = 18 * 60
	dinnerEndMin        = 19*60 + 30
	eveningEndMin       = 21 * 60
	// BufferBetweenMin and DefaultActivityMin are in planner/config.go
)

// minsToTime converts minutes-since-midnight to "HH:MM".
func minsToTime(m int) string {
	if m < 0 {
		m = 0
	}
	return fmt.Sprintf("%02d:%02d", m/60, m%60)
}

// activityDuration returns a place's visit duration in minutes, with a sensible fallback.
func activityDuration(p SlotPlace) int {
	if p.Duration > 0 {
		return p.Duration
	}
	return DefaultActivityMin
}

// lunchDurationForTemplate returns the lunch slot length in minutes.
// Active trips get a shorter break; relaxed trips a longer one.
func lunchDurationForTemplate(template SlotTemplate) int {
	switch template {
	case TemplateActive:
		return 60 // quick lunch
	case TemplateRelaxed:
		return 120 // leisurely lunch
	default:
		return 90 // standard
	}
}

// ─── BuildDayPlan dispatcher ──────────────────────────────────────────────────

// BuildDayPlan constructs a DayPlan for one day with dynamic slot timing.
// The SlotTemplate controls pacing (morning start time, max activities/day).
// foodByMeal maps "breakfast"/"lunch"/"dinner" → venue slice; nil map means no food venues.
func BuildDayPlan(
	dayNum, totalDays int,
	places []SlotPlace,
	foodByMeal DayFoodMap,
	startDate string,
	comboIncludesLunch bool,
	arrivalTime string,
	departureTime string,
	template SlotTemplate,
) DayPlan {
	dayType := determineDayType(dayNum, totalDays, places)
	date := computeDate(startDate, dayNum-1)

	// Extract ordered food slices per day type so each builder gets exactly what it needs.
	// standard/full_day: [lunch, dinner] — no breakfast slot
	// arrival:           [dinner]
	// departure:         [breakfast]
	mealOrder := mealsForDayType(dayType)
	var foodPlaces []SlotPlace
	for _, meal := range mealOrder {
		if foodByMeal != nil {
			if venues, ok := foodByMeal[meal]; ok && len(venues) > 0 {
				foodPlaces = append(foodPlaces, venues[0])
			}
		}
	}

	var slots []TimeSlot
	switch dayType {
	case "arrival":
		slots = buildArrivalDay(places, foodPlaces, comboIncludesLunch, arrivalTime)
	case "departure":
		slots = buildDepartureDay(places, foodPlaces)
	case "full_day":
		slots = buildFullDay(places, foodPlaces, comboIncludesLunch)
	default:
		slots = buildStandardDay(places, foodPlaces, comboIncludesLunch, template)
	}

	primaryArea := "center"
	if len(places) > 0 && places[0].Area != "" {
		primaryArea = places[0].Area
	}

	return DayPlan{
		DayNum:      dayNum,
		DateStr:     date,
		DayType:     dayType,
		Slots:       slots,
		PrimaryArea: primaryArea,
		TravelMin:   computeTravelMin(slots),
		BufferMin:   computeBufferMin(slots),
	}
}
