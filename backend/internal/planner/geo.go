package planner

import "math"

const earthRadiusKm = 6371.0

// HaversineKm returns the great-circle distance between two lat/lng points in km.
func HaversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusKm * c
}

// EstimateTravelMin converts km to estimated travel minutes (~30 km/h in Vietnam urban).
func EstimateTravelMin(km float64) int {
	if km < 0.3 {
		return 5 // walking distance
	}
	mins := int(math.Ceil(km / 30.0 * 60.0))
	if mins < 5 {
		return 5
	}
	return mins
}

// SortByNearest reorders places to minimize backtracking using greedy nearest-neighbor.
// Places without coordinates are appended at the end.
func SortByNearest(places []SlotPlace, startLat, startLng float64) []SlotPlace {
	if len(places) <= 1 {
		return places
	}

	withCoords := []SlotPlace{}
	noCoords := []SlotPlace{}
	for _, p := range places {
		if p.Lat != 0 && p.Lng != 0 {
			withCoords = append(withCoords, p)
		} else {
			noCoords = append(noCoords, p)
		}
	}

	if len(withCoords) == 0 {
		return places
	}

	sorted := make([]SlotPlace, 0, len(places))
	used := make([]bool, len(withCoords))
	curLat, curLng := startLat, startLng

	for range withCoords {
		bestIdx := -1
		bestDist := math.MaxFloat64
		for i, p := range withCoords {
			if used[i] {
				continue
			}
			d := HaversineKm(curLat, curLng, p.Lat, p.Lng)
			if d < bestDist {
				bestDist = d
				bestIdx = i
			}
		}
		if bestIdx >= 0 {
			used[bestIdx] = true
			sorted = append(sorted, withCoords[bestIdx])
			curLat = withCoords[bestIdx].Lat
			curLng = withCoords[bestIdx].Lng
		}
	}

	return append(sorted, noCoords...)
}

// ClusterByProximity groups places into clusters where intra-cluster max distance <= thresholdKm.
// Uses a greedy single-linkage approach. Places without coords form their own "no-coords" group.
func ClusterByProximity(places []SlotPlace, thresholdKm float64) [][]SlotPlace {
	if len(places) == 0 {
		return nil
	}

	withCoords := []SlotPlace{}
	noCoords := []SlotPlace{}
	for _, p := range places {
		if p.Lat != 0 && p.Lng != 0 {
			withCoords = append(withCoords, p)
		} else {
			noCoords = append(noCoords, p)
		}
	}

	clusters := [][]SlotPlace{}
	assigned := make([]bool, len(withCoords))

	for i, p := range withCoords {
		if assigned[i] {
			continue
		}
		cluster := []SlotPlace{p}
		assigned[i] = true
		for j, q := range withCoords {
			if assigned[j] {
				continue
			}
			// Check distance to any already-in-cluster member
			for _, c := range cluster {
				if HaversineKm(c.Lat, c.Lng, q.Lat, q.Lng) <= thresholdKm {
					cluster = append(cluster, q)
					assigned[j] = true
					break
				}
			}
		}
		clusters = append(clusters, cluster)
	}

	if len(noCoords) > 0 {
		clusters = append(clusters, noCoords)
	}

	return clusters
}

// CentroidOf returns the geographic centroid of a set of places.
func CentroidOf(places []SlotPlace) (lat, lng float64) {
	n := 0
	for _, p := range places {
		if p.Lat != 0 && p.Lng != 0 {
			lat += p.Lat
			lng += p.Lng
			n++
		}
	}
	if n == 0 {
		return 0, 0
	}
	return lat / float64(n), lng / float64(n)
}

// twoOptMaxIter is the maximum number of 2-opt improvement iterations per day.
// With N ≤ 10 places/day, O(N² × iter) ≤ 2000 ops → well under 1ms.
const twoOptMaxIter = 20

// TwoOptImprove improves an intra-day route by reversing segments that reduce
// total travel distance. Uses greedy nearest-neighbor result as starting point.
// Complexity: O(N² × twoOptMaxIter) — safe for N ≤ 10.
func TwoOptImprove(places []SlotPlace) []SlotPlace {
	n := len(places)
	if n <= 3 {
		return places
	}
	best := make([]SlotPlace, n)
	copy(best, places)
	improved := true
	iter := 0
	for improved && iter < twoOptMaxIter {
		improved = false
		iter++
		for i := 1; i < n-1; i++ {
			for j := i + 1; j < n; j++ {
				before := edgeCost(best[i-1], best[i]) + edgeCost(best[j], safeGet(best, j+1))
				after := edgeCost(best[i-1], best[j]) + edgeCost(best[i], safeGet(best, j+1))
				if after < before-0.01 { // 0.01km threshold prevents float noise
					reverseSegment(best, i, j)
					improved = true
				}
			}
		}
	}
	return best
}

func edgeCost(a, b SlotPlace) float64 {
	if a.Lat == 0 || b.Lat == 0 {
		return 0
	}
	return HaversineKm(a.Lat, a.Lng, b.Lat, b.Lng)
}

func safeGet(places []SlotPlace, i int) SlotPlace {
	if i >= len(places) {
		return SlotPlace{}
	}
	return places[i]
}

func reverseSegment(places []SlotPlace, i, j int) {
	for i < j {
		places[i], places[j] = places[j], places[i]
		i++
		j--
	}
}

// dayTotalDistance computes the sum of inter-place distances for a day's places.
func dayTotalDistance(places []SlotPlace) float64 {
	total := 0.0
	for i := 1; i < len(places); i++ {
		total += edgeCost(places[i-1], places[i])
	}
	return total
}

// SwapOptimize performs inter-day swap optimization: tries swapping individual
// places between different days to reduce total cross-day travel distance while
// respecting the per-day duration cap.
func SwapOptimize(assignments map[int][]SlotPlace, dayDuration map[int]int, maxRounds int) {
	days := make([]int, 0, len(assignments))
	for d := range assignments {
		days = append(days, d)
	}
	for round := 0; round < maxRounds; round++ {
		improved := false
		for di := 0; di < len(days); di++ {
			for dj := di + 1; dj < len(days); dj++ {
				d1, d2 := days[di], days[dj]
				pls1, pls2 := assignments[d1], assignments[d2]
				for i := range pls1 {
					for j := range pls2 {
						p1, p2 := pls1[i], pls2[j]
						// Guard: don't swap evening landmarks away from arrival day (day 1),
						// or move non-evening places into day 1 displacing evening spots.
						if (d1 == 1 && isEveningPlace(p1)) || (d2 == 1 && isEveningPlace(p2)) {
							continue
						}
						// Check duration constraints after swap
						dur1After := dayDuration[d1] - activityDuration(p1) + activityDuration(p2)
						dur2After := dayDuration[d2] - activityDuration(p2) + activityDuration(p1)
						if dur1After > maxDurationPerDay || dur2After > maxDurationPerDay {
							continue
						}
						// Compute distance delta
						before := dayTotalDistance(pls1) + dayTotalDistance(pls2)
						// Apply swap temporarily
						pls1[i], pls2[j] = p2, p1
						after := dayTotalDistance(pls1) + dayTotalDistance(pls2)
						if after < before-0.1 { // accept if saves > 100m
							// Keep swap
							dayDuration[d1] = dur1After
							dayDuration[d2] = dur2After
							assignments[d1] = pls1
							assignments[d2] = pls2
							improved = true
						} else {
							// Revert
							pls1[i], pls2[j] = p1, p2
						}
					}
				}
			}
		}
		if !improved {
			break
		}
	}
}

