package apperror

import "errors"

// Sentinel errors cho toàn bộ service layer.
// Handlers dùng errors.Is() để map sang HTTP status code.
var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("not found")
)
