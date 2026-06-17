# 2. Sơ đồ ERD — Entity Relationship Diagram

## 2.1 Sơ đồ quan hệ thực thể (ERD)

Bản dễ xem hơn để trình bày là DBML cho dbdiagram.io:

- [`02-erd-logical.dbml`](./02-erd-logical.dbml): bản nên dùng cho slide, có node logic `destinations` để nối `places`, `itineraries`, `combos`, `destination_neighbors`; bỏ bảng kỹ thuật `outbox`.
- [`02-erd.dbml`](./02-erd.dbml): bản physical đúng theo database thật, nên một số bảng sẽ đứng lẻ nếu DB không có foreign key.

Cách dùng:

1. Mở dbdiagram.io.
2. Tạo diagram mới.
3. Copy nội dung `docs/diagrams/02-erd-logical.dbml` vào editor DBML nếu cần sơ đồ dễ nhìn, hoặc `02-erd.dbml` nếu cần đúng physical schema.
4. Dùng auto-layout/kéo thả để nhóm các cụm: users/auth, itinerary, places, AI chat, realtime outbox.

Mermaid dưới đây giữ lại làm bản tham chiếu trong Markdown.

```mermaid
erDiagram
    USERS {
        UUID id PK
        VARCHAR email UK
        VARCHAR password_hash
        VARCHAR full_name
        VARCHAR avatar_url
        ENUM provider "local | google | facebook"
        BOOLEAN is_verified
        VARCHAR verify_token
        TIMESTAMP verify_token_expires_at
        VARCHAR reset_token
        TIMESTAMP reset_token_expires_at
        VARCHAR role "user | editor | admin"
        VARCHAR status "active | suspended"
        TIMESTAMP created_at
    }

    ITINERARIES {
        UUID id PK
        UUID owner_id FK
        VARCHAR title
        VARCHAR destination
        NUMERIC budget
        DATE start_date
        DATE end_date
        ENUM status "DRAFT | PUBLISHED"
        TEXT cover_image_url
        REAL rating
        INTEGER view_count
        INTEGER clone_count
        UUID cloned_from_id FK
        INTEGER guest_count
        TEXT_ARRAY tags
        ENUM budget_category "BUDGET | MODERATE | LUXURY"
        TIMESTAMP created_at
    }

    ACTIVITIES {
        UUID id PK
        UUID itinerary_id FK
        UUID place_id FK
        INTEGER day_number
        INTEGER order_index
        VARCHAR title
        ENUM category "FOOD | LODGING | TRANSPORT | ATTRACTION"
        DOUBLE lat
        DOUBLE lng
        NUMERIC estimated_cost
        TIME start_time
        TIME end_time
        VARCHAR image_url
        TEXT notes
        TIMESTAMP created_at
    }

    PLACES {
        UUID id PK
        VARCHAR destination
        ENUM category "ATTRACTION | FOOD | STAY"
        VARCHAR name
        VARCHAR name_en
        TEXT description
        TEXT address
        VARCHAR area
        DOUBLE latitude
        DOUBLE longitude
        TEXT cover_image
        TEXT_ARRAY images
        DOUBLE rating
        INTEGER review_count
        BOOLEAN must_visit
        INTEGER priority_score
        VARCHAR best_time_of_day
        TEXT_ARRAY tags
        TIME open_time
        TIME close_time
        TEXT hours
        INTEGER recommended_duration
        INTEGER base_price
        VARCHAR phone
        TEXT website
        VARCHAR external_id
        VARCHAR external_source
        UUID parent_id FK
        TEXT_ARRAY sub_attractions
        JSONB metadata
        TEXT source_url
        TIMESTAMP price_updated_at
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    COMBOS {
        UUID id PK
        VARCHAR destination
        VARCHAR name
        TEXT cover_image
        VARCHAR provider
        INTEGER price_per_person
        TEXT_ARRAY includes
        TEXT_ARRAY benefits
        INTEGER duration_days
        BOOLEAN requires_overnight
        TEXT book_url
        TIMESTAMP price_updated_at
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    COLLABORATORS {
        UUID id PK
        UUID itinerary_id FK
        UUID user_id FK
        TEXT email
        UUID invited_by FK
        ENUM role "EDITOR | VIEWER"
        ENUM status "PENDING | ACCEPTED"
        TIMESTAMP joined_at
    }

    AI_CHAT_SESSIONS {
        UUID id PK
        UUID user_id FK
        TEXT title
        TEXT destination
        INTEGER message_count
        UUID saved_itinerary_id FK
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    AI_CHAT_MESSAGES {
        UUID id PK
        UUID session_id FK
        UUID itinerary_id FK
        ENUM role "USER | ASSISTANT"
        TEXT content
        JSONB metadata
        TIMESTAMP created_at
    }

    USER_SAVED_PLACES {
        UUID user_id FK
        UUID place_id FK
        TIMESTAMP saved_at
    }

    DESTINATION_NEIGHBORS {
        UUID id PK
        TEXT destination
        TEXT neighbor
        INTEGER travel_min_ow
        VARCHAR trip_type "day_trip | half_day"
        INTEGER min_trip_days
        TEXT notes
    }

    PLACE_SEASONS {
        UUID id PK
        UUID place_id FK
        INTEGER_ARRAY open_months
        TEXT notes
    }

    OUTBOX {
        UUID id PK
        TEXT event_type
        TEXT room_id
        JSONB payload
        TIMESTAMPTZ created_at
        TIMESTAMPTZ dispatched_at
        INTEGER retry_count
        TEXT last_error
    }

    %% Relationships
    USERS ||--o{ ITINERARIES : "owns"
    USERS |o--o{ COLLABORATORS : "accepted as"
    USERS ||--o{ COLLABORATORS : "invites"
    USERS ||--o{ AI_CHAT_SESSIONS : "has sessions"
    USERS ||--o{ USER_SAVED_PLACES : "saves"

    ITINERARIES ||--o{ ACTIVITIES : "contains"
    ITINERARIES ||--o{ COLLABORATORS : "shared with"
    ITINERARIES |o--o{ ITINERARIES : "cloned by"
    ITINERARIES |o--o{ AI_CHAT_MESSAGES : "discussed in"
    ITINERARIES |o--o{ AI_CHAT_SESSIONS : "saved from"

    PLACES |o--o{ ACTIVITIES : "referenced by"
    PLACES ||--o{ USER_SAVED_PLACES : "saved by"
    PLACES ||--o{ PLACE_SEASONS : "has seasons"
    PLACES |o--o{ PLACES : "parent of"

    AI_CHAT_SESSIONS |o--o{ AI_CHAT_MESSAGES : "contains"
```

