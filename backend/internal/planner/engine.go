package planner

import (
	"fmt"
	"sort"
	"strings"
	"time"
	"tripcompass-backend/internal/models"

	"gorm.io/gorm"
)

// Engine is the main planner orchestrator.
type Engine struct {
	db *gorm.DB
}

// NewEngine creates a new planner engine.
func NewEngine(db *gorm.DB) *Engine {
	return &Engine{db: db}
}

// Generate runs the full slot-assignment pipeline and returns a structured itinerary.
//
// Pipeline:
//  1. BuildStrategy     — derive budget tier, slot template, constraints
//  2. Query DB          — attractions, food, combos filtered by strategy
//  3. SelectAttractions — filter + score within budget constraints
//  4. EvaluateCombos    — check if package deal saves money
//  5. ClusterByProximity — geo-group regular attractions
//  6. assignToDays      — distribute must-visit + clusters across days (BestTimeOfDay aware)
//  7. Route optimize    — 2-opt per day + inter-day swap
//  8. BuildFoodMap      — assign food venues by food mode, no global repeats
//  9. BuildDayPlan      — construct time slots per day (template-aware)
//  10. Validate         — rule checks (budget, hours, food, stale price)
//  11. BudgetRecap      — dynamic ratio summary
func (e *Engine) Generate(req GenerateRequest) (*GenerateResponse, error) {
	if req.GuestCount <= 0 {
		req.GuestCount = 2
	}

	numDays, err := computeNumDays(req.StartDate, req.EndDate)
	if err != nil {
		return nil, fmt.Errorf("invalid dates: %w", err)
	}
	if numDays < 1 {
		numDays = 1
	}

	// Infer travel month from StartDate if not provided
	if req.TravelMonth == 0 {
		if t, err := time.Parse("2006-01-02", req.StartDate); err == nil {
			req.TravelMonth = int(t.Month())
		}
	}

	dest := strings.ToLower(strings.TrimSpace(req.Destination))

	// ── Step 1: Build strategy ────────────────────────────────────────────────
	strategy := BuildStrategy(req)

	// ── Step 2: Query DB ──────────────────────────────────────────────────────
	var attractions []models.Place
	q := e.db.Table("schema_travel.places").
		Where("destination = ? AND category = ?", dest, models.CategoryAttraction).
		Order("must_visit DESC, priority_score DESC, rating DESC NULLS LAST")

	// Seasonal filter: only include places available this month
	if req.TravelMonth > 0 {
		q = q.Where(`
			NOT EXISTS (
				SELECT 1 FROM schema_travel.place_seasons ps
				WHERE ps.place_id = places.id
				  AND ? != ALL(ps.open_months)
			)`, req.TravelMonth)
	}
	q.Find(&attractions)

	var foodPlaces []models.Place
	e.db.Table("schema_travel.places").
		Where("destination = ? AND category = ?", dest, models.CategoryFood).
		Order("priority_score DESC, rating DESC NULLS LAST").
		Find(&foodPlaces)

	var combos []models.Combo
	e.db.Table("schema_travel.combos").
		Where("destination = ?", dest).
		Order("price_per_person ASC NULLS LAST").
		Find(&combos)

	// ── Step 3: Select attractions within budget + tier constraints ───────────
	selected := SelectAttractions(attractions, req.BudgetVND, req.GuestCount, req.PreferenceTags, strategy.Budget)

	// ── Step 4: Evaluate combos ───────────────────────────────────────────────
	comboResult := EvaluateCombos(combos, selected, req.BudgetVND, req.GuestCount)

	// ── Step 5: Separate must_visit from regular ──────────────────────────────
	mustVisit := []SlotPlace{}
	regular := []SlotPlace{}
	for _, p := range selected {
		if p.IsMustVisit {
			mustVisit = append(mustVisit, p)
		} else {
			regular = append(regular, p)
		}
	}

	// ── Step 6: Cluster + assign to days (BestTimeOfDay-aware) ───────────────
	clusters := ClusterByProximity(regular, 5.0)
	dayAssignments, dayDurationMap := assignToDays(mustVisit, clusters, numDays)

	// ── Step 7: Per-day route optimize ────────────────────────────────────────
	for day, places := range dayAssignments {
		if len(places) > 1 {
			ordered := SortByNearest(places, places[0].Lat, places[0].Lng)
			// Sort BestTimeOfDay: morning places first, evening last
			ordered = sortByTimeOfDay(ordered)
			dayAssignments[day] = TwoOptImprove(ordered)
		}
	}

	// Inter-day swap optimization (reduces cross-day travel distance)
	SwapOptimize(dayAssignments, dayDurationMap, 3)

	// ── Step 8: Build food map (food mode from strategy) ─────────────────────
	foodMap, foodViolations := BuildFoodMap(foodPlaces, dayAssignments, numDays, dest, strategy.Budget.FoodMode, strategy.Budget.MaxMealCost)

	// ── Step 9: Calculate food spend from actual selected venues ─────────────
	// Sum BasePrice of all food venues assigned across all days.
	// Falls back to MaxMealCost (or MealCostVND if unconstrained) for unassigned meals.
	foodSpent := calcActualFoodSpent(foodMap, numDays, dest, req.GuestCount, strategy.Budget.MaxMealCost)

	// Fill empty standard days
	fillEmptyDays(dayAssignments, selected, numDays)

	// Recalculate attrSpent from actual schedule (excludes dropped places)
	attrSpent := recalcAttrSpent(dayAssignments, req.GuestCount)

	// ── Step 10: Build day plans (template-aware) ─────────────────────────────
	days := make([]DayPlan, 0, numDays)
	for d := 1; d <= numDays; d++ {
		attrSlots := dayAssignments[d]
		dm := foodMap[d] // may be nil; BuildDayPlan handles nil safely
		dp := BuildDayPlan(
			d, numDays,
			attrSlots, dm,
			req.StartDate,
			comboResult.IncludesLunch,
			req.ArrivalTime, req.DepartureTime,
			strategy.Template,
		)
		days = append(days, dp)
	}

	// ── Step 11: Validate ─────────────────────────────────────────────────────
	violations := Validate(days, req.BudgetVND, attrSpent, foodSpent, dayAssignments)
	violations = append(violations, foodViolations...)

	// Collect stale price warnings for response metadata
	stalePriceWarnings := collectStalePriceWarnings(days)

	// ── Step 12: Budget recap ─────────────────────────────────────────────────
	attrRatio, _ := dynamicBudgetRatio(req.BudgetVND, dest, numDays, req.GuestCount)
	attrBudget := int(float64(req.BudgetVND) * attrRatio)
	foodBudget := FoodBudgetVND(req.BudgetVND)
	miscBudget := req.BudgetVND - attrBudget - foodBudget
	remaining := req.BudgetVND - attrSpent - foodSpent

	resp := &GenerateResponse{
		Days: days,
		BudgetRecap: BudgetRecap{
			TotalBudgetVND:      req.BudgetVND,
			AttractionBudgetVND: attrBudget,
			AttractionSpentVND:  attrSpent,
			FoodBudgetVND:       foodBudget,
			FoodSpentVND:        foodSpent,
			MiscBudgetVND:       miscBudget,
			RemainingVND:        remaining,
			WithinBudget:        (attrSpent + foodSpent) <= req.BudgetVND,
		},
		Violations:         violations,
		BudgetTier:         strategy.Tier.String(),
		BudgetWarning:      strategy.Budget.WarnMessage,
		SlotTemplate:       string(strategy.Template),
		PriceStaleWarnings: stalePriceWarnings,
	}

	if comboResult != nil {
		resp.ComboResult = comboResult
	}

	return resp, nil
}

