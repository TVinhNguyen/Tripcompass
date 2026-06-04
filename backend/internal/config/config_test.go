package config

import "testing"

// TestWeakSecret pins the F2 default-secret guard: the app must refuse to start
// with any known placeholder secret, including long templated values that would
// otherwise slip past the length check (e.g. CHANGE_ME_USE_openssl_rand...).
func TestWeakSecret(t *testing.T) {
	cases := []struct {
		name string
		in   string
		weak bool
	}{
		{"dev template", "dev-secret-change-in-production", true},
		{"change-me", "change-me", true},
		{"changeme", "changeme", true},
		{"prod placeholder long", "CHANGE_ME_USE_openssl_rand_base64_64", true},
		{"change_me embedded", "prefix-change_me-suffix", true},
		{"common word", "password", true},
		{"trimmed + cased", "  ChAnGe-Me  ", true},
		{"real random secret", "k7Qz3vR9pX2mY8wL5nB4tD6sF1hJ0aGcE7uViO", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := weakSecret(tc.in); got != tc.weak {
				t.Errorf("weakSecret(%q) = %v, want %v", tc.in, got, tc.weak)
			}
		})
	}
}
