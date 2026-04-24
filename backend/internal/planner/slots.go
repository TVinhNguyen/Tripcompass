package planner

import (
	"fmt"
	"strings"
	"time"
)

const (
	defaultMorningStart = 8 * 60  // 08:00 in minutes (standard template)
	defaultArrivalStart = 15 * 60 // 15:00 in minutes
	defaultLastDayStart = 7 * 60  // 07:00 in minutes
	lunchStartMin       = 11*60 + 30
	lunchEndMin         = 13 * 60
	dinnerStartMin      = 18 * 60
	dinnerEndMin        = 19*60 + 30
	eveningEndMin       = 21 * 60
	bufferBetweenMin    = 30  // buffer between activity and next event
	defaultActivityDur  = 120 // fallback if place has no duration
)

// minsToTime converts minutes-since-midnight to "HH:MM".
func minsToTime(m int) string {
	if m < 0 {
		m = 0
	}
	return fmt.Sprintf("%02d:%02d", m/60, m%60)
}

// activityDuration returns a place's duration in minutes, with a sensible fallback.
func activityDuration(p SlotPlace) int {
	if p.Duration > 0 {
		return p.Duration
	}
	return defaultActivityDur
}

// BuildDayPlan constructs a DayPlan for one day with dynamic slot timing.
// The SlotTemplate controls pacing (start time, max activities per day).
// foodByMeal maps "breakfast"/"lunch"/"dinner" → venue; nil map means no food venues.
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
	// standard/full_day: no breakfast slot → [lunch, dinner]
	// arrival:           no breakfast slot → [dinner]
	// departure:         has breakfast slot → [breakfast, (morning snack skipped)]
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

	travelMin := computeTravelMin(slots)
	bufferMin := computeBufferMin(slots)

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
		TravelMin:   travelMin,
		BufferMin:   bufferMin,
	}
}