// sortByTimeOfDay reorders places so morning-best places come first,
// evening-best places come last, respecting existing geo clustering.
func sortByTimeOfDay(places []SlotPlace) []SlotPlace {
	morning := []SlotPlace{}
	any := []SlotPlace{}
	evening := []SlotPlace{}

	for _, p := range places {
		switch strings.ToLower(p.BestTimeOfDay) {
		case "morning":
			morning = append(morning, p)
		case "evening", "night":
			evening = append(evening, p)
		default:
			any = append(any, p)
		}
	}
	result := make([]SlotPlace, 0, len(places))
	result = append(result, morning...)
	result = append(result, any...)
	result = append(result, evening...)
	return result
}

// collectStalePriceWarnings returns display strings for places with stale prices.
func collectStalePriceWarnings(days []DayPlan) []string {
	staleThreshold := time.Now().AddDate(0, 0, -30)
	seen := map[string]bool{}
	warnings := []string{}
	for _, day := range days {
		for _, slot := range day.Slots {
			if slot.Place == nil || slot.Place.IsFree || seen[slot.Place.ID] {
				continue
			}
			if slot.Place.PriceUpdatedAt != nil && slot.Place.PriceUpdatedAt.Before(staleThreshold) {
				seen[slot.Place.ID] = true
				warnings = append(warnings, fmt.Sprintf(
					"%s (cập nhật lần cuối: %s)",
					slot.Place.Name,
					slot.Place.PriceUpdatedAt.Format("02/01/2006"),
				))
			}
		}
	}
	return warnings
}

