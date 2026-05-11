# 8. Sơ đồ Deployment & Technology Stack

## 8.1 Sơ đồ Deployment (Docker Compose)

```mermaid
flowchart TB
    subgraph Internet["🌐 Internet"]
        CLIENT["👤 Trình duyệt<br/>người dùng"]
    end

    subgraph DockerCompose["🐳 Docker Compose"]
        subgraph FE_Container["📦 Container: frontend"]
            NEXTJS["Next.js<br/>Node.js Runtime<br/>Port 3000"]
        end

        subgraph BE_Container["📦 Container: backend"]
            GO["Go / Gin HTTP Server<br/>Port 8080"]
        end

        subgraph AI_Container["📦 Container: planner-ai"]
            FASTAPI["FastAPI / Uvicorn<br/>Python Runtime<br/>Port 8090"]
        end

        subgraph DB_Container["📦 Container: postgres"]
            PG["PostgreSQL 16<br/>schema_travel<br/>Port 5432"]
            VOLUME_PG[("📁 Volume:<br/>pg_data")]
        end

        subgraph Redis_Container["📦 Container: redis"]
            RD["Redis 7<br/>Cache + PubSub<br/>Port 6379"]
        end
    end

    subgraph ExternalAPIs["🌐 External APIs"]
        LLM["LLM Provider<br/>(OpenAI / Anthropic /<br/>OpenRouter / Nebius)"]
        SERP["SerpAPI<br/>(Hotels + Flights)"]
        TAVILY["Tavily<br/>(Web Search)"]
        GOOGLE["Google OAuth"]
    end

    CLIENT -->|"HTTPS :3000"| NEXTJS
    NEXTJS -->|"HTTP :8080<br/>REST + WS"| GO
    NEXTJS -->|"HTTP :8090<br/>SSE"| FASTAPI
    GO -->|"HTTP :8090<br/>Proxy"| FASTAPI

    GO -->|"TCP :5432"| PG
    GO -->|"TCP :6379"| RD
    FASTAPI -->|"TCP :5432<br/>asyncpg"| PG
    FASTAPI -->|"TCP :6379<br/>aioredis"| RD

    PG --- VOLUME_PG

    FASTAPI -->|"HTTPS"| LLM
    FASTAPI -->|"HTTPS"| SERP
    FASTAPI -->|"HTTPS"| TAVILY
    GO -->|"HTTPS"| GOOGLE

    style FE_Container fill:#dcedc8,stroke:#558B2F,color:#000
    style BE_Container fill:#ffe0b2,stroke:#E65100,color:#000
    style AI_Container fill:#e1bee7,stroke:#6A1B9A,color:#000
    style DB_Container fill:#bbdefb,stroke:#1565C0,color:#000
    style Redis_Container fill:#ffcdd2,stroke:#B71C1C,color:#000
    style ExternalAPIs fill:#e0f7fa,stroke:#00695C,color:#000
```

## 8.2 Technology Stack

```mermaid
block-beta
    columns 3

    block:frontend["🎨 Frontend"]:3
        columns 3
        nextjs["Next.js 14"]
        react["React 18"]
        ts["TypeScript"]
        shadcn["shadcn/ui"]
        dndkit["@dnd-kit<br/>(Drag & Drop)"]
        sonner["Sonner<br/>(Toast)"]
    end

    block:backend["⚙️ Backend"]:3
        columns 3
        go["Go 1.22"]
        gin["Gin HTTP"]
        gorilla["Gorilla<br/>WebSocket"]
        jwt_lib["JWT"]
        bcrypt["bcrypt"]
        pgx["pgx<br/>(PostgreSQL)"]
    end

    block:ai_service["🤖 AI Service"]:3
        columns 3
        python["Python 3.11"]
        fastapi_lib["FastAPI"]
        langgraph["LangGraph"]
        langchain["LangChain"]
        asyncpg_lib["asyncpg"]
        aioredis["aioredis"]
    end

    block:data["💾 Data Layer"]:3
        columns 3
        postgres["PostgreSQL 16"]
        redis_lib["Redis 7"]
        space3["Docker<br/>Volumes"]
    end

    block:external["🌐 External"]:3
        columns 3
        openai["OpenAI /<br/>Anthropic"]
        serpapi["SerpAPI"]
        tavily_lib["Tavily Search"]
    end

    style frontend fill:#e8f5e9,stroke:#2E7D32,color:#000
    style backend fill:#fff3e0,stroke:#E65100,color:#000
    style ai_service fill:#f3e5f5,stroke:#6A1B9A,color:#000
    style data fill:#e3f2fd,stroke:#1565C0,color:#000
    style external fill:#e0f7fa,stroke:#00695C,color:#000
```

