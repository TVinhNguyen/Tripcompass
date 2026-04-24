# Tài liệu tích hợp TripCompass

Tổng hợp luồng frontend ↔ backend ↔ planner-ai.

| File | Nội dung |
|---|---|
| [00-OVERVIEW.md](00-OVERVIEW.md) | Sơ đồ hệ thống, biến môi trường, quy ước chung |
| [01-API-CONTRACTS.md](01-API-CONTRACTS.md) | Đầy đủ endpoint backend + planner-ai, payload mẫu, mapping page → API |
| [02-AUTH-FLOW.md](02-AUTH-FLOW.md) | Đăng ký, verify, login, OAuth, JWT lifecycle, route protection |
| [03-AI-PLANNER-FLOW.md](03-AI-PLANNER-FLOW.md) | **Trọng điểm**: chat đa lượt, quick form, place-picker (muốn/không muốn/AI tự chọn), lưu plan thành itinerary |
| [04-ITINERARY-COLLAB-FLOW.md](04-ITINERARY-COLLAB-FLOW.md) | CRUD + drag-drop reorder + WebSocket realtime + publish/clone |
| [05-PLACES-COMBOS-FLOW.md](05-PLACES-COMBOS-FLOW.md) | Khám phá, lưu place, chi tiết, combo → itinerary |
| [06-FRONTEND-INFRA.md](06-FRONTEND-INFRA.md) | `lib/api.ts`, `useAuth`, `useItineraryWS`, `streamChat`, types, error handling |
| [TASKS-BACKEND.md](TASKS-BACKEND.md) | Phân việc cho backend dev (Go + planner-ai) — P0→P3 |
| [TASKS-FRONTEND.md](TASKS-FRONTEND.md) | Phân việc cho frontend dev (Next.js) — P0→P7 + sprint plan |
| [TASKS-PM.md](TASKS-PM.md) | Phân việc cho PM/owner (credentials, infra, legal, launch) |

## Khởi động dev

```bash
# Backend
cd backend && cp .env.example .env && go run ./cmd

# Planner AI
cd planner-ai && uvicorn app.main:app --reload --port 8001

# Frontend
cd frontend && cp .env.example .env.local && pnpm dev
```

`.env.local` mẫu xem [00-OVERVIEW.md §3](00-OVERVIEW.md#3-biến-môi-trường-frontend-envlocal).