// calcActualFoodSpent sums the BasePrice of all assigned food venues across all days.
// For meals without an assigned venue, falls back to min(maxMealCost, MealCostVND).
// maxMealCost=0 means no constraint — uses MealCostVND estimate.
func calcActualFoodSpent(foodMap map[int]DayFoodMap, numDays int, dest string, guestCount, maxMealCost int) int {
	estimateCost := MealCostVND(dest)
	if maxMealCost > 0 && maxMealCost < estimateCost {
		estimateCost = maxMealCost // use the tighter cap as the fallback estimate
	}
	total := 0
	for d := 1; d <= numDays; d++ {
		dayMeals := foodMap[d]
		for _, mealType := range []string{"breakfast", "lunch", "dinner"} {
			if venues, ok := dayMeals[mealType]; ok && len(venues) > 0 {
				price := venues[0].BasePrice
				if price == 0 {
					price = estimateCost // free venue: use fallback
				}
				total += price * guestCount
			} else {
				total += estimateCost * guestCount // no venue assigned: use estimate
			}
		}
	}
	return total
}

// assignToDays distributes must_visit and clusters across numDays.
// Returns both the day→places map and a dayDuration map for use in SwapOptimize.
//
// Strategy:
//  0. Evening must-visit → arrival day (day 1)
//  1. Full-day items (duration ≥ 360min) → dedicated middle days
//  2. Normal must_visit → capacity-sorted middle days
//  3. Clusters → cluster-aware: entire cluster to one day (preserves geo locality)
//  4. 2-day trip edge case: distribute evenly between arrival + departure
func assignToDays(mustVisit []SlotPlace, clusters [][]SlotPlace, numDays int) (map[int][]SlotPlace, map[int]int) {
	assignments := map[int][]SlotPlace{}
	dayDuration := map[int]int{}
	for d := 1; d <= numDays; d++ {
		assignments[d] = []SlotPlace{}
		dayDuration[d] = 0
	}

	// Middle days: skip day 1 (arrival) and day N (departure)
	middleDays := []int{}
	for d := 2; d < numDays; d++ {
		middleDays = append(middleDays, d)
	}
	allDays := []int{}
	for d := 1; d <= numDays; d++ {
		allDays = append(allDays, d)
	}
	if len(middleDays) == 0 {
		middleDays = allDays
	}

	addToDay := func(day int, places []SlotPlace) bool {
		total := 0
		for _, p := range places {
			total += activityDuration(p)
		}
		if dayDuration[day]+total <= maxDurationPerDay {
			assignments[day] = append(assignments[day], places...)
			dayDuration[day] += total
			return true
		}
		return false
	}

	// ── Step 0: evening must-visit → arrival day (day 1) ─────────────────────
	eveningMustVisit := []SlotPlace{}
	remainingMustVisit := []SlotPlace{}
	for _, p := range mustVisit {
		if !p.IsFullDay && isEveningPlace(p) {
			eveningMustVisit = append(eveningMustVisit, p)
		} else {
			remainingMustVisit = append(remainingMustVisit, p)
		}
	}
	for _, p := range eveningMustVisit {
		addToDay(1, []SlotPlace{p})
	}
	mustVisit = remainingMustVisit

	// ── Step 1: collect ALL full-day items ────────────────────────────────────
	fullDayItems := []SlotPlace{}
	normalClusters := [][]SlotPlace{}
	mustNormal := []SlotPlace{}

	for _, p := range mustVisit {
		if p.IsFullDay {
			fullDayItems = append(fullDayItems, p)
		} else {
			mustNormal = append(mustNormal, p)
		}
	}
	for _, cluster := range clusters {
		hasFullDay := false
		for _, p := range cluster {
			if p.IsFullDay {
				hasFullDay = true
				break
			}
		}
		if hasFullDay {
			fullDayItems = append(fullDayItems, cluster...)
		} else {
			normalClusters = append(normalClusters, cluster)
		}
	}
	sort.Slice(fullDayItems, func(i, j int) bool {
		return activityDuration(fullDayItems[i]) > activityDuration(fullDayItems[j])
	})

	// ── Step 2: full-day items → dedicated middle days ────────────────────────
	for _, p := range fullDayItems {
		for _, day := range sortedByCapacity(middleDays, dayDuration) {
			if addToDay(day, []SlotPlace{p}) {
				break
			}
		}
	}

	// ── Step 3: normal must_visit → remaining middle-day capacity ─────────────
	for _, p := range mustNormal {
		assigned := false
		for _, day := range sortedByCapacity(middleDays, dayDuration) {
			if addToDay(day, []SlotPlace{p}) {
				assigned = true
				break
			}
		}
		if !assigned {
			addToDay(1, []SlotPlace{p})
		}
	}

	// ── Step 4: cluster-aware assignment (whole cluster per day) ──────────────
	sort.Slice(normalClusters, func(i, j int) bool {
		return clusterDuration(normalClusters[i]) > clusterDuration(normalClusters[j])
	})
	for _, cluster := range normalClusters {
		assigned := false
		for _, day := range sortedByCapacity(allDays, dayDuration) {
			if addToDay(day, cluster) {
				assigned = true
				break
			}
		}
		if !assigned {
			for _, p := range cluster {
				for _, day := range sortedByCapacity(allDays, dayDuration) {
					if addToDay(day, []SlotPlace{p}) {
						break
					}
				}
			}
		}
	}

	// ── Step 5: 2-day trip edge case ──────────────────────────────────────────
	if numDays == 2 {
		for i, p := range mustNormal {
			if i%2 == 0 {
				addToDay(1, []SlotPlace{p})
			} else {
				addToDay(2, []SlotPlace{p})
			}
		}
	}

	return assignments, dayDuration
}

