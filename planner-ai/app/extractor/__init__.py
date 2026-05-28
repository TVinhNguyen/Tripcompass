"""
extractor — Prose-first plan extraction (Pha 2 redesign, late binding).

Pipeline:
    LLM produces a Vietnamese prose plan with embedded markers
        (Ngày N: ... + bulleted slots with time + bolded place names)
        ↓
    prose_parser.parse()                              → list[Day(slots[])]
        ↓
    place_resolver.resolve_many()                     → DB rows via pg_trgm
        ↓
    prose_to_plan.assemble()                          → GenerateResponse for FE

The design trades exact constraint satisfaction (cost, dedupe, travel-time
buffers) for higher reasoning quality. The structured pipeline-of-tools
(create_travel_plan → schedule → enrich → validate) is kept around as a
legacy escape hatch but the system prompt now steers the agent to prose.

Why this exists:
    Gemma 3 31B + structured tool calling underperforms because of the "JSON
    tax" — schema formatting drains the reasoning budget that small open
    models need for spatial/temporal layout. Letting the model think in
    free-text and then projecting into structure after the fact is a
    pattern used by Perplexity (citations), Notion AI (action items), and
    several 2025-2026 travel agent frameworks (TriFlow, Vaiage, AgentTravel).
"""
from app.extractor.prose_parser import parse_prose, ProseDay, ProseSlot
from app.extractor.place_resolver import resolve_places
from app.extractor.prose_to_plan import prose_to_plan

__all__ = [
    "parse_prose",
    "ProseDay",
    "ProseSlot",
    "resolve_places",
    "prose_to_plan",
]
