package planner

import (
	"fmt"
	"strings"
	"tripcompass-backend/internal/models"
)

// EvaluateCombos finds the best combo deal for the selected attractions.
func EvaluateCombos(combos []models.Combo, selected []SlotPlace, budgetVND, guestCount int) *ComboResult {
	if len(combos) == 0 || len(selected) == 0 {
		return &ComboResult{UseCombo: false}
	}

	attrBudget := int(float64(budgetVND) * attrBudgetRatio)
	selectedNames := map[string]int{} // name_lower → price_per_person
	for _, s := range selected {
		selectedNames[strings.ToLower(s.Name)] = s.BasePrice
	}

	var best *ComboResult
	bestScore := -1.0

	for _, combo := range combos {
		if combo.PricePerPerson == nil {
			continue
		}
		priceTotal := *combo.PricePerPerson * guestCount
		if priceTotal > attrBudget {
			continue // over budget
		}

		// Calculate overlap and itemized cost
		overlapItems := []string{}
		itemizedTotal := 0
		for _, inc := range combo.Includes {
			incLower := strings.ToLower(inc)
			for name, price := range selectedNames {
				// Bidirectional substring match (safe for Unicode)
				if strings.Contains(incLower, name) || strings.Contains(name, incLower) {
					overlapItems = append(overlapItems, inc)
					itemizedTotal += price * guestCount
					break
				}
			}
		}

		if len(overlapItems) == 0 {
			continue // no overlap with selected places
		}

		savings := itemizedTotal - priceTotal
		savingsPct := 0.0
		if itemizedTotal > 0 {
			savingsPct = float64(savings) / float64(itemizedTotal) * 100
		}

		// Value score
		score := savingsPct
		if len(overlapItems) >= 2 {
			score += 10
		}

		includesLunch := false
		for _, inc := range combo.Includes {
			l := strings.ToLower(inc)
			if strings.Contains(l, "lunch") || strings.Contains(l, "bữa trưa") || strings.Contains(l, "ăn trưa") {
				includesLunch = true
				score += 5
			}
		}

		provider := ""
		if combo.Provider != nil {
			provider = *combo.Provider
		}

		var reasonMsg string
		if savings > 0 {
			reasonMsg = fmt.Sprintf("Tiết kiệm %s VND (%.0f%%) so với mua lẻ — bao gồm %d/%d địa điểm",
				formatVND(savings), savingsPct, len(overlapItems), len(selected))
		} else {
			reasonMsg = fmt.Sprintf("Combo đắt hơn mua lẻ %s VND — không khuyến nghị dùng",
				formatVND(-savings))
		}

		if score > bestScore {
			bestScore = score
			best = &ComboResult{
				UseCombo:       savings > 0,
				Name:           combo.Name,
				Provider:       provider,
				PricePerPerson: *combo.PricePerPerson,
				PriceTotal:     priceTotal,
				SavingsVND:     savings,
				SavingsPct:     savingsPct,
				IncludesLunch:  includesLunch,
				Reason:         reasonMsg,
			}
		}
	}

	if best == nil {
		return &ComboResult{UseCombo: false, Reason: "Không có combo phù hợp trong ngân sách"}
	}
	return best
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// formatVND formats an integer as a comma-separated VND string.
func formatVND(v int) string {
	if v < 0 {
		v = -v
	}
	s := fmt.Sprintf("%d", v)
	n := len(s)
	if n <= 3 {
		return s
	}
	result := make([]byte, 0, n+(n-1)/3)
	for i, c := range s {
		if i > 0 && (n-i)%3 == 0 {
			result = append(result, ',')
		}
		result = append(result, byte(c))
	}
	return string(result)
}
