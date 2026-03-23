# Plan: Unit Tests for Go Backend

## Context

The Tripcompass Go backend (Gin + GORM + PostgreSQL) has zero test coverage. The user wants unit tests for core business logic: **services, middleware, models/types, and WebSocket hub**. No handler (HTTP layer) tests.

## Test Strategy

- Use Go's built-in `testing` package — no external test framework needed
- Use `gorm.io/driver/sqlite` (in-memory) as a lightweight GORM driver for service tests (avoids needing a live PostgreSQL)
- Use `net/http/httptest` for middleware tests
- Use `testify` for assertions (`github.com/stretchr/testify`) to reduce boilerplate
- Each test file lives alongside its source: e.g., `auth.go` → `auth_test.go`

## New Dependencies

Add to `go.mod`:
- `github.com/stretchr/testify` (assertions)
- `gorm.io/driver/sqlite` (in-memory DB for service tests)

## Test Files to Create (7 files)

### 1. `internal/models/types_test.go`
Test pure functions — no dependencies:
- **DateOnly**: MarshalJSON (normal + zero value), UnmarshalJSON (valid + invalid format + empty + null), Value (normal + zero), Scan (time.Time + string + nil + unsupported type)
- **StringArray**: Value (empty + single + multiple + escaped chars), Scan (valid PG array + empty `{}` + nil + invalid format), round-trip (Value→Scan)

### 2. `internal/services/auth_test.go`
Use in-memory SQLite with GORM. Auto-migrate `User` table.
- **Register**: success (returns token + user, bcrypt hash valid, provider="local"); duplicate email error
- **Login**: success; wrong password error; non-existent email error; social login account (nil password_hash) error
- **generateToken**: token contains correct `sub` claim, valid HS256

### 3. `internal/services/itinerary_test.go`
Use in-memory SQLite. Auto-migrate `Itinerary`, `Activity`, `User`.
- **parseDate**: valid date; empty string; invalid format
- **setItineraryDates**: valid range; end before start; invalid format
- **Create**: success with defaults; custom values; invalid owner_id; invalid dates; end_date before start_date
- **GetMyItineraries**: returns only owner's itineraries
- **GetOne**: owner access; published access by non-owner; draft by non-owner → forbidden; not found
- **Update**: partial update; update dates; invalid status
- **Delete**: success; not found/forbidden
- **Clone**: published by non-owner; own draft; activities copied; clone_count incremented
- **Publish**: DRAFT→PUBLISHED→DRAFT toggle
- **Explore**: pagination defaults; sort options; filters

### 4. `internal/services/activity_test.go`
Use in-memory SQLite. Auto-migrate `Itinerary`, `Activity`, `User`.
- **Create**: success; invalid itinerary_id; forbidden
- **Update**: partial update; all fields; forbidden
- **Delete**: success; forbidden
- **Reorder**: success; activity not found mid-batch
- **isOwnerOfActivity**: activity/itinerary not found; wrong owner; success

### 5. `internal/middleware/jwt_test.go`
Use `httptest.NewRecorder()` + `gin.CreateTestContext()`:
- Valid token → sets `userID` in context
- Missing Authorization header → 401
- Invalid Bearer format → 401
- Expired token → 401
- Wrong secret → 401
- Non-HMAC algorithm → 401
- Missing `sub` claim → 401

### 6. `internal/ws/hub_test.go`
Test Room/Hub data structures without real WebSocket connections:
- **Room**: AddClient, RemoveClient, IsEmpty, Broadcast (excludes sender), OnlineUsers dedup
- **Hub**: GetRoom, BroadcastToRoom (non-existent room), addClient creates room, removeClient cleans empty room

### 7. `internal/services/test_helpers_test.go`
Shared test utilities:
- `setupTestDB()` — in-memory SQLite via GORM, auto-migrates all models
- `createTestUser(db)` — inserts user with bcrypt-hashed password
- `createTestItinerary(db, ownerID)` — inserts a test itinerary

## Execution Order

1. Add `testify` and `sqlite` driver to `go.mod`
2. Create `test_helpers_test.go`
3. Create `types_test.go` (verify test infra)
4. Create `auth_test.go`
5. Create `itinerary_test.go`
6. Create `activity_test.go`
7. Create `jwt_test.go`
8. Create `hub_test.go`
9. Run `go test ./...` to verify all pass

## Verification

```bash
cd backend && go test ./... -v -count=1
```
