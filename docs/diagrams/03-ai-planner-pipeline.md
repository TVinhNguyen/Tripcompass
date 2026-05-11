# 3. Sơ đồ Luồng AI Planner Pipeline

## 3.1 Tổng quan 2 chế độ hoạt động của AI Planner

```mermaid
flowchart TB
    USER["👤 Người dùng"]

    USER -->|"Chế độ A:<br/>Quick Form"| MODE_A
    USER -->|"Chế độ B:<br/>Chat đa lượt"| MODE_B

    subgraph MODE_A["🚀 Chế độ A — Quick Plan (One-shot)"]
        direction LR
        FORM["Điền form:<br/>Điểm đến, Ngày, Ngân sách,<br/>Số người, Tags"]
        FORM --> API_GEN["POST /api/v1/planner/generate"]
        API_GEN --> PROXY{"USE_LLM_PLANNER?"}
        PROXY -->|"true"| LLM_PLAN["POST /plan<br/>(Planner AI)"]
        PROXY -->|"false"| GO_ENGINE["Go Engine<br/>(planner.Engine)"]
        LLM_PLAN --> RESULT_A["Plan JSON"]
        GO_ENGINE --> RESULT_A
    end

    subgraph MODE_B["💬 Chế độ B — Chat AI (Multi-turn SSE)"]
        direction LR
        CHAT_INPUT["Nhập câu hỏi<br/>tự nhiên"]
        CHAT_INPUT --> SSE["POST /chat/stream<br/>(SSE)"]
        SSE --> REACT["ReAct Agent<br/>(LangGraph)"]
        REACT -->|"Tự gọi tools"| TOOLS["8 AI Tools"]
        REACT --> RESULT_B["Streaming Response<br/>+ Plan JSON"]
    end

    RESULT_A --> PREVIEW["📋 PlanPreviewCard"]
    RESULT_B --> PREVIEW
    PREVIEW -->|"Lưu thành<br/>lịch trình"| SAVE["POST /itineraries<br/>+ N × POST /activities"]
    SAVE --> EDIT["📝 /itinerary/:id/edit"]

    style MODE_A fill:#e3f2fd,stroke:#1565C0,color:#000
    style MODE_B fill:#f3e5f5,stroke:#6A1B9A,color:#000
    style PREVIEW fill:#e8f5e9,stroke:#2E7D32,color:#000
```

## 3.2 Pipeline chi tiết — 5 Giai đoạn (create_travel_plan)

```mermaid
flowchart TB
    INPUT["📥 Input<br/>destination, num_days,<br/>budget_vnd, guest_count"]

    subgraph STAGE1["Giai đoạn 1: RESOLVE 🔍"]
        direction LR
        R1["Alias Map<br/>(43 entries)"]
        R2["DB Exact Match"]
        R3["DB ILIKE Partial"]
        R4["Unresolved ❌"]
        R1 -->|"miss"| R2 -->|"miss"| R3 -->|"miss"| R4
    end

    subgraph GATHER["Thu thập dữ liệu (Song song) 📊"]
        direction LR
        G1["🏝️ get_places<br/>→ 15 attractions"]
        G2["🍜 get_food_venues<br/>→ 12 restaurants"]
        G3["☀️ get_weather<br/>→ climate data"]
        G4["🏨 search_hotels<br/>→ 3 hotels"]
    end

    subgraph STAGE2["Giai đoạn 2: BUDGET 💰"]
        direction TB
        B1["Phân loại tier:<br/>survival / budget /<br/>standard / premium"]
        B2["Phân bổ ngân sách:<br/>• Tham quan: X VND<br/>• Ăn uống: Y VND<br/>• Khách sạn: Z VND/đêm"]
        B1 --> B2
    end

    subgraph STAGE3["Giai đoạn 3: SCHEDULE 📅"]
        direction TB
        S1["🤖 LLM sinh lịch trình<br/>ngày-by-ngày với time slots"]
        S2["JSON Output:<br/>days → slots → place_id,<br/>start, end, price"]
        S1 --> S2
    end

    subgraph STAGE4["Giai đoạn 4: VALIDATE ✅"]
        direction TB
        V1["Kiểm tra HALLUCINATED_PLACE<br/>(place_id không tồn tại)"]
        V2["Kiểm tra CLOSED_HOURS<br/>(ngoài giờ mở cửa)"]
        V3["Kiểm tra DUPLICATE_PLACE"]
        V4["Kiểm tra TIME_OVERLAP"]
        V5["Kiểm tra OVER_BUDGET"]
        V1 --> V2 --> V3 --> V4 --> V5
    end

    subgraph STAGE5["Giai đoạn 5: ENRICH ✨"]
        direction TB
        E1["🤖 LLM thêm mô tả"]
        E2["Thêm tips du lịch"]
        E3["Guard: bảo vệ<br/>price, time, place_id<br/>không bị LLM thay đổi"]
        E1 --> E2 --> E3
    end

    OUTPUT["📤 Final Plan JSON<br/>days, budget_recap,<br/>violations, warnings"]

    INPUT --> STAGE1
    STAGE1 --> GATHER
    GATHER --> STAGE2
    STAGE2 --> STAGE3
    STAGE3 --> STAGE4

    STAGE4 -->|"❌ Có violations<br/>(max retry 2)"| STAGE3
    STAGE4 -->|"✅ Pass hoặc<br/>hết retry"| STAGE5

    STAGE5 --> OUTPUT

    style STAGE1 fill:#e3f2fd,stroke:#1565C0,color:#000
    style GATHER fill:#fff3e0,stroke:#E65100,color:#000
    style STAGE2 fill:#e8f5e9,stroke:#2E7D32,color:#000
    style STAGE3 fill:#f3e5f5,stroke:#6A1B9A,color:#000
    style STAGE4 fill:#fff9c4,stroke:#F57F17,color:#000
    style STAGE5 fill:#e0f7fa,stroke:#00695C,color:#000
```

