package planner

// Planner engine tuning constants.
// Centralised here so operators and tests can override without hunting magic numbers.
const (
	// ClusterRadiusKm is the maximum distance (km) between attractions assigned to the same day-cluster.
	ClusterRadiusKm = 5.0

	// StalePriceDays is the number of days after which a place's BasePrice is considered stale.
	StalePriceDays = 30

	// DefaultActivityMin is the assumed visit duration (minutes) when a place has no RecommendedDuration.
	DefaultActivityMin = 120

	// BufferBetweenMin is the travel + transition buffer added between consecutive activities.
	BufferBetweenMin = 30
)
