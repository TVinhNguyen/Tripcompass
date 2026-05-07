package planner

import (
	"fmt"
	"strings"
	"time"
)

// Validate runs all scheduling rule checks and returns violations.
func Validate(days []DayPlan, totalBudget, attrSpent, foodSpent int, dayAssignments map[int][]SlotPlace) []Violation {
	violations := []Violation{}
	violations = append(violations, checkFoodRepeat(days)...)
	violations = append(violations, checkOutdoorNight(days)...)
	violations = append(violations, checkBudget(totalBudget, attrSpent, foodSpent)...)
	violations = append(violations, checkDurationOverflow(dayAssignments)...)
	violations = append(violations, checkOpeningHours(days)...)
	violations = append(violations, checkStalePrices(days)...)
	return violations
}

// checkFoodRepeat flags food venues appearing on consecutive or near-consecutive days.
// Repeating a restaurant after ≥3 days is acceptable (limited venue pools in small cities).
// Repeating on the same day or next day is flagged as a warning.
func checkFoodRepeat(days []DayPlan) []Violation {
	lastSeen := map[string]int{} // placeID → last day seen
	violations := []Violation{}
	const minGap = 2 // must have at least 2 days gap between visits

	for _, day := range days {
		for _, slot := range day.Slots {
			if slot.Place == nil || !mealSlotTypes[slot.SlotType] {
				continue
			}
			if prevDay, ok := lastSeen[slot.Place.ID]; ok {
				gap := day.DayNum - prevDay
				if gap < minGap {
					violations = append(violations, Violation{
						Rule:     "FOOD_REPEAT",
						Severity: "warning",
						Message:  fmt.Sprintf("Quán '%s' lặp lại quá gần (ngày %d và ngày %d, cách %d ngày)", slot.Place.Name, prevDay, day.DayNum, gap),
						Day:      day.DayNum,
					})
				}
			}
			lastSeen[slot.Place.ID] = day.DayNum
		}
	}
	return violations
}

// checkOutdoorNight warns if outdoor attractions are scheduled after 18:00.
func checkOutdoorNight(days []DayPlan) []Violation {
	outdoorKeywords := []string{"bãi biển", "beach", "đảo", "island", "thác", "núi", "rừng", "ngoài trời", "outdoor"}
	violations := []Violation{}

	for _, day := range days {
		for _, slot := range day.Slots {
			if slot.Place == nil || !activitySlotTypes[slot.SlotType] {
				continue
			}
			if slot.Start >= "18:00" {
				name := slot.Place.Name
				for _, kw := range outdoorKeywords {
					if strings.Contains(strings.ToLower(name), kw) {
						violations = append(violations, Violation{
							Rule:     "OUTDOOR_NIGHT",
							Severity: "warning",
							Message:  fmt.Sprintf("'%s' là hoạt động ngoài trời, được xếp vào %s (sau 18:00)", name, slot.Start),
							Day:      day.DayNum,
						})
						break
					}
				}
			}
		}
	}
	return violations
}

// checkBudget warns if combined attraction + food spending exceeds total budget.
func checkBudget(totalBudget, attrSpent, foodSpent int) []Violation {
	attrBudget := int(float64(totalBudget) * attrBudgetRatio)
	violations := []Violation{}

	if attrSpent > attrBudget {
		violations = append(violations, Violation{
			Rule:     "OVER_BUDGET",
			Severity: "warning",
			Message:  fmt.Sprintf("Chi phí tham quan %s vượt ngân sách tham quan %s", formatVND(attrSpent), formatVND(attrBudget)),
		})
	}

	foodBudget := FoodBudgetVND(totalBudget)
	if foodSpent > foodBudget {
		violations = append(violations, Violation{
			Rule:     "FOOD_OVER_BUDGET",
			Severity: "warning",
			Message:  fmt.Sprintf("Chi phí ăn uống ước tính %s vượt ngân sách ăn uống %s", formatVND(foodSpent), formatVND(foodBudget)),
		})
	}

	return violations
}

// checkDurationOverflow warns if any day's total activity duration exceeds maxDurationPerDay.
func checkDurationOverflow(dayAssignments map[int][]SlotPlace) []Violation {
	violations := []Violation{}
	for day, places := range dayAssignments {
		total := 0
		for _, p := range places {
			total += activityDuration(p)
		}
		if total > maxDurationPerDay {
			violations = append(violations, Violation{
				Rule:     "DAY_TOO_FULL",
				Severity: "warning",
				Message:  fmt.Sprintf("Ngày %d có tổng thời gian tham quan %d phút (giới hạn %d)", day, total, maxDurationPerDay),
				Day:      day,
			})
		}
	}
	return violations
}

// checkOpeningHours detects when a place is scheduled outside its opening hours.
// NOTE: breakfast slots are intentionally excluded — 07:00 breakfast is conventional.
func checkOpeningHours(days []DayPlan) []Violation {
	violations := []Violation{}
	for _, day := range days {
		for _, slot := range day.Slots {
			if slot.SlotType == "breakfast" {
				continue
			}
			p := slot.Place
			if p == nil || p.Hours == "" || p.Hours == "00:00-24:00" || p.Hours == "24/7" {
				continue
			}
			openMin, closeMin := parseHours(p.Hours)
			if openMin < 0 || closeMin < 0 {
				continue
			}
			slotStart := timeToMins(slot.Start)
			if slotStart < openMin || slotStart >= closeMin {
				violations = append(violations, Violation{
					Rule:     "CLOSED_HOURS",
					Severity: "warning",
					Message:  fmt.Sprintf("'%s' mở cửa %s nhưng được xếp lúc %s", p.Name, p.Hours, slot.Start),
					Day:      day.DayNum,
				})
			}
		}
	}
	return violations
}

// checkStalePrices flags paid places whose PriceUpdatedAt is older than 30 days.
// Uses SlotPlace.PriceUpdatedAt populated from models.Place.PriceUpdatedAt.
func checkStalePrices(days []DayPlan) []Violation {
	cutoff := time.Now().AddDate(0, 0, -30)
	seen := map[string]bool{}
	violations := []Violation{}

	for _, day := range days {
		for _, slot := range day.Slots {
			if slot.Place == nil || slot.Place.IsFree || seen[slot.Place.ID] {
				continue
			}
			if !activitySlotTypes[slot.SlotType] {
				continue
			}
			if slot.Place.PriceUpdatedAt != nil && slot.Place.PriceUpdatedAt.Before(cutoff) {
				seen[slot.Place.ID] = true
				violations = append(violations, Violation{
					Rule:     "STALE_PRICE",
					Severity: "warning",
					Message: fmt.Sprintf(
						"Giá vé '%s' chưa cập nhật >30 ngày (lần cuối: %s). Kiểm tra lại trước khi đặt.",
						slot.Place.Name,
						slot.Place.PriceUpdatedAt.Format("02/01/2006"),
					),
					Day: day.DayNum,
				})
			}
		}
	}
	return violations
}

// parseHours parses "HH:MM-HH:MM" and returns (openMin, closeMin) in minutes-since-midnight.
func parseHours(hours string) (open, close int) {
	parts := strings.SplitN(hours, "-", 2)
	if len(parts) != 2 {
		return -1, -1
	}
	return timeToMins(strings.TrimSpace(parts[0])), timeToMins(strings.TrimSpace(parts[1]))
}

// timeToMins converts "HH:MM" to minutes since midnight. Returns -1 on parse error.
func timeToMins(t string) int {
	var h, m int
	if _, err := fmt.Sscanf(t, "%d:%d", &h, &m); err != nil {
		return -1
	}
	return h*60 + m
}