## 2.2 Sơ đồ quan hệ đơn giản (rút gọn cho slide)

```mermaid
graph TB
    USER["👤 Users"] -->|"owns"| ITIN["📋 Itineraries"]
    USER -->|"saves"| USP["❤️ User Saved Places"]
    USER -->|"collaborates"| COLLAB["👥 Collaborators"]
    USER -->|"chat"| SESSION["💬 AI Chat Sessions"]

    ITIN -->|"contains"| ACT["📍 Activities"]
    ITIN -->|"shared via"| COLLAB
    USER -->|"invites"| COLLAB
    ITIN -->|"cloned from"| ITIN

    ACT -->|"references"| PLACE["🏝️ Places"]
    USP -->|"references"| PLACE
    PLACE -->|"seasonal availability"| SEASON["Place Seasons"]
    PLACE -->|"parent/sub attractions"| PLACE

    SESSION -->|"contains"| MSG["📝 AI Chat Messages"]
    SESSION -->|"saved itinerary"| ITIN
    MSG -->|"about"| ITIN
    NEIGHBOR["Destination Neighbors"] -.->|"nearby trip rules"| PLACE
    OUTBOX["Outbox"] -.->|"dispatches realtime events"| ITIN

    COMBO["🎁 Combos"] -.->|"contains places from"| PLACE

    style USER fill:#bbdefb,stroke:#1565C0,color:#000
    style ITIN fill:#c8e6c9,stroke:#2E7D32,color:#000
    style ACT fill:#fff9c4,stroke:#F9A825,color:#000
    style PLACE fill:#ffccbc,stroke:#BF360C,color:#000
    style COMBO fill:#e1bee7,stroke:#6A1B9A,color:#000
    style COLLAB fill:#b2dfdb,stroke:#00695C,color:#000
    style SESSION fill:#d1c4e9,stroke:#4527A0,color:#000
    style MSG fill:#f0f4c3,stroke:#827717,color:#000
    style USP fill:#ffcdd2,stroke:#B71C1C,color:#000
    style SEASON fill:#ffe0b2,stroke:#E65100,color:#000
    style NEIGHBOR fill:#d7ccc8,stroke:#4E342E,color:#000
    style OUTBOX fill:#eeeeee,stroke:#424242,color:#000
```
