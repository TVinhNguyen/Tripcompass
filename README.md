# TripCompass

> Nền tảng lập kế hoạch du lịch Việt Nam — kết hợp AI agent, dữ liệu địa điểm có cấu trúc và chỉnh sửa lịch trình thời gian thực.

**Production:** [tripcompass.studio](https://tripcompass.studio)

---

## 1. Bối cảnh & Định vị sản phẩm

Du lịch là một trong số ít ngành có nhu cầu **không suy giảm theo chu kỳ tháng/năm**: lễ Tết, hè, mùa thấp điểm đều có dòng khách riêng (nội địa, công tác, MICE, backpacker, người lớn tuổi…). Theo Tổng cục Du lịch, lượng tìm kiếm về điểm đến Việt Nam tăng đều ~30%/năm sau 2023, và tỉ lệ người tự lên lịch trình (so với mua tour trọn gói) tăng nhanh hơn — phù hợp đúng pain-point mà TripCompass nhắm:

- **Người Việt đi Việt Nam** vẫn phải gom thông tin từ Google Maps, group Facebook, TikTok và Excel cá nhân.
- **Người nước ngoài** thiếu nguồn dữ liệu tiếng Anh đáng tin cho điểm đến nhỏ (Hà Giang, Ninh Bình, Tây Nguyên…).
- **Cộng tác nhóm** trên file Excel / Notion rời rạc, không có map view, không có chi phí tổng hợp.

**TripCompass giải quyết** bằng cách kết hợp 3 lớp:

1. **Lớp dữ liệu có cấu trúc** — điểm đến, hoạt động, combo, đánh giá người dùng.
2. **Lớp AI agent** — chuyển 1 câu chat thành lịch trình theo ngày, có giá, có map.
3. **Lớp chỉnh sửa cộng tác** — kéo thả, mời người khác, đồng bộ real-time qua WebSocket.

---

## 2. Tech stack

| Tầng | Công nghệ | Vì sao chọn |
|------|-----------|-------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind, Radix UI / shadcn, framer-motion, @dnd-kit | App Router + RSC, ecosystem component mature, drag-and-drop chuyên dụng |
| **Backend** | Go 1.25 (Gin), GORM + gormigrate, JWT (HttpOnly cookie), gorilla/websocket | Concurrency cho WS rẻ, build binary nhỏ, deploy đơn giản |
| **AI service** | Python 3.11, FastAPI, LangGraph, LangChain, multi-provider LLM (Anthropic, Google, OpenRouter, NVIDIA, Nebius, Modal, Xiaomi, AgentRouter, Ollama local) | LangGraph cho state machine có kiểm soát; multi-provider để fallback chi phí/độ trễ |
| **External data tools** | SerpAPI (hotels, flights), Tavily (web search fallback), WeatherAPI | Bổ sung dữ liệu real-time khi DB chưa có |
| **Database** | PostgreSQL 16 (schema `schema_travel`) | Geographical query, JSONB cho activity payload, mature backup tooling |
| **Cache / Pub-sub** | Redis 7 (LRU 128MB) | View counter, session, WS fanout, LLM response cache |
| **Reverse proxy / TLS** | Caddy 2 (auto Let's Encrypt + HTTP/3) | Cấu hình ngắn, 0-config HTTPS |
| **Backups** | `prodrigestivill/postgres-backup-local` | Daily dump giữ 7d / 4w / 6m |
| **CI/CD** | GitHub Actions, Docker Buildx + GHA cache, Docker Hub registry, SSH deploy | Native, không phụ thuộc dịch vụ ngoài |
| **Quan sát** | LangSmith (LLM trace), JSON logs với rotation | Trace tool-calls, debug agent |

---

## 3. Kiến trúc tổng thể

```
                      ┌─────────────────────────────┐
                      │  Caddy (TLS + HTTP/3)       │
                      │  tripcompass.studio         │
                      └───────────┬─────────────────┘
                                  │
              ┌───────────────────┼──────────────────────────┐
              │                   │                          │
       ┌──────▼──────┐     ┌──────▼──────┐           ┌───────▼──────┐
       │  Frontend   │     │   Backend   │   HTTP    │  Planner-AI  │
       │  Next.js 16 │◄───►│  Go / Gin   │──────────►│  FastAPI +   │
       │  (SSR+SPA)  │ WS  │  REST + WS  │           │  LangGraph   │
       └─────────────┘     └──────┬──────┘           └──────┬───────┘
                                  │                         │
                          ┌───────▼────────┐         ┌──────▼──────┐
                          │  PostgreSQL 16 │         │  External   │
                          │  schema_travel │         │  SerpAPI,   │
                          └────────────────┘         │  Tavily,    │
                          ┌────────────────┐         │  Weather,   │
                          │  Redis 7       │         │  LLM (n)    │
                          └────────────────┘         └─────────────┘
```

- `internal` network: postgres + redis + planner-ai + backend (không expose ra ngoài).
- `public` network: backend + frontend + caddy.
- Planner-AI **không** accessible trực tiếp từ internet — chỉ backend gọi nội bộ qua `http://planner-ai:8090`.

---

## 4. Cấu trúc repository

```
tripcompass/
├── backend/                 # Go service (Gin)
│   └── internal/
│       ├── handlers/        # HTTP + WS handlers (activity, auth, ai_chat, admin_*, …)
│       ├── services/        # Business logic
│       ├── middleware/      # JWT, CORS, role gates, rate-limit
│       ├── ws/              # WebSocket hub + outbox publisher
│       ├── session/         # Auth resolver (cookie/token → session)
│       ├── planner/         # Bridge to planner-ai
│       └── viewcounter/     # Redis-backed view counter
├── frontend/                # Next.js 16 (App Router, TS)
│   └── app/
│       ├── planner/         # Quick planner + AI chat
│       ├── ai-planner/      # AI-first chat UX
│       ├── itinerary/[id]/  # View + edit (drag-and-drop, WS sync)
│       ├── explore/         # Trending destinations
│       ├── admin/           # CRUD + analytics (gated by ADMIN_EMAILS)
│       ├── help/            # User guide (5 articles)
│       └── auth/            # Login, register, reset-password
├── planner-ai/              # Python FastAPI + LangGraph
│   └── app/
│       ├── nodes/           # Plan, schedule, enrich, validate
│       ├── tools/           # SerpAPI, Tavily, weather, DB read
│       ├── routes/          # /chat/stream, /generate, /health
│       └── streaming/       # SSE event stream
├── caddy/Caddyfile          # TLS + routing rules
├── database/schema.sql      # Bootstrap DDL (loaded on first start)
├── scripts/                 # deploy.sh, export-db.sh, restore-db.sh
├── docker-compose.yml       # Local dev (build from source)
├── docker-compose.prod.yml  # Production (pull from Docker Hub)
└── .github/workflows/       # ci.yml, cd.yml
```

---

## 5. Tính năng chính & Luồng hoạt động

### 5.1 AI Planner — biến 1 câu chat thành lịch trình

**Endpoint:**
- Frontend → Backend: `POST /api/v1/ai-chat/stream` (SSE)
- Backend → Planner-AI nội bộ: `POST /chat/stream` (SSE)

```
User chat ──► Backend (auth + rate-limit 30/60s)
            ──► Planner-AI /chat/stream
                  ├── intent extraction (LLM)
                  ├── DB tool: query places/combos by destination
                  ├── SerpAPI tool: real-time hotels (optional)
                  ├── Tavily tool: web search fallback nếu DB rỗng
                  ├── Weather tool: forecast cho ngày đi
                  ├── Schedule node: dàn hoạt động theo ngày + giờ
                  └── Enrich node: thêm mô tả, hình, ước tính chi phí
            ──► SSE event stream về browser
                  ├── tool_start / tool_end events
                  ├── partial plan deltas
                  └── final ChatTurn event với plan đầy đủ
```

Đặc điểm:
- **Multi-provider LLM** với fallback và cost-aware routing.
- **Tool calls có timeout** (default 5s/tool, 8 rounds max) — agent không treo.
- **Privacy guard** trong system prompt: agent không leak tên tool/model.
- **LangSmith trace** bật được qua env để debug.
- **History API**: `GET /api/v1/ai-chat/sessions`, `/sessions/:id/history`, `DELETE /sessions/:id`.

### 5.2 Itinerary Editor — kéo thả + cộng tác real-time

**Path:** `/itinerary/[id]/edit`

- **Drag-and-drop** giữa các ngày (@dnd-kit), reorder trong ngày, cross-day move.
- **Optimistic updates** với rollback nếu API fail.
- **WebSocket sync** qua `wss://.../api/v1/ws` — mọi thay đổi broadcast cho collaborator khác trong <500ms.
- **Outbox pattern** ở backend: mutation → DB transaction → outbox row → publisher dispatch với ACK. Nếu WS publish fail, row vẫn pending để retry — không mất event.
- **Presence**: hiển thị avatar người đang online trong cùng itinerary.
- **Map view** đồng bộ với danh sách activity (Leaflet markers numbered theo time-of-day).
- **Mẫu hoạt động** (template pool) — kéo thả nhanh ăn sáng / di chuyển / tham quan.
- **Tour onboarding** — spotlight engine custom (~500 LOC, no external lib), hiển thị 1 lần cho user mới.

### 5.3 Auth & Roles

- **Cookie HttpOnly + SameSite=Lax**, JWT 72h default, refresh qua `/auth/me`.
- **Login**: email/password, Google OAuth (id_token), Facebook OAuth (access_token).
- **Reset password**: token signed, email qua Resend.
- **Roles**: `USER`, `ADMIN` (qua `ADMIN_EMAILS` env), `EDITOR`/`VIEWER` cho collaborator của itinerary.
- **Suspended user** bị từ chối ở session resolver — không bypass được qua social login.

### 5.4 Admin

- `/admin/stats` — DAU/WAU/MAU, top destinations, conversion funnel.
- `/admin/activity` — recent itineraries, AI chat sessions.
- `/admin/users` — CRUD, suspend, role change.
- Gated bằng email allow-list (không phải DB flag — đơn giản, audit trên file env).

### 5.5 Discovery & Community

- `/explore` — trending destinations (sort by `view_count` DESC, Redis-backed counter).
- `/saved` — bookmark cá nhân.
- `/combos` — combo do team đề xuất.
- `/itinerary/[id]` public view — share link không cần đăng nhập.

---

## 6. CI/CD & Deploy

### 6.1 CI — `.github/workflows/ci.yml`

Trigger: push lên `main`, `dev`, `feat/**`; PR vào `main`/`dev`.

```
┌─ paths-filter (chỉ chạy job liên quan) ─┐
│                                         │
├─ backend ──► go vet + go build + go test -race với Postgres service
├─ frontend ─► pnpm install + pnpm build (Next.js)
└─ docker ───► buildx cho cả 3 service (cache GHA), không push
```

- **Concurrency group** theo ref — push mới hủy build cũ.
- **Coverage upload** từ Go test cho artifact.

### 6.2 CD — `.github/workflows/cd.yml`

Trigger: push lên `main`.

```
[build-push]
  matrix: backend, frontend, planner-ai
  - docker buildx build với cache GHA scope theo service
  - tag: latest + sha-<commit7>
  - push lên Docker Hub

[deploy]  (cần GitHub environment "production" approve nếu bật)
  - SSH vào server qua appleboy/ssh-action
  - scp upload: docker-compose.prod.yml, deploy.sh, schema.sql, Caddyfile
  - chạy scripts/deploy.sh với IMAGE_TAG=sha-<commit7>
```

### 6.3 deploy.sh — luồng trên server

```
1. Validate docker-compose.prod.yml + Caddyfile (Caddy validate trong container tạm)
2. docker compose pull (kéo image đã pin theo SHA)
3. docker compose up -d --remove-orphans
4. Poll healthcheck: postgres, redis, planner-ai, backend, frontend
   - Timeout 180s, fail → dump logs 80 dòng + exit 1
5. docker image prune dangling >48h
```

Image tag được **pin theo commit SHA** nên rollback chỉ cần đổi `IMAGE_TAG` trong `.env.prod` rồi chạy lại `deploy.sh`. Không có nguy cơ deploy nhầm `latest` đã bị overwrite.

### 6.4 Network topology production

- Caddy mở port 80/443 ra internet.
- Backend ở 2 network: `public` (Caddy reach) + `internal` (DB/Redis/Planner reach).
- Planner-AI **chỉ** ở `internal` — không có route public, không expose port.

---

## 7. Local development

```bash
# 1. Clone & chuẩn bị env cho từng service
git clone https://github.com/<owner>/tripcompass.git
cd tripcompass
cp backend/.env.example     backend/.env
cp planner-ai/.env.example  planner-ai/.env
# Điền JWT_SECRET, LLM key, Google OAuth... trong từng file

# 2. Boot stack (dev compose — build from source, hot-reload)
docker compose -f docker-compose.yml up --build

# 3. Truy cập
#    Frontend  http://localhost:3000
#    Backend   http://localhost:8080
#    Postgres  localhost:5432
#    Planner-AI chỉ ở mạng internal của compose, KHÔNG map port host.
#    Backend gọi nội bộ qua http://planner-ai:8090.
#    Cần debug planner trực tiếp? Uncomment block "ports: 8090:8090"
#    trong docker-compose.yml service planner-ai.
```

**Convention**: planner-ai / backend tests luôn chạy qua `docker exec` trong compose stack — KHÔNG `pip install` / `go install` vào môi trường local.

```bash
# Backend
docker exec -it tripcompass-backend-1 go test ./...

# Planner-AI
docker exec -it tripcompass-planner-ai-1 pytest

# Frontend
cd frontend && pnpm install && pnpm dev   # frontend chạy native cho HMR tốt
```

---

## 8. Bảo mật

- **JWT trong HttpOnly cookie** — JS không đọc được token. Cookie `SameSite=Lax`, `Secure` ở production.
- **CORS** chỉ allow origin trong `ALLOWED_ORIGINS`.
- **WS auth** — primary qua HttpOnly cookie. Fallback cho client không gửi cookie: header `Sec-WebSocket-Protocol: bearer, <jwt>` (2 giá trị phân tách bằng dấu phẩy theo spec). Query param `?token=` còn được giữ làm legacy với warn log.
- **Rate limit** ở backend cho `/auth/*` và `/ai-chat/stream` (Redis-backed, 30 req / 60s cho chat).
- **Secrets** không bao giờ commit — chỉ `.env.prod.example`, `backend/.env.example`, `planner-ai/.env.example` được track.
- **Backup** PG daily, kéo về local định kỳ qua `scripts/upload-backup.sh`.
- **Admin gate** bằng email allow-list — audit qua file env, không có "elevation" trong DB.

---

## 9. Mục tiêu tiếp theo (Roadmap)

### Lớp 1 — Trải nghiệm
- Mobile-first redesign itinerary editor — bottom-sheet thay drawer.
- Offline mode với service worker — xem lịch trình đã lưu khi mất mạng.
- Voice input cho AI chat (Web Speech API).
- Multi-language: tiếng Anh hoàn chỉnh, sau đó tiếng Nhật / Hàn cho khách inbound.

### Lớp 2 — Dữ liệu
- Crawler service hoá (`scraper-service/`) — chuẩn hoá ingest từ TripAdvisor, Booking, Klook.
- `is_template` column trong DB để cộng đồng đóng góp template hoạt động.
- Geospatial query với PostGIS — tìm activity trong bán kính X.
- Vector search (pgvector) cho semantic match điểm đến.

### Lớp 3 — Kinh doanh
- Booking affiliate — link sâu vào Agoda, Booking, 12go.
- Premium tier — không giới hạn AI chat, export PDF, white-label cho agency.
- B2B API cho travel blogger / agency embed itinerary.

### Lớp 4 — AI Agent (luôn ưu tiên)
- Self-correcting agent: validate plan rồi tự rewrite nếu thiếu (đã có schedule node, mở rộng).
- Memory per user: nhớ sở thích chuyến trước.
- Agent-to-agent: planner gọi "weather-checker", "budget-optimizer" như tool song song.
- Open-source LLM fine-tune trên data Việt Nam — giảm chi phí + ngữ cảnh tốt hơn.
