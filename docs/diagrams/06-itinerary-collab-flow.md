# 6. Sơ đồ Luồng CRUD & Realtime Itinerary

## 6.1 Vòng đời Itinerary — State Diagram

```mermaid
stateDiagram-v2
    [*] --> DRAFT : POST /itineraries<br/>(tự nhập / từ AI plan / clone)

    DRAFT --> DRAFT : PATCH /itineraries/:id<br/>POST /activities<br/>PATCH /activities/:id<br/>PATCH /activities/reorder<br/>DELETE /activities/:id

    DRAFT --> PUBLISHED : PATCH /itineraries/:id/publish<br/>(yêu cầu ≥1 activity)

    PUBLISHED --> PUBLISHED : GET /itineraries/:id/public<br/>(view_count++)

    PUBLISHED --> CLONED : POST /itineraries/:id/clone<br/>(user khác clone)

    CLONED --> DRAFT : Bản clone mới<br/>của user khác

    DRAFT --> [*] : DELETE /itineraries/:id
    PUBLISHED --> [*] : DELETE /itineraries/:id
```

## 6.2 Ba đường vào tạo Itinerary

```mermaid
flowchart TB
    subgraph PathA["📝 Đường 1: Tự nhập"]
        A1["Trang /itinerary/new"]
        A2["Wizard 2 bước:<br/>1. Title, Destination, Dates<br/>2. Budget, Guests, Tags"]
        A3["POST /itineraries"]
        A1 --> A2 --> A3
    end

    subgraph PathB["🤖 Đường 2: Từ AI Plan"]
        B1["Trang /ai-planner"]
        B2["Chat hoặc Quick Form"]
        B3["PlanPreviewCard"]
        B4["POST /itineraries<br/>+ N × POST /activities"]
        B1 --> B2 --> B3 --> B4
    end

    subgraph PathC["📋 Đường 3: Clone"]
        C1["Trang /explore hoặc<br/>/itinerary/:id/public"]
        C2["Nút 'Lưu vào tài khoản'"]
        C3["POST /itineraries/:id/clone"]
        C1 --> C2 --> C3
    end

    A3 --> RESULT["📋 Itinerary mới<br/>(status: DRAFT)"]
    B4 --> RESULT
    C3 --> RESULT

    RESULT --> EDIT["/itinerary/:id/edit"]

    style PathA fill:#e3f2fd,stroke:#1565C0,color:#000
    style PathB fill:#f3e5f5,stroke:#6A1B9A,color:#000
    style PathC fill:#e8f5e9,stroke:#2E7D32,color:#000
```

## 6.3 Sequence Diagram — WebSocket Realtime Collaboration

```mermaid
sequenceDiagram
    actor User_A as 👤 User A (Owner)
    actor User_B as 👩 User B (Editor)
    participant FE_A as 🖥️ Frontend A
    participant FE_B as 🖥️ Frontend B
    participant BE as ⚙️ Backend
    participant HUB as 📡 WS Hub
    participant REDIS as 🔴 Redis PubSub
    participant DB as 💾 PostgreSQL

    Note over User_A,DB: === Kết nối WebSocket ===

    FE_A->>HUB: WS /ws/itinerary/:id?token=jwt_a
    HUB->>HUB: Verify JWT + check owner/collaborator
    HUB->>REDIS: Subscribe room(itinerary_id)
    HUB-->>FE_A: Connected ✅

    FE_B->>HUB: WS /ws/itinerary/:id?token=jwt_b
    HUB->>HUB: Verify JWT + check collaborator(ACCEPTED)
    HUB->>REDIS: Subscribe room(itinerary_id)
    HUB-->>FE_B: Connected ✅

    HUB->>FE_A: {type: "presence.join",<br/>payload: {user_id: B, full_name: "Mai"}}
    FE_A->>FE_A: Hiện avatar Mai 🟢

    Note over User_A,DB: === User A thêm activity ===

    User_A->>FE_A: Thêm activity mới
    FE_A->>FE_A: Optimistic update UI

    FE_A->>BE: POST /activities<br/>{itinerary_id, place_id, ...}
    BE->>DB: INSERT activity
    DB-->>BE: 201 {activity}
    BE-->>FE_A: 201 {activity}

    FE_A->>HUB: {type: "activity.created",<br/>payload: {activity}}
    HUB->>REDIS: Publish to room
    REDIS->>HUB: Broadcast (trừ sender)
    HUB->>FE_B: {type: "activity.created",<br/>payload: {activity}}
    FE_B->>FE_B: Thêm activity vào state

    Note over User_A,DB: === User B kéo-thả reorder ===

    User_B->>FE_B: Drag & drop activity
    FE_B->>FE_B: Optimistic reorder UI

    FE_B->>BE: PATCH /activities/reorder<br/>{items: [{id, day_number, order_index}]}
    BE->>DB: UPDATE order trong transaction
    DB-->>BE: OK
    BE-->>FE_B: 200

    FE_B->>HUB: {type: "activity.reordered",<br/>payload: {items: [...]}}
    HUB->>FE_A: Broadcast reorder
    FE_A->>FE_A: Re-sort activities

    Note over User_A,DB: === Mất kết nối & Recovery ===

    FE_B->>FE_B: ❌ WS disconnected
    FE_B->>FE_B: Hiện banner<br/>"Mất kết nối, đang thử lại..."

    FE_B->>HUB: Reconnect (backoff 1s, 2s, 4s...)
    HUB-->>FE_B: Reconnected ✅
    FE_B->>BE: GET /itineraries/:id<br/>(re-fetch đồng bộ state)
    BE-->>FE_B: Latest itinerary + activities
```

