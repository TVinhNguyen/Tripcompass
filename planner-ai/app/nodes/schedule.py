"""
core/schedule.py — Schedule Draft node.
LLM drafts a day-by-day schedule from retrieved data + budget constraints.
On retry: receives violations and fixes them.
"""
import asyncio
import json
from datetime import date, timedelta
from langchain_core.messages import SystemMessage, HumanMessage
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from app import config
from app.prompts.schedule import SCHEDULE_SYSTEM_PROMPT
# Fields the LLM needs for scheduling decisions — everything else is display-only
_PLACE_FIELDS = ("id", "name", "hours", "base_price", "duration_min",
                 "must_visit", "best_time_of_day", "latitude", "longitude", "area")
_FOOD_FIELDS  = ("id", "name", "hours", "base_price", "area", "tags")
_HOTEL_FIELDS = ("name", "price_per_night_vnd", "rating")


class ScheduleHotel(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = ""
    price_per_night_vnd: int | None = 0


class ScheduleSlot(BaseModel):
    model_config = ConfigDict(extra="allow")

    start: str = ""
    end: str = ""
    slot_type: str
    place_id: str | None = None
    place_name: str | None = None
    price_vnd: int | None = 0
    notes: str = ""


class ScheduleDay(BaseModel):
    model_config = ConfigDict(extra="allow")

    day_num: int
    day_type: str = "standard"
    date_str: str = ""
    hotel: ScheduleHotel | None = None
    slots: list[ScheduleSlot] = Field(default_factory=list)


class ScheduleDraft(BaseModel):
    model_config = ConfigDict(extra="allow")

    days: list[ScheduleDay] = Field(default_factory=list)


def _slim(items: list[dict], fields: tuple[str, ...]) -> list[dict]:
    """Keep only scheduling-relevant fields → fewer tokens for LLM."""
    return [{k: item[k] for k in fields if k in item} for item in items]


def _validated_draft(draft: dict) -> dict:
    """Validate and normalize the LLM schedule shape."""
    return ScheduleDraft.model_validate(draft).model_dump(mode="json", exclude_none=True)


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
        draft = _validated_draft(draft)
        logger.info(f"[Node 5 Schedule] Drafted {len(draft.get('days', []))} days.")
    except json.JSONDecodeError as e:
        logger.error(f"[Node 5 Schedule] JSON parse error: {e}")
        warnings.append("Schedule LLM returned invalid JSON — using fallback draft.")
        draft = _fallback_schedule(state, retrieved)
    except ValidationError as e:
        logger.error(f"[Node 5 Schedule] Schema validation error: {e}")
        warnings.append("Schedule LLM returned invalid schedule schema — using fallback draft.")
        draft = _fallback_schedule(state, retrieved)

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
    try:
        num_days = max(1, int(state.get("num_days", 3) or 3))
    except (TypeError, ValueError):
        num_days = 3

    try:
        start_dt = date.fromisoformat(start_date) if start_date else None
    except ValueError:
        start_dt = None

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

    place_i = 0
    food_i = 0

    def _next_place():
        nonlocal place_i
        if place_i >= len(places):
            return None
        item = places[place_i]
        place_i += 1
        return item

    def _next_food():
        nonlocal food_i
        if food_i >= len(food):
            return None
        item = food[food_i]
        food_i += 1
        return item

    def _date_str(day_num: int) -> str:
        if start_dt:
            return str(start_dt + timedelta(days=day_num - 1))
        if day_num == 1:
            return start_date
        if day_num == num_days:
            return end_date
        return ""

    def _day_type(day_num: int) -> str:
        if num_days == 1:
            return "standard"
        if day_num == 1:
            return "arrival"
        if day_num == num_days:
            return "departure"
        return "standard"

    days = []
    for day_num in range(1, num_days + 1):
        day_type = _day_type(day_num)
        if day_type == "arrival":
            slots = [
                _slot("15:00", "16:30", "afternoon_activity", _next_place()),
                _slot("18:00", "19:30", "dinner", _next_food()),
                _slot("19:30", "21:00", "evening"),
            ]
        elif day_type == "departure":
            slots = [
                _slot("07:00", "08:00", "breakfast", _next_food()),
                _slot("08:30", "10:00", "morning_activity", _next_place()),
            ]
        else:
            slots = [
                _slot("07:30", "08:30", "breakfast", _next_food()),
                _slot("09:00", "10:30", "morning_activity", _next_place()),
                _slot("11:30", "13:00", "lunch", _next_food()),
                _slot("13:30", "15:00", "afternoon_activity", _next_place()),
                _slot("18:00", "19:30", "dinner", _next_food()),
            ]
        days.append({
            "day_num": day_num,
            "day_type": day_type,
            "date_str": _date_str(day_num),
            "hotel": hotel,
            "slots": slots,
        })

    return {"days": days}
