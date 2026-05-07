package services

import "github.com/lib/pq"

// nilSafePQArray converts a []string to pq.StringArray, ensuring nil slices
// are stored as an empty PostgreSQL array ({}) rather than NULL.
//
// Background: pq.StringArray(nil).Value() returns nil (→ NULL in DB), but
// pq.StringArray{}.Value() returns "{}" (→ empty array in DB).
// Storing NULL instead of {} breaks frontend consumers that rely on
// JSON arrays (e.g. [].map(...) works; null.map(...) throws).
func nilSafePQArray(s []string) pq.StringArray {
	if s == nil {
		return pq.StringArray{}
	}
	return pq.StringArray(s)
}
