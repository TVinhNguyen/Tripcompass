package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// ─── DateOnly ─────────────────────────────────────────────────────────────────
// Wrap time.Time để serialize JSON dưới dạng "YYYY-MM-DD" thay vì RFC3339.

type DateOnly struct{ time.Time }

const dateOnlyLayout = "2006-01-02"

// MarshalJSON → "2006-01-02"
func (d DateOnly) MarshalJSON() ([]byte, error) {
	if d.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(d.Format(dateOnlyLayout))
}

// UnmarshalJSON ← "2006-01-02"
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
		return fmt.Errorf("DateOnly: format phải là YYYY-MM-DD, nhận được %q", s)
	}
	d.Time = t
	return nil
}

// Value() → lưu vào PostgreSQL
func (d DateOnly) Value() (driver.Value, error) {
	if d.IsZero() {
		return nil, nil
	}
	return d.Format(dateOnlyLayout), nil
}

// Scan() ← đọc từ PostgreSQL
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

// StringArray là custom type để lưu []string vào PostgreSQL text[]
// GORM sẽ gọi Value() khi INSERT/UPDATE, Scan() khi SELECT
type StringArray []string

// Value() trả về chuỗi theo định dạng PostgreSQL array: {"a","b","c"}
func (a StringArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "{}", nil
	}
	parts := make([]string, len(a))
	for i, s := range a {
		s = strings.ReplaceAll(s, `\`, `\\`)
		s = strings.ReplaceAll(s, `"`, `\"`)
		parts[i] = `"` + s + `"`
	}
	return "{" + strings.Join(parts, ",") + "}", nil
}

// Scan() đọc dữ liệu từ PostgreSQL
func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = StringArray{}
		return nil
	}

	var str string
	switch v := value.(type) {
	case string:
		str = v
	case []byte:
		str = string(v)
	default:
		return fmt.Errorf("StringArray.Scan: unsupported type %T", value)
	}

	str = strings.TrimSpace(str)
	if str == "{}" || str == "" {
		*a = StringArray{}
		return nil
	}
	if !strings.HasPrefix(str, "{") || !strings.HasSuffix(str, "}") {
		return fmt.Errorf("StringArray.Scan: invalid PostgreSQL array format: %s", str)
	}

	// Bỏ dấu ngoặc nhọn
	inner := str[1 : len(str)-1]
	*a = parseElements(inner)
	return nil
}

func parseElements(s string) StringArray {
	if s == "" {
		return StringArray{}
	}
	var result []string
	var cur strings.Builder
	inQuotes := false
	escaped := false

	for _, c := range s {
		if escaped {
			cur.WriteRune(c)
			escaped = false
			continue
		}
		switch c {
		case '\\':
			escaped = true
		case '"':
			inQuotes = !inQuotes
		case ',':
			if !inQuotes {
				result = append(result, cur.String())
				cur.Reset()
			} else {
				cur.WriteRune(c)
			}
		default:
			cur.WriteRune(c)
		}
	}
	if cur.Len() > 0 {
		result = append(result, cur.String())
	}
	return StringArray(result)
}