## 6.4 Activity Drag & Drop Flow

```mermaid
flowchart TB
    START["🖱️ User bắt đầu drag<br/>activity"]

    DRAG["Kéo activity"]

    DROP{"Thả vào<br/>đâu?"}

    SAME_DAY["Cùng ngày<br/>→ Đổi order_index"]
    DIFF_DAY["Sang ngày khác<br/>→ Đổi day_number<br/>+ order_index"]

    OPTIMISTIC["⚡ Optimistic Update<br/>UI cập nhật ngay"]

    API_CALL["📡 PATCH /activities/reorder<br/>{items: affected activities}"]

    RESULT{"API<br/>thành công?"}

    WS_BROADCAST["📡 Broadcast WS<br/>activity.reordered<br/>(thông báo peers)"]

    ROLLBACK["⏪ Rollback state<br/>+ Toast lỗi"]

    PEER_UPDATE["👥 Peers nhận event<br/>→ Re-sort state"]

    START --> DRAG --> DROP
    DROP --> SAME_DAY
    DROP --> DIFF_DAY

    SAME_DAY --> OPTIMISTIC
    DIFF_DAY --> OPTIMISTIC

    OPTIMISTIC --> API_CALL
    API_CALL --> RESULT

    RESULT -->|"✅ 200"| WS_BROADCAST
    RESULT -->|"❌ Error"| ROLLBACK

    WS_BROADCAST --> PEER_UPDATE

    style OPTIMISTIC fill:#e8f5e9,stroke:#2E7D32,color:#000
    style ROLLBACK fill:#ffcdd2,stroke:#B71C1C,color:#000
    style WS_BROADCAST fill:#e3f2fd,stroke:#1565C0,color:#000
```

## 6.5 WebSocket Protocol — Message Types

```mermaid
flowchart LR
    subgraph ClientToServer["Client → Server"]
        direction TB
        C1["activity.created"]
        C2["activity.updated"]
        C3["activity.deleted"]
        C4["activity.reordered"]
        C5["itinerary.updated"]
        C6["cursor (optional)"]
    end

    subgraph HubLogic["📡 WS Hub"]
        direction TB
        RECEIVE["Nhận message"]
        CHECK["Verify sender"]
        BROADCAST["Broadcast to room<br/>(trừ sender)"]
        REDIS["Redis PubSub<br/>(cross-instance sync)"]

        RECEIVE --> CHECK --> BROADCAST --> REDIS
    end

    subgraph ServerToClient["Server → Client"]
        direction TB
        S1["activity.created<br/>→ Thêm vào state"]
        S2["activity.updated<br/>→ Replace by id"]
        S3["activity.deleted<br/>→ Remove by id"]
        S4["activity.reordered<br/>→ Re-sort state"]
        S5["itinerary.updated<br/>→ Merge metadata"]
        S6["presence.join<br/>→ Thêm avatar 🟢"]
        S7["presence.leave<br/>→ Bỏ avatar"]
        S8["error<br/>→ Toast lỗi"]
    end

    ClientToServer --> HubLogic --> ServerToClient

    style ClientToServer fill:#e3f2fd,stroke:#1565C0,color:#000
    style HubLogic fill:#fff3e0,stroke:#E65100,color:#000
    style ServerToClient fill:#e8f5e9,stroke:#2E7D32,color:#000
```