// buildStandardDay builds a full standard day schedule dynamically.
// The SlotTemplate controls: morning start time and max activities per day.
//
// Relaxed  (09:00, ≤2 activities): leisure pacing, beach/free-time block
// Standard (08:00, ≤3 activities): balanced, current default
// Active   (07:00, ≤4 activities): packed, short lunch break
func buildStandardDay(places, food []SlotPlace, comboIncludesLunch bool, template SlotTemplate) []TimeSlot {
	slots := []TimeSlot{}
	cur := template.morningStartMin()
	maxActivities := template.maxActivitiesPerDay()
	lunchDur := lunchDurationForTemplate(template)

	// Pre-classify: reserve short evening-suitable places for the post-dinner slot.
	// A place qualifies if it's ≤60min, open late (Hours=="" or closing ≥21:00),
	// and BestTimeOfDay is "evening"/"night" or "any"/unset.
	var eveningCandidate *SlotPlace
	var mainPlaces []SlotPlace
	for i := range places {
		p := places[i]
		dur := activityDuration(p)
		closingOK := p.Hours == "" || closingHourMin(p.Hours) >= eveningEndMin
		isEveningTag := p.BestTimeOfDay == "evening" || p.BestTimeOfDay == "night" || isEveningPlace(p)
		isMorningTag := p.BestTimeOfDay == "morning"
		if eveningCandidate == nil && dur <= 60 && closingOK && !isMorningTag && (isEveningTag || dur <= 60) {
			cp := p
			eveningCandidate = &cp
		} else {
			mainPlaces = append(mainPlaces, p)
		}
	}
	// Only put the evening candidate back if there are NO other places to schedule.
	if eveningCandidate != nil && len(mainPlaces) == 0 {
		mainPlaces = append(mainPlaces, *eveningCandidate)
		eveningCandidate = nil
	}
	places = mainPlaces

	foodIdx := 0
	activityCount := 0
	placeIdx := 0

	// For relaxed template: reduce afternoon cutoff to 16:30 (more free time)
	afternoonCutoff := 17*60 + 30
	if template == TemplateRelaxed {
		afternoonCutoff = 16 * 60 + 30
	}

	// ── Morning activities ─────────────────────────────────────────────────────
	for placeIdx < len(places) && activityCount < maxActivities {
		p := places[placeIdx]

		// Stop morning block before lunch (leave ~30min buffer before 11:30)
		if cur >= lunchStartMin-30 {
			break
		}

		placeIdx++
		activityCount++
		dur := activityDuration(p)
		end := cur + dur

		// Cap morning activity to not overlap lunch
		if end > lunchStartMin-30 {
			end = lunchStartMin - 30
		}

		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(end),
			SlotType: "morning_activity",
			Place:    &p,
		})
		cur = end + bufferBetweenMin
	}

	// ── Lunch ─────────────────────────────────────────────────────────────────
	lunchStart := lunchStartMin
	if cur > lunchStart {
		lunchStart = cur
	}
	lunchEnd := lunchStart + lunchDur
	if comboIncludesLunch {
		slots = append(slots, TimeSlot{
			Start:        minsToTime(lunchStart),
			End:          minsToTime(lunchEnd),
			SlotType:     "lunch",
			ComboCovered: true,
		})
	} else if foodIdx < len(food) {
		f := food[foodIdx]
		foodIdx++
		slots = append(slots, TimeSlot{
			Start:    minsToTime(lunchStart),
			End:      minsToTime(lunchEnd),
			SlotType: "lunch",
			Place:    &f,
		})
	}
	cur = lunchEnd + 30 // post-lunch rest

	// ── Afternoon activities ───────────────────────────────────────────────────
	for placeIdx < len(places) && activityCount < maxActivities && cur < afternoonCutoff {
		// Travel buffer between consecutive activities
		if placeIdx > 0 {
			prev := places[placeIdx-1]
			next := places[placeIdx]
			if prev.Lat != 0 && next.Lat != 0 {
				travelMin := EstimateTravelMin(HaversineKm(prev.Lat, prev.Lng, next.Lat, next.Lng))
				if travelMin > bufferBetweenMin {
					slots = append(slots, TimeSlot{
						Start:    minsToTime(cur),
						End:      minsToTime(cur + travelMin),
						SlotType: "travel",
						IsBuffer: true,
					})
					cur += travelMin
				}
			}
		}

		if cur >= afternoonCutoff {
			break
		}

		p := places[placeIdx]
		placeIdx++
		activityCount++
		dur := activityDuration(p)
		end := cur + dur
		if end > afternoonCutoff {
			end = afternoonCutoff
		}
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(end),
			SlotType: "afternoon_activity",
			Place:    &p,
		})
		cur = end
	}

	// ── Relaxed template: free/beach time block ────────────────────────────────
	if template == TemplateRelaxed && cur < dinnerStartMin-60 {
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(dinnerStartMin - 60),
			SlotType: "free_time",
			IsBuffer: true,
		})
		cur = dinnerStartMin - 60
	}

	// ── Buffer before dinner ───────────────────────────────────────────────────
	if cur < dinnerStartMin {
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(dinnerStartMin),
			SlotType: "buffer",
			IsBuffer: true,
		})
	}

	// ── Dinner ────────────────────────────────────────────────────────────────
	dinnerStart := dinnerStartMin
	if cur > dinnerStartMin {
		dinnerStart = cur
	}
	actualDinnerEnd := dinnerStart + 90
	if foodIdx < len(food) {
		f := food[foodIdx]
		foodIdx++
		slots = append(slots, TimeSlot{
			Start:    minsToTime(dinnerStart),
			End:      minsToTime(actualDinnerEnd),
			SlotType: "dinner",
			Place:    &f,
		})
	}

	// ── Evening activity (short ≤60min place after dinner) ────────────────────
	// Use pre-classified eveningCandidate first; fall back to next unscheduled place.
	var eveningPlace *SlotPlace
	if eveningCandidate != nil {
		eveningPlace = eveningCandidate
	} else if placeIdx < len(places) {
		p := places[placeIdx]
		dur := activityDuration(p)
		closingOK := p.Hours == "" || closingHourMin(p.Hours) >= eveningEndMin
		if dur <= 60 && closingOK && actualDinnerEnd+dur <= eveningEndMin {
			placeIdx++
			eveningPlace = &p
		}
	}
	if eveningPlace != nil {
		dur := activityDuration(*eveningPlace)
		if actualDinnerEnd+dur <= eveningEndMin {
			slots = append(slots, TimeSlot{
				Start:    minsToTime(actualDinnerEnd),
				End:      minsToTime(actualDinnerEnd + dur),
				SlotType: "evening_activity",
				Place:    eveningPlace,
			})
			actualDinnerEnd += dur
		}
	}

	// ── Evening free block ─────────────────────────────────────────────────────
	if actualDinnerEnd < eveningEndMin {
		slots = append(slots, TimeSlot{
			Start:    minsToTime(actualDinnerEnd),
			End:      minsToTime(eveningEndMin),
			SlotType: "evening",
		})
	}

	return slots
}

