package models

import (
	"database/sql/driver"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── DateOnly ─────────────────────────────────────────────────────────────────

func TestDateOnly_MarshalJSON(t *testing.T) {
	t.Run("normal date", func(t *testing.T) {
		d := DateOnly{Time: time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC)}
		b, err := json.Marshal(d)
		require.NoError(t, err)
		assert.Equal(t, `"2025-06-15"`, string(b))
	})

	t.Run("zero value returns null", func(t *testing.T) {
		d := DateOnly{}
		b, err := json.Marshal(d)
		require.NoError(t, err)
		assert.Equal(t, `null`, string(b))
	})
}

func TestDateOnly_UnmarshalJSON(t *testing.T) {
	t.Run("valid date", func(t *testing.T) {
		var d DateOnly
		err := json.Unmarshal([]byte(`"2025-06-15"`), &d)
		require.NoError(t, err)
		assert.Equal(t, 2025, d.Year())
		assert.Equal(t, time.June, d.Month())
		assert.Equal(t, 15, d.Day())
	})

	t.Run("null", func(t *testing.T) {
		var d DateOnly
		err := json.Unmarshal([]byte(`null`), &d)
		require.NoError(t, err)
		assert.True(t, d.IsZero())
	})

	t.Run("empty string", func(t *testing.T) {
		var d DateOnly
		err := json.Unmarshal([]byte(`""`), &d)
		require.NoError(t, err)
		assert.True(t, d.IsZero())
	})

	t.Run("invalid format", func(t *testing.T) {
		var d DateOnly
		err := json.Unmarshal([]byte(`"15/06/2025"`), &d)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "DateOnly")
	})

	t.Run("invalid json", func(t *testing.T) {
		var d DateOnly
		err := json.Unmarshal([]byte(`not-json`), &d)
		assert.Error(t, err)
	})
}

func TestDateOnly_Value(t *testing.T) {
	t.Run("normal date", func(t *testing.T) {
		d := DateOnly{Time: time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC)}
		val, err := d.Value()
		require.NoError(t, err)
		assert.Equal(t, "2025-06-15", val)
	})

	t.Run("zero value returns nil", func(t *testing.T) {
		d := DateOnly{}
		val, err := d.Value()
		require.NoError(t, err)
		assert.Nil(t, val)
	})
}

func TestDateOnly_Scan(t *testing.T) {
	t.Run("time.Time", func(t *testing.T) {
		var d DateOnly
		ts := time.Date(2025, 6, 15, 10, 30, 0, 0, time.UTC)
		err := d.Scan(ts)
		require.NoError(t, err)
		assert.Equal(t, 2025, d.Year())
		assert.Equal(t, time.June, d.Month())
		assert.Equal(t, 15, d.Day())
	})

	t.Run("string", func(t *testing.T) {
		var d DateOnly
		err := d.Scan("2025-06-15")
		require.NoError(t, err)
		assert.Equal(t, 2025, d.Year())
		assert.Equal(t, time.June, d.Month())
		assert.Equal(t, 15, d.Day())
	})

	t.Run("nil", func(t *testing.T) {
		var d DateOnly
		err := d.Scan(nil)
		require.NoError(t, err)
		assert.True(t, d.IsZero())
	})

	t.Run("unsupported type", func(t *testing.T) {
		var d DateOnly
		err := d.Scan(12345)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unsupported type")
	})
}

// ─── StringArray ──────────────────────────────────────────────────────────────

func TestStringArray_Value(t *testing.T) {
	t.Run("empty array", func(t *testing.T) {
		a := StringArray{}
		val, err := a.Value()
		require.NoError(t, err)
		assert.Equal(t, "{}", val)
	})

	t.Run("single element", func(t *testing.T) {
		a := StringArray{"hello"}
		val, err := a.Value()
		require.NoError(t, err)
		assert.Equal(t, `{"hello"}`, val)
	})

	t.Run("multiple elements", func(t *testing.T) {
		a := StringArray{"beach", "food", "culture"}
		val, err := a.Value()
		require.NoError(t, err)
		assert.Equal(t, `{"beach","food","culture"}`, val)
	})

	t.Run("element with double quotes", func(t *testing.T) {
		a := StringArray{`say "hello"`}
		val, err := a.Value()
		require.NoError(t, err)
		assert.Equal(t, `{"say \"hello\""}`, val)
	})

	t.Run("element with backslash", func(t *testing.T) {
		a := StringArray{`path\to\file`}
		val, err := a.Value()
		require.NoError(t, err)
		assert.Equal(t, `{"path\\to\\file"}`, val)
	})
}

func TestStringArray_Scan(t *testing.T) {
	t.Run("valid postgres array", func(t *testing.T) {
		var a StringArray
		err := a.Scan(`{"beach","food","culture"}`)
		require.NoError(t, err)
		assert.Equal(t, StringArray{"beach", "food", "culture"}, a)
	})

	t.Run("empty braces", func(t *testing.T) {
		var a StringArray
		err := a.Scan("{}")
		require.NoError(t, err)
		assert.Equal(t, StringArray{}, a)
	})

	t.Run("nil value", func(t *testing.T) {
		var a StringArray
		err := a.Scan(nil)
		require.NoError(t, err)
		assert.Equal(t, StringArray{}, a)
	})

	t.Run("empty string", func(t *testing.T) {
		var a StringArray
		err := a.Scan("")
		require.NoError(t, err)
		assert.Equal(t, StringArray{}, a)
	})

	t.Run("byte slice", func(t *testing.T) {
		var a StringArray
		err := a.Scan([]byte(`{"a","b"}`))
		require.NoError(t, err)
		assert.Equal(t, StringArray{"a", "b"}, a)
	})

	t.Run("invalid format - no braces", func(t *testing.T) {
		var a StringArray
		err := a.Scan("hello,world")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid PostgreSQL array format")
	})

	t.Run("unsupported type", func(t *testing.T) {
		var a StringArray
		err := a.Scan(12345)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unsupported type")
	})

	t.Run("escaped quotes inside element", func(t *testing.T) {
		var a StringArray
		err := a.Scan(`{"say \"hello\""}`)
		require.NoError(t, err)
		assert.Equal(t, StringArray{`say "hello"`}, a)
	})
}

func TestStringArray_RoundTrip(t *testing.T) {
	tests := []struct {
		name  string
		input StringArray
	}{
		{"simple", StringArray{"a", "b", "c"}},
		{"single", StringArray{"hello"}},
		{"empty", StringArray{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			val, err := tt.input.Value()
			require.NoError(t, err)

			var restored StringArray
			err = restored.Scan(val)
			require.NoError(t, err)

			assert.Equal(t, tt.input, restored)
		})
	}
}

func TestStringArray_ValueReturnsDriverValue(t *testing.T) {
	a := StringArray{"test"}
	var _ driver.Value
	val, err := a.Value()
	require.NoError(t, err)
	_, ok := val.(string)
	assert.True(t, ok, "Value() should return a string which implements driver.Value")
}
