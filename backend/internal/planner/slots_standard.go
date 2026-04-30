package planner

// slots_standard.go — buildStandardDay: the workhorse for most days of a trip.
//
// Pacing is controlled by SlotTemplate:
//   - Relaxed  (09:00, ≤2 activities): leisure pacing, beach/free-time block
//   - Standard (08:00, ≤3 activities): balanced, current default
//   - Active   (07:00, ≤4 activities): packed, short lunch break

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
		cur = end + BufferBetweenMin
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
				if travelMin > BufferBetweenMin {
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
