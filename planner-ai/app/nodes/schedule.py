"""
core/schedule.py — Schedule Draft node.
LLM drafts a day-by-day schedule from retrieved data + budget constraints.
On retry: receives violations and fixes them.
"""
import asyncio
import json
from langchain_core.messages import SystemMessage, HumanMessage
from loguru import logger
from app import config
from app.prompts.schedule import SCHEDULE_SYSTEM_PROMPT
# Fields the LLM needs for scheduling decisions — everything else is display-only
_PLACE_FIELDS = ("id", "name", "hours", "base_price", "duration_min",
                 "must_visit", "best_time_of_day", "latitude", "longitude", "area")
_FOOD_FIELDS  = ("id", "name", "hours", "base_price", "area", "tags")
_HOTEL_FIELDS = ("name", "price_per_night_vnd", "rating")


def _slim(items: list[dict], fields: tuple[str, ...]) -> list[dict]:
    """Keep only scheduling-relevant fields → fewer tokens for LLM."""
    return [{k: item[k] for k in fields if k in item} for item in items]


async def node_schedule(state: dict) -> dict:
    version    = state.get("schedule_version", 0)
    violations = state.get("violations", [])
    retrieved  = state.get("retrieved_data", {})

    logger.info(f"[Node 5 Schedule] version={version}, violations={len(violations)}, "
                f"places={len(retrieved.get('places',[]))}")

    context = {
        "destination":            state.get("destination_name", ""),
        "num_days":               state.get("num_days", 3),
        "guest_count":            state.get("guest_count", 2),
        "start_date":             state.get("start_date", ""),
        "end_date":               state.get("end_date", ""),
        "travel_month":           state.get("travel_month"),
        "budget_tier":            state.get("budget_tier", "standard"),
        "attr_budget":            state.get("attr_budget", 0),
        "food_budget":            state.get("food_budget", 0),
        "hotel_budget_per_night": state.get("hotel_budget_per_night", 0),
        "preferences":            state.get("preferences", []),
        # Trimmed: only fields the LLM needs for scheduling decisions
        "places":                 _slim(retrieved.get("places", []), _PLACE_FIELDS),
        "food":                   _slim(retrieved.get("food", []), _FOOD_FIELDS),
        "hotels":                 _slim(retrieved.get("hotels", []), _HOTEL_FIELDS),
        "weather":                retrieved.get("weather", {}),
        "combos":                 retrieved.get("combos", []),
    }

    user_msg = (
        f"Tạo lịch trình cho chuyến đi:\n"
        f"{json.dumps(context, ensure_ascii=False, indent=2)}"
    )

    if violations:
        user_msg += (
            f"\n\n⚠️ RETRY #{version} — Validator phát hiện {len(violations)} lỗi cần sửa:\n"
            + json.dumps(violations, ensure_ascii=False, indent=2)
        )

    messages = [
        SystemMessage(content=SCHEDULE_SYSTEM_PROMPT),
        HumanMessage(content=user_msg),
    ]

    warnings = list(state.get("warnings", []))
    llm_timeout_s = max(30, int(config.TOOL_TIMEOUT) * 8)
    try:
      response = await asyncio.wait_for(config.llm.ainvoke(messages), timeout=llm_timeout_s)
    except asyncio.TimeoutError:
      logger.warning(f"[Node 5 Schedule] LLM timeout after {llm_timeout_s}s. Using fallback schedule.")
      warnings.append(f"Schedule LLM timeout after {llm_timeout_s}s — using fallback draft.")
      draft = _fallback_schedule(state, retrieved)
      return {
        "draft_schedule":    draft,
        "schedule_version":  version + 1,
        "violations":        [],
        "validation_passed": False,
        "warnings":          warnings,
      }

    raw = response.content.strip()

    # Strip markdown fences
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        draft = json.loads(raw)
        logger.info(f"[Node 5 Schedule] Drafted {len(draft.get('days', []))} days.")
    except json.JSONDecodeError as e:
        logger.error(f"[Node 5 Schedule] JSON parse error: {e}")
        draft = {"days": [], "parse_error": str(e)}

    return {
        "draft_schedule":    draft,
        "schedule_version":  version + 1,
        "violations":        [],
        "validation_passed": False,
        "warnings":          warnings,
    }


def _fallback_schedule(state: dict, retrieved: dict) -> dict:
    """Quick deterministic draft to avoid empty output when LLM is slow."""
    places = list(retrieved.get("places", []))
    food = list(retrieved.get("food", []))
    hotels = list(retrieved.get("hotels", []))
    start_date = state.get("start_date") or ""
    end_date = state.get("end_date") or ""

    def _slot(start, end, slot_type, place=None):
        s = {"start": start, "end": end, "slot_type": slot_type, "notes": ""}
        if place:
            s.update({
                "place_id": place.get("id", ""),
                "place_name": place.get("name", ""),
                "price_vnd": int(place.get("base_price") or place.get("price_per_person") or 0),
            })
        return s

    hotel = {
        "name": (hotels[0].get("name") if hotels else ""),
        "price_per_night_vnd": int(hotels[0].get("price_per_night_vnd", 0)) if hotels else 0,
    }

    p1 = places[0] if len(places) > 0 else None
    p2 = places[1] if len(places) > 1 else None
    p3 = places[2] if len(places) > 2 else None
    p4 = places[3] if len(places) > 3 else None
    f1 = food[0] if len(food) > 0 else None
    f2 = food[1] if len(food) > 1 else None
    f3 = food[2] if len(food) > 2 else None
    f4 = food[3] if len(food) > 3 else None
    f5 = food[4] if len(food) > 4 else None

    return {
        "days": [
            {
                "day_num": 1,
                "day_type": "arrival",
                "date_str": start_date,
                "hotel": hotel,
                "slots": [
                    _slot("15:00", "16:30", "afternoon_activity", p1),
                    _slot("18:00", "19:30", "dinner", f1),
                    _slot("19:30", "21:00", "evening"),
                ],
            },
            {
                "day_num": 2,
                "day_type": "standard",
                "date_str": "",
                "hotel": hotel,
                "slots": [
                    _slot("07:30", "08:30", "breakfast", f2),
                    _slot("09:00", "10:30", "morning_activity", p2),
                    _slot("11:30", "13:00", "lunch", f3),
                    _slot("13:30", "15:00", "afternoon_activity", p3),
                    _slot("18:00", "19:30", "dinner", f4),
                ],
            },
            {
                "day_num": 3,
                "day_type": "departure",
                "date_str": end_date,
                "hotel": hotel,
                "slots": [
                    _slot("07:00", "08:00", "breakfast", f5),
                    _slot("08:00", "09:30", "morning_activity", p4),
                ],
            },
        ]
    }