func computeNumDays(startDate, endDate string) (int, error) {
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return 0, err
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return 0, err
	}
	days := int(end.Sub(start).Hours()/24) + 1
	if days < 1 {
		return 1, nil
	}
	return days, nil
}

// fillEmptyDays ensures no standard day is left with zero activities.
func fillEmptyDays(assignments map[int][]SlotPlace, selected []SlotPlace, numDays int) {
	if len(selected) == 0 {
		return
	}
	usedIDs := map[string]bool{}
	for _, places := range assignments {
		for _, p := range places {
			usedIDs[p.ID] = true
		}
	}
	for d := 2; d < numDays; d++ {
		if len(assignments[d]) > 0 {
			continue
		}
		for _, p := range selected {
			if !usedIDs[p.ID] && activityDuration(p) <= maxDurationPerDay {
				assignments[d] = []SlotPlace{p}
				usedIDs[p.ID] = true
				break
			}
		}
	}
}

// recalcAttrSpent computes the actual attraction spend from scheduled places only.
func recalcAttrSpent(assignments map[int][]SlotPlace, guestCount int) int {
	seen := map[string]bool{}
	spent := 0
	for _, places := range assignments {
		for _, p := range places {
			if seen[p.ID] {
				continue
			}
			seen[p.ID] = true
			spent += p.BasePrice * guestCount
		}
	}
	return spent
}

// sortedByCapacity returns days sorted by remaining capacity (most free first).
func sortedByCapacity(days []int, dayDuration map[int]int) []int {
	sorted := make([]int, len(days))
	copy(sorted, days)
	sort.Slice(sorted, func(i, j int) bool {
		return (maxDurationPerDay - dayDuration[sorted[i]]) > (maxDurationPerDay - dayDuration[sorted[j]])
	})
	return sorted
}

func clusterDuration(cluster []SlotPlace) int {
	total := 0
	for _, p := range cluster {
		total += activityDuration(p)
	}
	return total
}

// isEveningPlace returns true if a place is best experienced in the evening.
func isEveningPlace(p SlotPlace) bool {
	if strings.EqualFold(p.BestTimeOfDay, "evening") || strings.EqualFold(p.BestTimeOfDay, "night") {
		return true
	}
	eveningTags := map[string]bool{
		"evening":    true,
		"nightlife":  true,
		"night-show": true,
		"night":      true,
	}
	for _, tag := range p.Tags {
		if eveningTags[tag] {
			return true
		}
	}
	return false
}
