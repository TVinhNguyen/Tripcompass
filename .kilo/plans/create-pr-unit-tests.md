# Plan: Create PR for Backend Unit Tests

## Context

- **Current state**: Staged changes with 7 unit test files + go.mod update on branch `session/agent_59fd0256-7068-4c92-b671-51c249cbf45b`
- **PR feedback check**: `gh pr status` and `gh pr list --state all` both return empty — no existing PRs, no feedback to address
- **Goal**: Create branch `feat/unitest_backend`, push, and open PR into `main`

## Steps

1. **Stash staged changes** — `git stash` (keep the staged state)
2. **Create branch from main** — `git checkout main && git checkout -b feat/unitest_backend`
3. **Populate branch** — `git stash pop`
4. **Commit** with message: `test: add unit tests for Go backend services, middleware, models, and ws hub`
5. **Push** — `git push -u origin feat/unitest_backend`
6. **Create PR** — `gh pr create --title "test: add unit tests for Go backend" --body "..." --base main`
7. **Verify** — `gh pr status` to confirm PR opened

## PR Description

```
## Summary
- Add 7 unit test files (1764 lines) for Go backend core business logic
- Add testify and sqlite driver as test dependencies

## Coverage
- `internal/models/types_test.go` — DateOnly and StringArray serialization
- `internal/services/auth_test.go` — Register, Login, JWT generation
- `internal/services/itinerary_test.go` — CRUD, Clone, Publish, Explore, date parsing
- `internal/services/activity_test.go` — CRUD, Reorder, ownership checks
- `internal/middleware/jwt_test.go` — Token validation edge cases
- `internal/ws/hub_test.go` — Room/Hub management, broadcast

## How to test
```bash
cd backend && go mod tidy && go test ./... -v
```
```
