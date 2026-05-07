package planner

// slots_helpers.go — shared utility functions for day plan construction.

import (
	"fmt"
	"strings"
	"time"
)

// mealsForDayType returns the ordered meal keys each day builder consumes.
// Ensures foodPlaces[0] always matches the first meal slot in the builder.
func mealsForDayType(dayType string) []string {
	switch dayType {
	case "departure":
		return []string{"breakfast"}
	case "arrival":
		return []string{"dinner"}
	default:
		// standard and full_day: lunch + dinner (no breakfast slot in these builders)
		return []string{"lunch", "dinner"}
	}
}

// determineDayType classifies a day as arrival / departure / full_day / standard.
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

// computeDate returns the formatted date string for day (dayNum-1) offset from startDate.
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

// computeTravelMin sums estimated travel time between consecutive activity slots.
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

// computeBufferMin sums the duration of buffer slots (30 min each).
func computeBufferMin(slots []TimeSlot) int {
	total := 0
	for _, s := range slots {
		if s.IsBuffer {
			total += 30
		}
	}
	return total
}

// closingHourMin parses "HH:MM-HH:MM" and returns the closing time in minutes.
// Returns 24*60 if the format is unrecognised.
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

// timeToMinsFromStr converts "HH:MM" to minutes since midnight. Returns -1 on error.
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

// activitySlotTypes is the set of slot types that represent visiting a place.
var activitySlotTypes = map[string]bool{
	"morning_activity":   true,
	"afternoon_activity": true,
	"full_day_activity":  true,
	"evening_activity":   true,
}

// mealSlotTypes is the set of slot types that represent eating.
var mealSlotTypes = map[string]bool{
	"breakfast": true,
	"lunch":     true,
	"dinner":    true,
}
