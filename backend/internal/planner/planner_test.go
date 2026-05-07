package planner

import (
	"testing"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

func makePlace(id, name string, dur, price int, mustVisit, isFullDay bool, lat, lng float64, tags []string) SlotPlace {
	return SlotPlace{
		ID:          id,
		Name:        name,
		Duration:    dur,
		BasePrice:   price,
		IsMustVisit: mustVisit,
		IsFullDay:   isFullDay,
		Lat:         lat,
		Lng:         lng,
		Tags:        tags,
	}
}

// ─── Phase 1 Unit Tests ───────────────────────────────────────────────────────

// P1.1: recalcAttrSpent should only count places present in assignments.
func TestBudgetAccuracy_DroppedPlacesNotCounted(t *testing.T) {
	baNaHills := makePlace("bnh", "Bà Nà Hills", 360, 1_000_000, true, true, 15.99, 107.98, nil)
	myKhe := makePlace("mk", "Mỹ Khê Beach", 120, 0, false, false, 16.06, 108.24, nil)
	_ = makePlace("dp", "Paid Dropped", 120, 500_000, false, false, 16.1, 108.2, nil)

	// Only baNaHills and myKhe are scheduled; droppedPaid is NOT in assignments
	assignments := map[int][]SlotPlace{
		2: {baNaHills},
		3: {myKhe},
	}
	guestCount := 2
	spent := recalcAttrSpent(assignments, guestCount)

	expected := 1_000_000 * 2 // only baNaHills × 2 guests; myKhe is free, droppedPaid excluded
	if spent != expected {
		t.Errorf("recalcAttrSpent = %d, want %d", spent, expected)
	}
}

// P1.2: fillEmptyDays must not assign the same place twice.
func TestFillEmptyDays_NoDuplicates(t *testing.T) {
	p1 := makePlace("p1", "Place 1", 120, 0, false, false, 16.0, 108.0, nil)
	p2 := makePlace("p2", "Place 2", 120, 0, false, false, 16.1, 108.1, nil)
	selected := []SlotPlace{p1, p2}

	assignments := map[int][]SlotPlace{
		1: {p1}, // day 1 already has p1
		2: {},   // day 2 is empty → should get p2, not p1
		3: {},   // day 3 is empty → no available places
	}
	fillEmptyDays(assignments, selected, 4) // numDays=4, so days 2 and 3 are middle days

	// Check no duplicates
	seen := map[string]int{}
	for day, places := range assignments {
		for _, p := range places {
			if prev, ok := seen[p.ID]; ok {
				t.Errorf("Place %q appears in both day %d and day %d", p.ID, prev, day)
			}
			seen[p.ID] = day
		}
	}
	// Day 2 should have p2
	if len(assignments[2]) == 0 {
		t.Error("Day 2 should have been filled with p2")
	} else if assignments[2][0].ID != "p2" {
		t.Errorf("Day 2 got %q, want p2", assignments[2][0].ID)
	}
}

// P1.5: buildStandardDay should produce an evening_activity slot for short places.
func TestBuildStandardDay_EveningActivitySlot(t *testing.T) {
	longMorning := makePlace("lm", "Museum", 180, 0, false, false, 0, 0, nil)
	afternoon := makePlace("af", "Hill", 120, 0, false, false, 0, 0, nil)
	short := makePlace("sh", "Dragon Bridge", 30, 0, false, false, 0, 0, nil)
	short.Hours = "" // open 24h

	places := []SlotPlace{longMorning, afternoon, short}
	food := []SlotPlace{}

	slots := buildStandardDay(places, food, false, TemplateStandard)

	hasEvening := false
	for _, s := range slots {
		if s.SlotType == "evening_activity" {
			hasEvening = true
			break
		}
	}
	if !hasEvening {
		t.Error("Expected evening_activity slot for short place after dinner, got none")
	}
}

// P1.6: BuildFoodMap with 0 venues should return NO_FOOD_VENUES violation.
func TestBuildFoodMap_NoVenuesReturnsWarning(t *testing.T) {
	foodMap, violations := BuildFoodMap(nil, map[int][]SlotPlace{}, 3, "đà nẵng", "local", 0)
	if len(foodMap) != 0 {
		t.Errorf("Expected empty foodMap, got %d entries", len(foodMap))
	}
	if len(violations) != 1 || violations[0].Rule != "NO_FOOD_VENUES" {
		t.Errorf("Expected NO_FOOD_VENUES violation, got %+v", violations)
	}
}

// P1.5/P2.5: buildFullDay should use actual duration, not hardcoded 17:00.
func TestBuildFullDay_ActualDuration_NotHardcoded(t *testing.T) {
	// Place with 360min (6h): 08:00 → 14:00
	p := makePlace("bnh", "Bà Nà Hills", 360, 0, true, true, 0, 0, nil)
	slots := buildFullDay([]SlotPlace{p}, []SlotPlace{}, false)

	for _, s := range slots {
		if s.SlotType == "full_day_activity" {
			if s.End == "17:00" {
				t.Error("buildFullDay hardcoded 17:00 end time; should use actual duration (14:00)")
			}
			if s.End != "14:00" {
				t.Errorf("Expected full_day_activity end=14:00 for 360min place, got %s", s.End)
			}
			return
		}
	}
	t.Error("No full_day_activity slot found")
}

// ─── Phase 2 Unit Tests ───────────────────────────────────────────────────────

// P2.3: assignToDays should keep full-day items on their own day.
func TestAssignToDays_FullDayAlone(t *testing.T) {
	baNa := makePlace("bnh", "Bà Nà Hills", 360, 0, true, true, 15.99, 107.98, nil)
	myKhe := makePlace("mk", "Mỹ Khê", 120, 0, true, false, 16.06, 108.24, nil)
	marble := makePlace("mm", "Marble Mtn", 90, 0, true, false, 15.97, 108.26, nil)

	assignments, _ := assignToDays([]SlotPlace{baNa, myKhe, marble}, nil, 5)

	// Find which day ba na is on; it should be alone
	for day, places := range assignments {
		for _, p := range places {
			if p.ID == "bnh" {
				if len(places) > 1 {
					t.Errorf("Bà Nà Hills is on day %d with %d other places (should be alone)", day, len(places)-1)
				}
				return
			}
		}
	}
	t.Error("Bà Nà Hills not found in any day assignment")
}

// P2.3: cluster-aware assignment should keep same-cluster places together.
func TestAssignToDays_ClusterStaysOnSameDay(t *testing.T) {
	// Two close places forming cluster A (north)
	a1 := makePlace("a1", "North A1", 90, 0, false, false, 16.1, 108.1, nil)
	a2 := makePlace("a2", "North A2", 90, 0, false, false, 16.11, 108.11, nil)
	// Two close places forming cluster B (south)
	b1 := makePlace("b1", "South B1", 90, 0, false, false, 15.9, 108.0, nil)
	b2 := makePlace("b2", "South B2", 90, 0, false, false, 15.91, 107.99, nil)

	clusters := [][]SlotPlace{{a1, a2}, {b1, b2}}
	assignments, _ := assignToDays(nil, clusters, 5)

	// Verify a1 and a2 are on the same day
	dayOf := map[string]int{}
	for day, places := range assignments {
		for _, p := range places {
			dayOf[p.ID] = day
		}
	}
	if dayOf["a1"] != dayOf["a2"] {
		t.Errorf("a1(day %d) and a2(day %d) should be on the same day", dayOf["a1"], dayOf["a2"])
	}
	if dayOf["b1"] != dayOf["b2"] {
		t.Errorf("b1(day %d) and b2(day %d) should be on the same day", dayOf["b1"], dayOf["b2"])
	}
}

// P2.4: TwoOptImprove should not increase total route distance.
func TestTwoOptImprove_ReducesDistance(t *testing.T) {
	// Places in a zigzag pattern — 2-opt should straighten the route
	places := []SlotPlace{
		{ID: "1", Lat: 16.0, Lng: 108.0},
		{ID: "2", Lat: 16.2, Lng: 108.2},
		{ID: "3", Lat: 16.1, Lng: 108.0}, // inserting out-of-order causes detour
		{ID: "4", Lat: 16.2, Lng: 108.0},
	}
	before := dayTotalDistance(places)
	optimized := TwoOptImprove(places)
	after := dayTotalDistance(optimized)

	if after > before+0.01 {
		t.Errorf("TwoOptImprove increased distance: before=%.2f after=%.2f", before, after)
	}
}

// P2.1: Preference scoring should affect place ordering.
func TestSelectAttractions_PreferenceChangesOrder(t *testing.T) {
	p1 := SlotPlace{ID: "p1", Tags: []string{"culture"}, BasePrice: 100_000}
	p2 := SlotPlace{ID: "p2", Tags: []string{"beach"}, BasePrice: 100_000}

	prefs := []string{"beach"}
	score1 := float64(0) + scoreWithPreference(p1, prefs) // 0 match
	score2 := float64(0) + scoreWithPreference(p2, prefs) // +3.0 match

	if score2 <= score1 {
		t.Errorf("Beach place should score higher with beach preference: score1=%.1f score2=%.1f", score1, score2)
	}
}

// P2.2: MealCostVND should return destination-specific costs.
func TestMealCostVND_PerDestination(t *testing.T) {
	cases := []struct {
		dest string
		want int
	}{
		{"đà nẵng", 85_000},
		{"hà nội", 65_000},
		{"phú quốc", 120_000},
		{"unknown city", 80_000}, // default
	}
	for _, c := range cases {
		got := MealCostVND(c.dest)
		if got != c.want {
			t.Errorf("MealCostVND(%q) = %d, want %d", c.dest, got, c.want)
		}
	}
}

// ─── Phase 3 Unit Tests ───────────────────────────────────────────────────────

// P3.1: checkOpeningHours should flag places scheduled outside their hours.
func TestCheckOpeningHours_DetectsClosedVenue(t *testing.T) {
	p := &SlotPlace{ID: "ch", Name: "Chợ Hàn", Hours: "06:00-19:00"}
	days := []DayPlan{
		{
			DayNum: 2,
			Slots: []TimeSlot{
				{Start: "19:30", End: "20:30", SlotType: "evening_activity", Place: p},
			},
		},
	}
	violations := checkOpeningHours(days)
	if len(violations) == 0 {
		t.Error("Expected CLOSED_HOURS violation for place scheduled after closing time")
	} else if violations[0].Rule != "CLOSED_HOURS" {
		t.Errorf("Expected CLOSED_HOURS, got %s", violations[0].Rule)
	}
}

// P3.3: SwapOptimize should not increase total travel distance.
func TestSwapOptimize_ReducesTravelDistance(t *testing.T) {
	// Day 2: [MySon(south), SonTra(north)] — far apart
	// Day 3: [MarbleMtn(south), MyKhe(east)] — mixed
	// After swap: SonTra might go with MyKhe, MarbleMtn with MySon
	assignments := map[int][]SlotPlace{
		2: {
			{ID: "ms", Lat: 15.78, Lng: 108.12}, // My Son (south)
			{ID: "st", Lat: 16.10, Lng: 108.27}, // Son Tra (north)
		},
		3: {
			{ID: "mm", Lat: 15.97, Lng: 108.26}, // Marble Mtn (south-ish)
			{ID: "mk", Lat: 16.06, Lng: 108.24}, // My Khe (east)
		},
	}
	dayDuration := map[int]int{2: 240, 3: 240}
	before := dayTotalDistance(assignments[2]) + dayTotalDistance(assignments[3])
	SwapOptimize(assignments, dayDuration, 5)
	after := dayTotalDistance(assignments[2]) + dayTotalDistance(assignments[3])

	if after > before+0.01 {
		t.Errorf("SwapOptimize increased total distance: before=%.2f after=%.2f", before, after)
	}
}

// P3.5: dynamicBudgetRatio should return lower attrRatio for budget trips.
func TestDynamicBudgetRatio_AdjustsForBudgetLevel(t *testing.T) {
	// 2M for 2 pax × 3 days × 85K/meal = 1.53M food → 76% of budget → budget trip
	attrRatioLow, foodRatioLow := dynamicBudgetRatio(2_000_000, "đà nẵng", 3, 2)
	// 20M for 2 pax × 3 days × 85K/meal = 1.53M food → 7.6% of budget → luxury trip
	attrRatioHigh, _ := dynamicBudgetRatio(20_000_000, "đà nẵng", 3, 2)

	if attrRatioLow >= attrRatioHigh {
		t.Errorf("Budget trip should have lower attrRatio (%.2f) than luxury (%.2f)", attrRatioLow, attrRatioHigh)
	}
	if foodRatioLow <= 0.45 {
		t.Errorf("Budget trip foodRatio should be > 0.45, got %.2f", foodRatioLow)
	}
}

// ─── Integration Tests ────────────────────────────────────────────────────────

// Integration test helpers — use planner functions directly without DB.

func buildTestRequest(dest string, days int, budget, guests int) GenerateRequest {
	return GenerateRequest{
		Destination: dest,
		StartDate:   "2026-05-01",
		EndDate:     "2026-05-0" + string(rune('0'+days)),
		BudgetVND:   budget,
		GuestCount:  guests,
	}
}

// TestGenerate_Pipeline_NoDB verifies the full pipeline (minus DB) produces valid output.
func TestGenerate_Pipeline_NoDB(t *testing.T) {
	// Simulate: selected places → assignToDays → buildDayPlan → validate
	mustVisit := []SlotPlace{
		makePlace("bnh", "Bà Nà Hills", 360, 1_000_000, true, true, 15.99, 107.98, nil),
		makePlace("mk", "Mỹ Khê", 120, 0, true, false, 16.06, 108.24, nil),
	}
	clusters := [][]SlotPlace{
		{makePlace("mm", "Marble Mtn", 90, 150_000, false, false, 15.97, 108.26, nil)},
	}

	assignments, dayDurationMap := assignToDays(mustVisit, clusters, 5)
	// 2-opt per day
	for day, places := range assignments {
		if len(places) > 1 {
			assignments[day] = TwoOptImprove(SortByNearest(places, places[0].Lat, places[0].Lng))
		}
	}
	SwapOptimize(assignments, dayDurationMap, 3)
	fillEmptyDays(assignments, append(mustVisit, makePlace("hm", "Han Market", 60, 0, false, false, 16.07, 108.22, nil)), 5)

	// Build day plans
	days := make([]DayPlan, 0, 5)
	for d := 1; d <= 5; d++ {
		dp := BuildDayPlan(d, 5, assignments[d], nil, "2026-05-01", false, "", "", TemplateStandard)
		days = append(days, dp)
	}

	if len(days) != 5 {
		t.Errorf("Expected 5 day plans, got %d", len(days))
	}
	// All days should have a dayType
	for _, dp := range days {
		if dp.DayType == "" {
			t.Errorf("Day %d has empty DayType", dp.DayNum)
		}
	}
	// Validate: no DAY_TOO_FULL violations
	attrSpent := recalcAttrSpent(assignments, 2)
	violations := Validate(days, 10_000_000, attrSpent, 510_000, assignments)
	for _, v := range violations {
		if v.Rule == "DAY_TOO_FULL" {
			t.Errorf("DAY_TOO_FULL violation on day %d: %s", v.Day, v.Message)
		}
	}
}

// TestBudgetTrip_FoodRatioAdjusted verifies dynamic ratio for budget trip.
func TestBudgetTrip_FoodRatioAdjusted(t *testing.T) {
	attrRatio, foodRatio := dynamicBudgetRatio(2_000_000, "đà nẵng", 3, 2)
	if attrRatio >= 0.45 {
		t.Errorf("Budget trip attr ratio should be < 0.45, got %.2f", attrRatio)
	}
	if foodRatio <= 0.40 {
		t.Errorf("Budget trip food ratio should be > 0.40, got %.2f", foodRatio)
	}
}

// TestNoFoodVenues_GracefulError verifies 0 food venues returns warning, not crash.
func TestNoFoodVenues_GracefulError(t *testing.T) {
	foodMap, violations := BuildFoodMap(nil, map[int][]SlotPlace{1: {}, 2: {}, 3: {}}, 3, "test-dest", "local", 0)
	if foodMap == nil {
		t.Error("BuildFoodMap should return non-nil empty map, not nil")
	}
	foundWarning := false
	for _, v := range violations {
		if v.Rule == "NO_FOOD_VENUES" && v.Severity == "warning" {
			foundWarning = true
		}
	}
	if !foundWarning {
		t.Error("Expected NO_FOOD_VENUES warning violation when 0 food venues")
	}
}