// lunchDurationForTemplate returns the lunch slot duration in minutes.
// Active trips have shorter lunch breaks; food-focused relaxed trips have longer ones.
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

// buildArrivalDay: check-in → 1 light attraction → dinner.
// arrivalTimeStr is "HH:MM"; defaults to 15:00 if empty or unparseable.
func buildArrivalDay(places, food []SlotPlace, comboIncludesLunch bool, arrivalTimeStr string) []TimeSlot {
	slots := []TimeSlot{}
	cur := defaultArrivalStart // 15:00
	if arrivalTimeStr != "" {
		if parsed := timeToMinsFromStr(arrivalTimeStr); parsed >= 0 {
			cur = parsed
		}
	}
	foodIdx := 0

	// Split places: afternoon vs evening (Dragon Bridge should be after dinner)
	var afternoonPlaces []SlotPlace
	var eveningCandidates []SlotPlace
	for _, p := range places {
		if isEveningPlace(p) {
			eveningCandidates = append(eveningCandidates, p)
		} else {
			afternoonPlaces = append(afternoonPlaces, p)
		}
	}

	// Early arrival (before 12:00): add lunch + 2 afternoon activities
	if cur <= 12*60 {
		lunchEnd := lunchStartMin + 90
		if comboIncludesLunch {
			slots = append(slots, TimeSlot{
				Start:        minsToTime(lunchStartMin),
				End:          minsToTime(lunchEnd),
				SlotType:     "lunch",
				ComboCovered: true,
			})
		} else if foodIdx < len(food) {
			f := food[foodIdx]
			foodIdx++
			slots = append(slots, TimeSlot{
				Start:    minsToTime(lunchStartMin),
				End:      minsToTime(lunchEnd),
				SlotType: "lunch",
				Place:    &f,
			})
		}
		cur = lunchEnd + 30

		// Up to 2 afternoon activities for early arrivals
		for i := 0; i < 2 && i < len(afternoonPlaces) && cur < 17*60; i++ {
			p := afternoonPlaces[i]
			dur := activityDuration(p)
			if dur > 150 {
				dur = 150
			}
			end := cur + dur
			if end > 17*60 {
				end = 17 * 60
			}
			slots = append(slots, TimeSlot{
				Start:    minsToTime(cur),
				End:      minsToTime(end),
				SlotType: "afternoon_activity",
				Place:    &p,
			})
			cur = end + bufferBetweenMin
		}
	} else {
		// Standard late arrival: 1 activity capped at 2h
		if len(afternoonPlaces) > 0 {
			p := afternoonPlaces[0]
			dur := activityDuration(p)
			if dur > 120 {
				dur = 120
			}
			end := cur + dur
			slots = append(slots, TimeSlot{
				Start:    minsToTime(cur),
				End:      minsToTime(end),
				SlotType: "afternoon_activity",
				Place:    &p,
			})
			cur = end
		}
	}

	// Buffer before dinner
	if cur < dinnerStartMin {
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(dinnerStartMin),
			SlotType: "buffer",
			IsBuffer: true,
		})
	}

	// Dinner
	if foodIdx < len(food) {
		f := food[foodIdx]
		foodIdx++
		slots = append(slots, TimeSlot{
			Start:    minsToTime(dinnerStartMin),
			End:      minsToTime(dinnerEndMin),
			SlotType: "dinner",
			Place:    &f,
		})
	}

	// Evening — use pre-classified eveningCandidates (e.g. Dragon Bridge)
	var eveningPlace *SlotPlace
	if len(eveningCandidates) > 0 {
		ep := eveningCandidates[0]
		eveningPlace = &ep
	}

	if eveningPlace != nil {
		dur := activityDuration(*eveningPlace)
		if dur > 60 {
			dur = 60
		}
		eveningStart := dinnerEndMin // 19:30
		slots = append(slots, TimeSlot{
			Start:    minsToTime(eveningStart),
			End:      minsToTime(eveningStart + dur),
			SlotType: "evening_activity",
			Place:    eveningPlace,
		})
		slots = append(slots, TimeSlot{
			Start:    minsToTime(eveningStart + dur),
			End:      minsToTime(eveningEndMin),
			SlotType: "evening",
		})
	} else {
		slots = append(slots, TimeSlot{
			Start:    minsToTime(dinnerEndMin),
			End:      minsToTime(eveningEndMin),
			SlotType: "evening",
		})
	}

	return slots
}

