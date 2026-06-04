package handlers

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestValidateTripLength pins the F10 denial-of-wallet guard: the planner must
// reject malformed or absurdly long date ranges before doing (paid) work.
func TestValidateTripLength(t *testing.T) {
	t.Run("normal range accepted", func(t *testing.T) {
		assert.NoError(t, validateTripLength("2025-06-15", "2025-06-20"))
	})

	t.Run("same-day accepted", func(t *testing.T) {
		assert.NoError(t, validateTripLength("2025-06-15", "2025-06-15"))
	})

	t.Run("exactly the cap accepted", func(t *testing.T) {
		assert.NoError(t, validateTripLength("2025-06-01", "2025-06-30")) // 30 days
	})

	t.Run("over the cap rejected", func(t *testing.T) {
		err := validateTripLength("2020-01-01", "2030-01-01")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "exceeds")
	})

	t.Run("reversed range rejected", func(t *testing.T) {
		err := validateTripLength("2025-06-20", "2025-06-15")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "on or after")
	})

	t.Run("malformed date rejected", func(t *testing.T) {
		require.Error(t, validateTripLength("not-a-date", "2025-06-20"))
	})
}
