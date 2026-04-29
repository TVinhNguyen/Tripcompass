package apperror

import "errors"

// Sentinel errors cho toàn bộ service layer.
// Handlers dùng errors.Is() để map sang HTTP status code.
var (
	ErrForbidden    = errors.New("forbidden")
	ErrNotFound     = errors.New("not found")
	ErrConflict     = errors.New("conflict")
	ErrInvalidInput = errors.New("invalid input")
	ErrUnauthorized = errors.New("unauthorized")
)