// buildDepartureDay: breakfast → 1 light morning activity (if any) → buffer → checkout.
// Starts at 07:00 for breakfast; morning activity at 08:00 so it respects typical opening hours.
func buildDepartureDay(places, food []SlotPlace) []TimeSlot {
	slots := []TimeSlot{}
	cur := defaultLastDayStart // 07:00
	foodIdx := 0

	// Breakfast (07:00–08:00)
	if foodIdx < len(food) {
		f := food[foodIdx]
		foodIdx++
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(cur + 60),
			SlotType: "breakfast",
			Place:    &f,
		})
		cur += 60
	} else {
		// No breakfast venue: skip to 08:00 for morning activity
		cur = 8 * 60
	}

	// Morning activity (capped at 2.5h so done by ~10:30 at latest from 08:00)
	if len(places) > 0 {
		p := places[0]
		dur := activityDuration(p)
		if dur > 150 {
			dur = 150
		}
		end := cur + dur
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(end),
			SlotType: "morning_activity",
			Place:    &p,
		})
		cur = end
	} else {
		// Departure day fallback: generic light activity block (market/souvenirs)
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(cur + 90),
			SlotType: "morning_activity",
		})
		cur += 90
	}

	// Final buffer before checkout/travel
	slots = append(slots, TimeSlot{
		Start:    minsToTime(cur),
		End:      minsToTime(cur + 30),
		SlotType: "buffer",
		IsBuffer: true,
	})

	return slots
}

// buildFullDay: breakfast → full-day attraction (actual duration) → optional secondary → dinner at 17:30
func buildFullDay(places, food []SlotPlace, comboIncludesLunch bool) []TimeSlot {
	slots := []TimeSlot{}
	foodIdx := 0
	cur := 8 * 60 // 08:00

	// Breakfast (07:00-07:30)
	if foodIdx < len(food) {
		f := food[foodIdx]
		foodIdx++
		slots = append(slots, TimeSlot{
			Start:    "07:00",
			End:      "07:30",
			SlotType: "breakfast",
			Place:    &f,
		})
	}

	// Primary full-day activity — use actual duration, cap at 17:00
	if len(places) > 0 {
		p := places[0]
		dur := activityDuration(p)
		end := cur + dur
		if end > 17*60 {
			end = 17 * 60
		}
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      minsToTime(end),
			SlotType: "full_day_activity",
			Place:    &p,
		})
		cur = end + bufferBetweenMin

		// If primary ends before 15:30 and there's a short secondary place, add it
		if cur < 15*60+30 && len(places) > 1 {
			p2 := places[1]
			dur2 := activityDuration(p2)
			end2 := cur + dur2
			if end2 <= 17*60 && !p2.IsFullDay {
				slots = append(slots, TimeSlot{
					Start:    minsToTime(cur),
					End:      minsToTime(end2),
					SlotType: "afternoon_activity",
					Place:    &p2,
				})
				cur = end2
			}
		}
	}

	// Buffer before dinner (17:30)
	const fullDayDinnerStart = 17*60 + 30
	if cur < fullDayDinnerStart {
		slots = append(slots, TimeSlot{
			Start:    minsToTime(cur),
			End:      "17:30",
			SlotType: "buffer",
			IsBuffer: true,
		})
	}

	// Dinner at 17:30
	if foodIdx < len(food) {
		f := food[foodIdx]
		foodIdx++
		slots = append(slots, TimeSlot{
			Start:    minsToTime(fullDayDinnerStart),
			End:      minsToTime(fullDayDinnerStart + 90),
			SlotType: "dinner",
			Place:    &f,
		})
	}

	return slots
}

