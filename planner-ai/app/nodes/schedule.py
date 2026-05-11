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
    llm_timeout_s = int(getattr(config, "SCHEDULE_LLM_TIMEOUT", 90))
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
            # Same LLM with the same prompt will almost certainly time out
            # again — signal the outer planning loop to skip the retry.
            "skip_retry":        True,
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


def _parse_hours(hours: str | None) -> tuple[int, int] | None:
    """Parse 'HH:MM-HH:MM' → (open_minutes, close_minutes). Returns None on bad input.

    24/7 venues encoded as '00:00-23:59' return (0, 1439); slots fall inside.
    """
    if not hours or "-" not in hours:
        return None
    try:
        a, b = hours.split("-", 1)
        ah, am = a.strip().split(":")
        bh, bm = b.strip().split(":")
        return int(ah) * 60 + int(am), int(bh) * 60 + int(bm)
    except (ValueError, AttributeError):
        return None


def _hms(t: str) -> int:
    """Slot time 'HH:MM' → minutes since midnight."""
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _slot_bucket(slot_start: str) -> str:
    """Map slot start time → best_time_of_day bucket the DB uses.

    Buckets follow what the scraper writes into the places.best_time_of_day
    column ('morning', 'afternoon', 'evening', 'night', 'any').
    """
    minutes = _hms(slot_start)
    if minutes < 11 * 60:
        return "morning"
    if minutes < 17 * 60:
        return "afternoon"
    if minutes < 21 * 60:
        return "evening"
    return "night"


def _fits(item: dict, slot_start: str, slot_end: str) -> bool:
    """True if the venue's opening hours cover the slot window.

    Handles venues that span midnight (e.g. '18:00-02:00' for a night bar):
    if close < open we treat the window as two segments — [open, 24:00) and
    [00:00, close] — and the slot must lie inside one of them.

    Returns True for unknown hours so the LLM-style fallback doesn't reject
    sparse data (scraper sometimes leaves hours blank for low-quality rows).
    """
    hrs = _parse_hours(item.get("hours"))
    if hrs is None:
        return True
    open_m, close_m = hrs
    ss, se = _hms(slot_start), _hms(slot_end)
    if open_m <= close_m:
        # Same-day window.
        return open_m <= ss and se <= close_m
    # Overnight window — slot fits if it's entirely in either segment.
    return (ss >= open_m and se <= 1440) or (ss >= 0 and se <= close_m)


def _fallback_schedule(state: dict, retrieved: dict) -> dict:
    """Quick deterministic draft to avoid empty output when LLM is slow.

    The fallback used to assign places round-robin without checking opening
    hours, which produced CLOSED_HOURS violations (e.g. a breakfast-only spot
    landing in a lunch slot). Now it filters by `hours` per slot and keeps a
    used-set so a place is never repeated.
    """
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

    used_ids: set[str] = set()

    def _pick(pool: list[dict], slot_start: str, slot_end: str) -> dict | None:
        """Pick the best venue for a slot, in three tiers.

        Tier 1: hours fit AND best_time_of_day matches the slot bucket
                (e.g. morning_activity prefers best_time_of_day='morning').
        Tier 2: hours fit only.
        Tier 3: any unused venue (graceful fallback when hours-strict empty).

        Pool is already ordered by priority_score/rating from SQL, so within
        a tier we keep that ranking. used_ids prevents duplicates across
        slots and days.
        """
        slot_bucket = _slot_bucket(slot_start)

        # Tier 1: best_time_of_day match
        for item in pool:
            if item.get("id") in used_ids:
                continue
            if (item.get("best_time_of_day") or "").lower() == slot_bucket and _fits(item, slot_start, slot_end):
                used_ids.add(item.get("id", ""))
                return item
        # Tier 2: hours fit only
        for item in pool:
            if item.get("id") in used_ids:
                continue
            if _fits(item, slot_start, slot_end):
                used_ids.add(item.get("id", ""))
                return item
        # Tier 3: relaxed — any unused, so a non-empty pool always produces.
        for item in pool:
            if item.get("id") in used_ids:
                continue
            used_ids.add(item.get("id", ""))
            return item
        return None

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
                _slot("15:00", "16:30", "afternoon_activity", _pick(places, "15:00", "16:30")),
                _slot("18:00", "19:30", "dinner",             _pick(food,   "18:00", "19:30")),
                _slot("19:30", "21:00", "evening"),
            ]
        elif day_type == "departure":
            slots = [
                _slot("07:00", "08:00", "breakfast",        _pick(food,   "07:00", "08:00")),
                _slot("08:30", "10:00", "morning_activity", _pick(places, "08:30", "10:00")),
            ]
        else:
            slots = [
                _slot("07:30", "08:30", "breakfast",          _pick(food,   "07:30", "08:30")),
                _slot("09:00", "10:30", "morning_activity",   _pick(places, "09:00", "10:30")),
                _slot("11:30", "13:00", "lunch",              _pick(food,   "11:30", "13:00")),
                _slot("13:30", "15:00", "afternoon_activity", _pick(places, "13:30", "15:00")),
                _slot("18:00", "19:30", "dinner",             _pick(food,   "18:00", "19:30")),
            ]
        days.append({
            "day_num": day_num,
            "day_type": day_type,
            "date_str": _date_str(day_num),
            "hotel": hotel,
            "slots": slots,
        })

    return {"days": days}
