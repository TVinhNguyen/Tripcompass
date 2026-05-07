package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// ─── DateOnly ─────────────────────────────────────────────────────────────────
// Wraps time.Time to serialize JSON as "YYYY-MM-DD" instead of RFC3339.

type DateOnly struct{ time.Time }

const dateOnlyLayout = "2006-01-02"

func (d DateOnly) MarshalJSON() ([]byte, error) {
	if d.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(d.Format(dateOnlyLayout))
}

func (d *DateOnly) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	if s == "" || s == "null" {
		d.Time = time.Time{}
		return nil
	}
	t, err := time.Parse(dateOnlyLayout, s)
	if err != nil {
		return fmt.Errorf("DateOnly: expected YYYY-MM-DD, got %q", s)
	}
	d.Time = t
	return nil
}

func (d DateOnly) Value() (driver.Value, error) {
	if d.IsZero() {
		return nil, nil
	}
	return d.Format(dateOnlyLayout), nil
}

func (d *DateOnly) Scan(value interface{}) error {
	if value == nil {
		d.Time = time.Time{}
		return nil
	}
	switch v := value.(type) {
	case time.Time:
		d.Time = v
	case string:
		t, err := time.Parse(dateOnlyLayout, v)
		if err != nil {
			return err
		}
		d.Time = t
	default:
		return fmt.Errorf("DateOnly.Scan: unsupported type %T", value)
	}
	return nil
}

// ─── IntArray ─────────────────────────────────────────────────────────────────
// M4: StringArray has been removed — use github.com/lib/pq.StringArray instead.
// IntArray remains hand-rolled because lib/pq does not natively support integer[]
// without pq.GenericArray boilerplate. It is only used in PlaceSeason.OpenMonths.

type IntArray []int

func (a IntArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "{}", nil
	}
	parts := make([]string, len(a))
	for i, v := range a {
		parts[i] = fmt.Sprintf("%d", v)
	}
	return "{" + strings.Join(parts, ",") + "}", nil
}

func (a *IntArray) Scan(value interface{}) error {
	if value == nil {
		*a = IntArray{}
		return nil
	}
	var str string
	switch v := value.(type) {
	case string:
		str = v
	case []byte:
		str = string(v)
	default:
		return fmt.Errorf("IntArray.Scan: unsupported type %T", value)
	}
	str = strings.TrimSpace(str)
	if str == "{}" || str == "" {
		*a = IntArray{}
		return nil
	}
	inner := str[1 : len(str)-1]
	var result []int
	for _, part := range strings.Split(inner, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		var n int
		if _, err := fmt.Sscanf(part, "%d", &n); err == nil {
			result = append(result, n)
		}
	}
	*a = IntArray(result)
	return nil
}
