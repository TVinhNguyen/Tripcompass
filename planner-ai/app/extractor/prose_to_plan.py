"""
extractor/prose_to_plan.py — Orchestrator. Prose text → GenerateResponse.

The transform mirrors `streaming/response_shape._to_generate_response` so
the frontend sees a single shape regardless of whether the plan came from
the legacy `create_travel_plan` tool or from the new prose extractor.

Cost handling: per the v2 product decision we no longer compute exact
budgets. The LLM's free-text already mentions rough ranges in the chat
bubble, so `budget_recap` here is reported as zeros + `within_budget=True`
to keep the FE schema happy without surfacing a misleading progress bar.

Duplicate handling: we deliberately do NOT dedupe across days. The
upstream LLM is now trusted as the planner, and dedupe heuristics on
top of it caused more harm than good in the v1 pipeline.
"""
from __future__ import annotations

from typing import Optional

from loguru import logger
from app.extractor.prose_parser import parse_prose, ProseDay, ProseSlot
from app.extractor.place_resolver import resolve_places


_FOOD_SLOT_TYPES = {"breakfast", "lunch", "dinner", "snack", "brunch"}


def _slot_category(slot_type: str) -> str:
    """Coarse mapping used by the FE card renderer."""
    return "FOOD" if (slot_type or "").lower() in _FOOD_SLOT_TYPES else "ATTRACTION"


def _day_type(day_num: int, total_days: int) -> str:
    if day_num == 1:
        return "arrival"
    if day_num == total_days:
        return "departure"
    return "standard"


def _slot_to_fe(slot: ProseSlot, resolved: Optional[dict]) -> dict:
    """Project one parsed slot + its DB row (if matched) to the FE slot shape."""
    out: dict = {
        "start": slot.start,
        "end": slot.end,
        "slot_type": slot.slot_type,
        # `is_buffer=True` is the FE's signal "skip when persisting as a real
        # activity row". For unresolved places we set it True so the user can
        # see the card but the Save flow doesn't try to insert a stub activity
        # pointing at a non-existent place_id.
        "is_buffer": resolved is None,
    }
    if slot.note:
        out["notes"] = slot.note

    if resolved:
        category = resolved.get("category") or _slot_category(slot.slot_type)
        place = {
            "id": resolved["id"],
            "name": resolved.get("name") or slot.place_name,
            "category": category,
            "base_price": int(resolved.get("base_price") or 0),
            "duration_min": 0,
            "is_must_visit": False,
            "is_full_day": slot.slot_type == "full_day_activity",
            "is_free": int(resolved.get("base_price") or 0) == 0,
        }
        # FE SlotPlace uses lat/lng (short names) — see frontend/lib/types.ts.
        if resolved.get("latitude") is not None:
            place["lat"] = resolved["latitude"]
        if resolved.get("longitude") is not None:
            place["lng"] = resolved["longitude"]
        if resolved.get("cover_image"):
            place["cover_image"] = resolved["cover_image"]
        out["place"] = place
    else:
        # Unresolved → render the LLM's text as a placeholder name so the
        # card still shows something. No id → FE Save flow drops it.
        out["place"] = {
            "id": "",
            "name": slot.place_name,
            "category": _slot_category(slot.slot_type),
            "base_price": 0,
            "duration_min": 0,
            "is_must_visit": False,
            "is_full_day": slot.slot_type == "full_day_activity",
            "is_free": True,
        }
    return out


async def prose_to_plan(
    text: str,
    destination: Optional[str] = None,
) -> Optional[dict]:
    """Parse + resolve + assemble. Returns GenerateResponse-shaped dict, or
    None when the prose doesn't contain a recognisable itinerary structure.

    `destination` is a hint passed to the resolver to bias matches toward
    the relevant city. Caller usually pulls it from the chat session or from
    a previous tool call. If unknown, the resolver searches the whole table
    — slightly less precise but still works.
    """
    days_parsed = parse_prose(text)
    if not days_parsed:
        return None

    # Collect every unique place name across all days, resolve once.
    all_names: list[str] = []
    for day in days_parsed:
        for slot in day.slots:
            if slot.place_name not in all_names:
                all_names.append(slot.place_name)
    resolved = await resolve_places(all_names, destination=destination)

    total_days = len(days_parsed)
    days_out: list[dict] = []
    for day in days_parsed:
        slots_out = [_slot_to_fe(slot, resolved.get(slot.place_name)) for slot in day.slots]
        days_out.append({
            "day_num": day.day_num,
            "date_str": "",  # FE renders without if missing
            "day_type": _day_type(day.day_num, total_days),
            "primary_area": destination or "",
            "travel_min": 0,
            "buffer_min": 0,
            "slots": slots_out,
        })

    matched_count = sum(1 for v in resolved.values() if v)
    logger.info(
        f"[prose-extract] days={total_days} slots={sum(len(d.slots) for d in days_parsed)} "
        f"matched={matched_count}/{len(all_names)}"
    )

    return {
        "days": days_out,
        # Budget recap intentionally zeroed — cost is not enforced in v2.
        # The chat bubble already shows rough ranges in prose.
        "budget_recap": {
            "total_budget_vnd": 0,
            "attraction_spent_vnd": 0,
            "food_spent_vnd": 0,
            "remaining_vnd": 0,
            "within_budget": True,
        },
        "budget_tier": "standard",
        "violations": [],
        "slot_template": "standard",
    }
