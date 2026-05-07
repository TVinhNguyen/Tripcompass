package planner

// slots_special.go — day builders for arrival, departure, and full-day excursion days.

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

	// Split places: afternoon vs evening (e.g. Dragon Bridge should be after dinner)
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
			cur = end + BufferBetweenMin
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
// Starts at 07:00; morning activity at 08:00 to respect typical opening hours.
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

	// Morning activity (capped at 2.5h so done by ~10:30 at latest)
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

// buildFullDay: breakfast → full-day attraction (actual duration) → optional secondary → dinner at 17:30.
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
		cur = end + BufferBetweenMin

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