## 8.3 Bảng Technology Stack chi tiết

| Tầng | Công nghệ | Phiên bản | Mục đích |
|------|-----------|-----------|----------|
| **Frontend** | Next.js | 14 | Framework React SSR/CSR |
| | React | 18 | UI Library |
| | TypeScript | 5.x | Type-safe JavaScript |
| | shadcn/ui | Latest | UI Component Library |
| | @dnd-kit | Latest | Drag & Drop |
| | Sonner | Latest | Toast notifications |
| **Backend** | Go | 1.22 | Ngôn ngữ chính |
| | Gin | Latest | HTTP Framework |
| | Gorilla WebSocket | Latest | WebSocket support |
| | JWT-Go | Latest | JWT authentication |
| | pgx | v5 | PostgreSQL driver |
| **AI Service** | Python | 3.11 | Ngôn ngữ chính |
| | FastAPI | Latest | HTTP Framework |
| | LangGraph | Latest | Agent orchestration |
| | LangChain | Latest | LLM toolchain |
| | asyncpg | Latest | Async PostgreSQL |
| | aioredis | Latest | Async Redis |
| **Database** | PostgreSQL | 16 | Relational database |
| | Redis | 7 | Cache + PubSub |
| **DevOps** | Docker | Latest | Containerization |
| | Docker Compose | Latest | Orchestration |
| **External** | OpenAI / Anthropic | — | LLM Provider |
| | SerpAPI | — | Hotel + Flight search |
| | Tavily | — | Web search |
| | Google OAuth | v2 | Authentication |

## 8.4 Sơ đồ luồng dữ liệu giữa các lớp

```mermaid
flowchart LR
    subgraph Presentation["Presentation Layer"]
        UI["React Components"]
        HOOKS["Custom Hooks<br/>(useAuth, useItineraryWS)"]
        API_CLIENT["API Client<br/>(lib/api.ts)"]
    end

    subgraph Application["Application Layer"]
        HANDLERS["Handlers<br/>(Auth, Itinerary,<br/>Activity, WS)"]
        SERVICES["Services<br/>(Business Logic)"]
        MIDDLEWARE["Middleware<br/>(JWT, Rate Limit,<br/>CORS)"]
    end

    subgraph AI["AI Layer"]
        ROUTES["Routes<br/>(Chat, Plan,<br/>Sessions)"]
        AGENT_LAYER["ReAct Agent"]
        TOOLS_LAYER["Tools (8)"]
        PIPELINE_LAYER["Pipeline (5 stages)"]
    end

    subgraph Data["Data Layer"]
        POSTGRES[("PostgreSQL")]
        REDIS_STORE[("Redis")]
    end

    UI --> HOOKS --> API_CLIENT
    API_CLIENT -->|"REST/WS/SSE"| HANDLERS
    API_CLIENT -->|"SSE"| ROUTES

    HANDLERS --> MIDDLEWARE --> SERVICES
    SERVICES --> POSTGRES
    HANDLERS --> REDIS_STORE

    ROUTES --> AGENT_LAYER --> TOOLS_LAYER
    TOOLS_LAYER --> PIPELINE_LAYER
    TOOLS_LAYER --> POSTGRES
    AGENT_LAYER --> REDIS_STORE

    style Presentation fill:#e8f5e9,stroke:#2E7D32,color:#000
    style Application fill:#fff3e0,stroke:#E65100,color:#000
    style AI fill:#f3e5f5,stroke:#6A1B9A,color:#000
    style Data fill:#e3f2fd,stroke:#1565C0,color:#000
```