## 3.3 Sequence Diagram — Plan Mode (POST /plan)

```mermaid
sequenceDiagram
    actor U as 👤 User
    participant FE as 🖥️ Frontend
    participant BE as ⚙️ Backend (Go)
    participant AI as 🤖 Planner AI
    participant N1 as 🔍 Resolve
    participant N2 as 💰 Budget
    participant N3 as 📅 Schedule
    participant N4 as ✅ Validate
    participant N5 as ✨ Enrich
    participant DB as 💾 PostgreSQL
    participant LLM as 🧠 LLM
    participant CACHE as 📦 Redis Cache

    U->>FE: Điền form (destination, days, budget)
    FE->>BE: POST /api/v1/planner/generate
    BE->>AI: POST /plan (proxy)

    AI->>CACHE: Check cache key
    CACHE-->>AI: ❌ Cache MISS

    AI->>N1: resolve("da nang")
    N1->>DB: Alias lookup + DB match
    DB-->>N1: "đà nẵng" (confidence=1.0)
    N1-->>AI: destination_id resolved

    par Thu thập song song
        AI->>DB: get_places(đà nẵng)
        DB-->>AI: 15 attractions
    and
        AI->>DB: get_food_venues(đà nẵng)
        DB-->>AI: 12 restaurants
    and
        AI->>DB: get_weather(đà nẵng, tháng 5)
        DB-->>AI: 30°C, mưa ít
    end

    AI->>N2: budget_classify(5,000,000 VND, 3 days, 2 guests)
    N2-->>AI: tier=standard, attr=2.25M, food=2.0M

    loop Retry (max 2 lần)
        AI->>N3: schedule_draft(places, food, budget)
        N3->>LLM: Generate day-by-day schedule
        LLM-->>N3: {days: [{slots: [...]}]}
        N3-->>AI: Draft schedule

        AI->>N4: validate(draft)
        alt Có violations
            N4-->>AI: violations: [CLOSED_HOURS]
            Note over AI,N4: Retry với feedback
        else Pass
            N4-->>AI: validation_passed ✅
        end
    end

    AI->>N5: enrich(validated_schedule)
    N5->>LLM: Thêm mô tả + tips
    LLM-->>N5: Enriched content
    N5-->>AI: Final plan

    AI->>CACHE: Cache result (TTL 1h)
    AI-->>BE: PlanResponse JSON
    BE-->>FE: {data: GenerateResponse}

    FE->>U: Hiển thị PlanPreviewCard

    opt Lưu lịch trình
        U->>FE: Bấm "Lưu lịch trình"
        FE->>BE: POST /itineraries
        BE-->>FE: 201 {id}
        loop Mỗi activity
            FE->>BE: POST /activities
        end
        FE->>U: Redirect /itinerary/:id/edit
    end
```

## 3.4 Bảng LLM vs Pure Code trong Pipeline

```mermaid
pie title "Tỷ lệ LLM vs Pure Code trong Pipeline"
    "Pure Code (Resolve)" : 1
    "Pure Code (Budget)" : 1
    "LLM (Schedule)" : 1
    "Pure Code (Validate)" : 1
    "LLM (Enrich)" : 1
```

| Giai đoạn | LLM? | Lý do |
|-----------|------|-------|
| 1. Resolve | ❌ Pure Code | Alias map + DB lookup — deterministic |
| 2. Budget | ❌ Pure Python | "LLM hallucinate numbers" — dùng math thuần |
| 3. Schedule | ✅ LLM | Cần creativity để sắp xếp lịch trình hợp lý |
| 4. Validate | ❌ Pure Rules | Bắt lỗi LLM bằng rule cứng, deterministic |
| 5. Enrich | ✅ LLM (guarded) | Thêm mô tả tự nhiên, nhưng guard bảo vệ data quan trọng |
