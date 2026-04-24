# Travel Planner — Agentic RAG System

> Kiến trúc AI travel planning sử dụng LangGraph + pgvector + PostgreSQL.  
> Không dùng Neo4j. Không dùng LangChain chains. Không single-pass RAG.

---

## Tổng quan hệ thống

```
User input (natural language)
    ↓
[Node 1] Intent parsing          ← LLM
    ↓
[Node 2] Destination resolve     ← pgvector (aliases + typo-tolerant)
    ↓
[Node 3] Agentic RAG             ← LLM + 6 tools (multi-round)
    ↓
[Node 4] Budget classify         ← Deterministic Python, không LLM
    ↓
[Node 5] Schedule draft          ← LLM + constraints
    ↓
[Node 6] Validate                ← Code only (budget, hours, duplicates, stale price)
    ↓ if violations → back to Node 5 (max 2 retries) → else partial plan
[Node 7] Enrich                  ← LLM (mô tả tự nhiên, tips, KHÔNG sửa số)
    ↓
Output JSON + natural language    ← Redis cache
```

---

## Cấu trúc tài liệu

| File | Nội dung |
|------|----------|
| `01_data_model.md` | Schema PostgreSQL, tourist_destinations vs places, alias resolution |
| `02_agentic_rag.md` | Tại sao Agentic RAG, so sánh Simple RAG vs KG, hybrid approach |
| `03_langgraph_architecture.md` | Từng node, state schema, conditional edges, retry logic |
| `04_tools_design.md` | 6 tool definitions, input/output types, staleness policy |
| `05_system_prompts.md` | System prompt cho từng LLM node |
| `06_implementation_steps.md` | Thứ tự implement, milestone, kiểm tra từng bước |

---

## Stack quyết định

| Layer | Chọn | Lý do không chọn cái khác |
|-------|------|--------------------------|
| Orchestration | **LangGraph** | LangChain = linear, không có loop/state |
| Vector search | **pgvector** | Pinecone standalone = thêm infra không cần thiết |
| Structured data | **PostgreSQL** | Neo4j overkill cho < 200 destinations |
| LLM | **Claude / GPT-4o** | Node 4, 6 dùng code — không để LLM làm toán |
| Cache | **Redis** | Cache coarse template, không cache user prefs |
| Budget logic | **Python code** | LLM hallucinate số tiền |

---

## Nguyên tắc thiết kế

1. **Data model first** — sai schema thì retrieval nào cũng sai. `tourist_dest_id` không bao giờ là `province`.
2. **LLM chỉ làm việc LLM giỏi** — language, reasoning, ranking. Không làm arithmetic, không làm date math.
3. **Deterministic gate trước LLM gate** — validate bằng code trước khi để LLM enrich.
4. **Fail gracefully** — sau max retries, trả partial plan + warning, không crash.