// ─── helpers ──────────────────────────────────────────────────────────────────

// mealsForDayType returns the ordered list of meal keys each day builder consumes.
// This ensures foodPlaces[0] always matches the first meal slot in the builder.
func mealsForDayType(dayType string) []string {
	switch dayType {
	case "departure":
		return []string{"breakfast"} // departure: breakfast only (morning snack), no lunch/dinner
	case "arrival":
		return []string{"dinner"} // arrival: dinner only
	default:
		// standard and full_day: lunch + dinner (no breakfast slot in these builders)
		return []string{"lunch", "dinner"}
	}
}

func determineDayType(dayNum, totalDays int, places []SlotPlace) string {
	if dayNum == 1 {
		return "arrival"
	}
	if dayNum == totalDays {
		return "departure"
	}
	for _, p := range places {
		if p.IsFullDay {
			return "full_day"
		}
	}
	return "standard"
}

func computeDate(startDate string, offset int) string {
	t, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return startDate
	}
	d := t.AddDate(0, 0, offset)
	days := []string{"CN", "T2", "T3", "T4", "T5", "T6", "T7"}
	weekday := days[d.Weekday()]
	return fmt.Sprintf("%s %02d/%02d/%d", weekday, d.Day(), int(d.Month()), d.Year())
}

func computeTravelMin(slots []TimeSlot) int {
	total := 0
	var prevPlace *SlotPlace
	for i := range slots {
		s := &slots[i]
		if s.Place == nil || !activitySlotTypes[s.SlotType] {
			continue
		}
		if prevPlace != nil && prevPlace.Lat != 0 && s.Place.Lat != 0 {
			km := HaversineKm(prevPlace.Lat, prevPlace.Lng, s.Place.Lat, s.Place.Lng)
			total += EstimateTravelMin(km)
		}
		prevPlace = s.Place
	}
	return total
}

func computeBufferMin(slots []TimeSlot) int {
	total := 0
	for _, s := range slots {
		if s.IsBuffer {
			total += 30
		}
	}
	return total
}

var activitySlotTypes = map[string]bool{
	"morning_activity":   true,
	"afternoon_activity": true,
	"full_day_activity":  true,
	"evening_activity":   true,
}

var mealSlotTypes = map[string]bool{
	"breakfast": true,
	"lunch":     true,
	"dinner":    true,
}

// closingHourMin parses "HH:MM-HH:MM" and returns the closing time in minutes.
// Returns 24*60 if format is unrecognized.
func closingHourMin(hours string) int {
	if len(hours) < 11 {
		return 24 * 60
	}
	parts := strings.Split(hours, "-")
	if len(parts) != 2 {
		return 24 * 60
	}
	t := strings.TrimSpace(parts[1])
	var h, m int
	if _, err := fmt.Sscanf(t, "%d:%d", &h, &m); err != nil {
		return 24 * 60
	}
	return h*60 + m
}

// timeToMinsFromStr converts "HH:MM" to minutes since midnight.
// Returns -1 if the string is empty or unparseable.
func timeToMinsFromStr(s string) int {
	if s == "" {
		return -1
	}
	var h, m int
	if _, err := fmt.Sscanf(s, "%d:%d", &h, &m); err != nil {
		return -1
	}
	return h*60 + m
}
