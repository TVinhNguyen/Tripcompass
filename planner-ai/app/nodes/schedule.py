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
from app.services.time_utils import (
    to_minutes as _hms_safe,
    to_minutes_or as _time_or_util,
    format_minutes as _fmt_minutes_util,
    parse_hours as _parse_hours_util,
    slot_fits_hours as _fits_util,
)
from app.services.normalize import ascii_fold
# Fields the LLM needs for scheduling decisions — everything else is display-only
_PLACE_FIELDS = ("id", "name", "hours", "base_price", "duration_min",
                 "must_visit", "best_time_of_day", "latitude", "longitude",
                 "area", "tags", "sub_attractions")
_FOOD_FIELDS  = ("id", "name", "hours", "base_price", "area", "tags")
_HOTEL_FIELDS = ("name", "price_per_night_vnd", "rating")
_COMBO_FIELDS = ("name", "price_per_person", "duration_days", "requires_overnight", "includes")


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


def _compact_json(payload: object) -> str:
    """Token-lean JSON for prompt context."""
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


async def node_schedule(state: dict) -> dict:
    version    = state.get("schedule_version", 0)
    violations = state.get("violations", [])
    retrieved  = state.get("retrieved_data", {})

    logger.info(f"[Node 5 Schedule] version={version}, violations={len(violations)}, "
                f"places={len(retrieved.get('places',[]))}")
    num_days = int(state.get("num_days", 3) or 3)
    place_limit = min(20, max(10, num_days * 5))
    food_limit = min(12, max(6, num_days * 3))

    context = {
        "destination":            state.get("destination_name", ""),
        "num_days":               num_days,
        "guest_count":            state.get("guest_count", 2),
        "start_date":             state.get("start_date", ""),
        "end_date":               state.get("end_date", ""),
        "travel_month":           state.get("travel_month"),
        "travel_style":           state.get("travel_style", "balanced"),
        "arrival_time":           state.get("arrival_time"),
        "departure_time":         state.get("departure_time"),
        "daily_start_time":       state.get("daily_start_time"),
        "daily_end_time":         state.get("daily_end_time"),
        "time_strictness":        state.get("time_strictness", "balanced"),
        "budget_tier":            state.get("budget_tier", "standard"),
        "attr_budget":            state.get("attr_budget", 0),
        "food_budget":            state.get("food_budget", 0),
        "hotel_budget_per_night": state.get("hotel_budget_per_night", 0),
        "preferences":            state.get("preferences", []),
        "required_places":         _slim(state.get("required_places", []), _PLACE_FIELDS),
        # Trimmed: only fields the LLM needs for scheduling decisions
        "places":                 _slim(retrieved.get("places", [])[:place_limit], _PLACE_FIELDS),
        "food":                   _slim(retrieved.get("food", [])[:food_limit], _FOOD_FIELDS),
        "hotels":                 _slim(retrieved.get("hotels", []), _HOTEL_FIELDS),
        "weather":                retrieved.get("weather", {}),
        "combos":                 _slim(retrieved.get("combos", [])[:3], _COMBO_FIELDS),
    }

    user_msg = (
        f"Tạo lịch trình cho chuyến đi:\n"
        f"{_compact_json(context)}"
    )

    if violations:
        user_msg += (
            f"\n\n⚠️ RETRY #{version} — Validator phát hiện {len(violations)} lỗi cần sửa:\n"
            + _compact_json(violations)
        )

    messages = [
        SystemMessage(content=SCHEDULE_SYSTEM_PROMPT),
        HumanMessage(content=user_msg),
    ]

    warnings = list(state.get("warnings", []))
    llm_timeout_s = int(getattr(config, "SCHEDULE_LLM_TIMEOUT", 90))
    use_structured = bool(getattr(config, "USE_STRUCTURED_SCHEDULE", False))

    try:
        if use_structured:
            # Provider-supported function-calling path: response is already a
            # validated ScheduleDraft instance, no text parsing needed.
            llm = config.llm.with_structured_output(ScheduleDraft)
            parsed: ScheduleDraft = await asyncio.wait_for(
                llm.ainvoke(messages), timeout=llm_timeout_s,
            )
            draft = parsed.model_dump(mode="json", exclude_none=True)
            logger.info(f"[Node 5 Schedule] Drafted {len(draft.get('days', []))} days (structured).")
        else:
            response = await asyncio.wait_for(
                config.llm.ainvoke(messages), timeout=llm_timeout_s,
            )
            # Gemini/Gemma return `content` as list[dict] (multimodal parts), not str.
            # Normalize through the shared helper so this stays a string concat.
            from app.streaming.helpers import _content_to_text
            raw = _content_to_text(response.content).strip()
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            draft = _validated_draft(json.loads(raw))
            logger.info(f"[Node 5 Schedule] Drafted {len(draft.get('days', []))} days.")
    except asyncio.TimeoutError:
        logger.warning(f"[Node 5 Schedule] LLM timeout after {llm_timeout_s}s. Using fallback schedule.")
        warnings.append(f"Schedule LLM timeout after {llm_timeout_s}s — using fallback draft.")
        return {
            "draft_schedule":    _fallback_schedule(state, retrieved),
            "schedule_version":  version + 1,
            "violations":        [],
            "validation_passed": False,
            "warnings":          warnings,
            # Same LLM with the same prompt will almost certainly time out
            # again — signal the outer planning loop to skip the retry.
            "skip_retry":        True,
        }
    except json.JSONDecodeError as e:
        logger.error(f"[Node 5 Schedule] JSON parse error: {e}")
        warnings.append("Schedule LLM returned invalid JSON — using fallback draft.")
        draft = _fallback_schedule(state, retrieved)
    except ValidationError as e:
        logger.error(f"[Node 5 Schedule] Schema validation error: {e}")
        warnings.append("Schedule LLM returned invalid schedule schema — using fallback draft.")
        draft = _fallback_schedule(state, retrieved)

    draft = _ensure_required_places(draft, state, retrieved)

    return {
        "draft_schedule":    draft,
        "schedule_version":  version + 1,
        "violations":        [],
        "validation_passed": False,
        "warnings":          warnings,
    }


def _parse_hours(hours: str | None) -> tuple[int, int] | None:
    """Module-level alias for time_utils.parse_hours.

    Kept so external callers (tests via load_schedule_helpers) keep working
    after the body moved into app.services.time_utils.
    """
    return _parse_hours_util(hours)


def _hms(t: str) -> int:
    """Slot time 'HH:MM' → minutes since midnight. Raises on bad input
    (callers in this module always pass valid HH:MM)."""
    parsed = _hms_safe(t)
    if parsed is None:
        raise ValueError(f"invalid time: {t!r}")
    return parsed


def _time_or(value: str | None, fallback: int) -> int:
    return _time_or_util(value, fallback)


def _fmt_minutes(minutes: int) -> str:
    return _fmt_minutes_util(minutes)


def _slot_bucket(slot_start: str) -> str:
    """Map slot start time → best_time_of_day bucket the DB uses
    ('morning', 'afternoon', 'evening', 'night')."""
    minutes = _hms(slot_start)
    if minutes < 11 * 60:
        return "morning"
    if minutes < 17 * 60:
        return "afternoon"
    if minutes < 21 * 60:
        return "evening"
    return "night"


def _fits(item: dict, slot_start: str, slot_end: str) -> bool:
    """True if the venue's opening hours cover the slot window."""
    return _fits_util(item.get("hours"), slot_start, slot_end)


def _place_notes(place: dict) -> str:
    sub_attractions = [
        str(item).strip()
        for item in (place.get("sub_attractions") or [])
        if str(item).strip()
    ]
    if sub_attractions:
        return " · ".join(sub_attractions)
    tags = {
        ascii_fold(str(tag)).replace("_", "-")
        for tag in (place.get("tags") or [])
        if str(tag).strip()
    }
    if tags & {"shopping", "local-market", "souvenirs", "specialty-food"}:
        return "Mua đặc sản/quà"
    return ""


def _has_place(draft: dict, place: dict) -> bool:
    place_id = str(place.get("id") or "")
    place_name = str(place.get("name") or "").strip().lower()
    for day in draft.get("days", []):
        for slot in day.get("slots", []):
            slot_place_id = str(slot.get("place_id") or "")
            slot_place_name = str(slot.get("place_name") or "").strip().lower()
            if place_id and slot_place_id == place_id:
                return True
            if place_name and slot_place_name == place_name:
                return True
    return False


def _has_full_day_place(draft: dict, place: dict) -> bool:
    place_id = str(place.get("id") or "")
    place_name = str(place.get("name") or "").strip().lower()
    for day in draft.get("days", []):
        for slot in day.get("slots", []):
            slot_place_id = str(slot.get("place_id") or "")
            slot_place_name = str(slot.get("place_name") or "").strip().lower()
            if slot.get("slot_type") != "full_day_activity":
                continue
            if place_id and slot_place_id == place_id:
                return True
            if place_name and slot_place_name == place_name:
                return True
    return False


def _remove_place(draft: dict, place: dict) -> None:
    place_id = str(place.get("id") or "")
    place_name = str(place.get("name") or "").strip().lower()
    if not place_id and not place_name:
        return
    for day in draft.get("days", []):
        slots = []
        for slot in day.get("slots", []):
            slot_place_id = str(slot.get("place_id") or "")
            slot_place_name = str(slot.get("place_name") or "").strip().lower()
            if (place_id and slot_place_id == place_id) or (place_name and slot_place_name == place_name):
                continue
            slots.append(slot)
        day["slots"] = slots


def _free_slot(start: str, end: str, slot_type: str, place_name: str, notes: str = "", price_vnd: int = 0) -> dict:
    return {
        "start": start,
        "end": end,
        "slot_type": slot_type,
        "place_id": None,
        "place_name": place_name,
        "price_vnd": price_vnd,
        "notes": notes,
    }


def _activity_slot_type(place: dict, fallback: str = "afternoon_activity") -> str:
    best_time = str(place.get("best_time_of_day") or "").lower()
    tags = {
        ascii_fold(str(tag)).replace("_", "-")
        for tag in (place.get("tags") or [])
        if str(tag).strip()
    }
    if "night-view" in tags or "fire-show" in tags or best_time == "evening":
        return "evening_activity"
    if best_time == "morning":
        return "morning_activity"
    if best_time == "afternoon":
        return "afternoon_activity"
    return fallback


def _slot_for_required_place(place: dict, start: str, end: str, slot_type: str | None = None) -> dict:
    return {
        "start": start,
        "end": end,
        "slot_type": slot_type or _activity_slot_type(place),
        "place_id": place.get("id"),
        "place_name": place.get("name"),
        "price_vnd": int(place.get("base_price") or 0),
        "notes": _place_notes(place),
    }


def _replace_slot_with_required(day: dict, place: dict) -> bool:
    slots = list(day.get("slots") or [])
    preferred_type = _activity_slot_type(place)
    candidate_types = [preferred_type, "morning_activity", "afternoon_activity", "evening_activity", "evening", "buffer"]
    required_ids = {
        str(required.get("id") or "")
        for required in day.get("_required_places", [])
    }

    for slot_type in candidate_types:
        for slot in slots:
            if slot.get("slot_type") != slot_type:
                continue
            if str(slot.get("place_id") or "") in required_ids:
                continue
            start = slot.get("start") or ("20:00" if preferred_type == "evening_activity" else "09:00")
            end = slot.get("end") or ("21:00" if preferred_type == "evening_activity" else "10:30")
            slot.clear()
            slot.update(_slot_for_required_place(place, start, end, preferred_type))
            return True
    return False


def _append_required_slot(day: dict, place: dict) -> None:
    slot_type = _activity_slot_type(place)
    if slot_type == "morning_activity":
        slot = _slot_for_required_place(place, "09:00", "10:30", slot_type)
    elif slot_type == "evening_activity":
        slot = _slot_for_required_place(place, "20:00", "21:00", slot_type)
    else:
        slot = _slot_for_required_place(place, "15:00", "16:30", slot_type)
    day.setdefault("slots", []).append(slot)
    day["slots"] = sorted(day["slots"], key=lambda item: item.get("start") or "")


def _lunch_at_full_day_venue(lunch_slot: dict, full_day_place: dict) -> bool:
    """True if a lunch slot is logistically at (or inside) the full-day venue.

    A traveller spending 08:30-17:00 at Bà Nà Hills cannot drive down to a
    seafood place in Mỹ Khê at noon. We keep the existing lunch only when
    its place / notes share enough name tokens with the full-day venue's
    name, area, or sub_attractions — using token overlap instead of plain
    substring so "Beer Plaza Ba Na" matches "Bà Nà Hills".
    """
    needle_tokens: set[str] = set()
    for src in (
        full_day_place.get("name"),
        full_day_place.get("area"),
        *(full_day_place.get("sub_attractions") or []),
    ):
        if src:
            needle_tokens.update(ascii_fold(str(src)).split())
    needle_tokens.discard("")
    if not needle_tokens:
        return False

    haystack_tokens: set[str] = set()
    for src in (lunch_slot.get("place_name"), lunch_slot.get("notes")):
        if src:
            haystack_tokens.update(ascii_fold(str(src)).split())
    haystack_tokens.discard("")
    if not haystack_tokens:
        return False

    # Require ≥2 overlapping tokens so single-word coincidences ("nhà",
    # "tại") don't pass. For one-word venue names, fall back to 1 overlap.
    overlap = needle_tokens & haystack_tokens
    return len(overlap) >= min(2, len(needle_tokens))


def _ensure_required_places(draft: dict, state: dict, retrieved: dict) -> dict:
    """Ensure explicitly requested places are present.

    The LLM can optimize, but it cannot silently drop places the user marked as
    required. This post-process is generic: it works for Dragon Bridge, APEC
    Park, Bà Nà, temples, golf clubs, and any future place in DB.
    """
    required_places = list(state.get("required_places") or retrieved.get("required_places") or [])
    if not required_places:
        return draft

    days = draft.get("days") or []
    if not days:
        return draft
    for day in days:
        day["_required_places"] = required_places

    available_days = [day for day in days if day.get("day_type") == "standard"] or days
    day_cursor = 0
    for place in required_places:
        if _has_full_day_place(draft, place):
            continue
        if int(place.get("duration_min") or 0) < 240:
            continue
        target_day = available_days[min(day_cursor, len(available_days) - 1)]
        day_cursor += 1
        _remove_place(draft, place)
        slots = list(target_day.get("slots") or [])
        breakfast = next((slot for slot in slots if slot.get("slot_type") == "breakfast"), None)
        existing_lunch = next((slot for slot in slots if slot.get("slot_type") == "lunch"), None)
        dinner = next((slot for slot in slots if slot.get("slot_type") == "dinner"), None)
        # Keep existing lunch ONLY if it is at the full-day venue itself —
        # otherwise the schedule asks the traveller to leave Bà Nà for a seafood
        # joint in Mỹ Khê at noon. Default to a generic on-site meal.
        if existing_lunch and _lunch_at_full_day_venue(existing_lunch, place):
            lunch = existing_lunch
        else:
            lunch = _free_slot("12:00", "13:00", "lunch", f"Ăn trưa tại {place.get('name') or 'điểm tham quan'}")
        target_day["slots"] = sorted([
            breakfast or _free_slot("07:30", "08:15", "breakfast", "Ăn sáng trước khi đi điểm cả ngày"),
            _slot_for_required_place(place, "08:30", "17:00", "full_day_activity"),
            lunch,
            dinner or _free_slot("18:30", "20:00", "dinner", "Ăn tối sau khi về trung tâm"),
        ], key=lambda slot: slot.get("start") or "")

    non_full_days = [
        day
        for day in days
        if not any(slot.get("slot_type") == "full_day_activity" for slot in day.get("slots", []))
    ] or days
    for place in required_places:
        if _has_place(draft, place):
            continue
        target_days = non_full_days if int(place.get("duration_min") or 0) < 240 else available_days
        inserted = False
        for day in target_days:
            if _replace_slot_with_required(day, place):
                inserted = True
                break
        if not inserted:
            _append_required_slot(target_days[0], place)

    for day in days:
        day.pop("_required_places", None)
    return draft


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

    style = str(state.get("travel_style") or "balanced").strip().lower()
    if style == "standard":
        style = "balanced"
    if style not in {"relaxed", "balanced", "active"}:
        style = "balanced"

    profiles = {
        "relaxed": {
            "day_start": 9 * 60,
            "day_end": 20 * 60 + 30,
            "buffer": 50,
            "lunch_start": 12 * 60 + 15,
            "lunch_dur": 105,
            "dinner_start": 19 * 60,
            "max_standard_activities": 2,
            "arrival_activities": 1,
        },
        "balanced": {
            "day_start": 8 * 60 + 30,
            "day_end": 21 * 60,
            "buffer": 35,
            "lunch_start": 11 * 60 + 45,
            "lunch_dur": 90,
            "dinner_start": 18 * 60,
            "max_standard_activities": 3,
            "arrival_activities": 1,
        },
        "active": {
            "day_start": 7 * 60 + 30,
            "day_end": 22 * 60,
            "buffer": 25,
            "lunch_start": 11 * 60 + 15,
            "lunch_dur": 60,
            "dinner_start": 18 * 60 + 30,
            "max_standard_activities": 4,
            "arrival_activities": 2,
        },
    }
    profile = profiles[style]
    day_start = _time_or(state.get("daily_start_time"), profile["day_start"])
    day_end = _time_or(state.get("daily_end_time"), profile["day_end"])
    if day_end <= day_start + 4 * 60:
        day_end = profile["day_end"]
    buffer_min = profile["buffer"]

    def _slot(start, end, slot_type, place=None, notes=""):
        s = {"start": start, "end": end, "slot_type": slot_type, "notes": notes}
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

    def _append_activity(slots: list[dict], slot_type: str, pool: list[dict], start_min: int, latest_end: int) -> int:
        if start_min >= latest_end:
            return start_min
        place = _pick(pool, _fmt_minutes(start_min), _fmt_minutes(min(start_min + 90, latest_end)))
        if not place:
            return start_min
        duration = int(place.get("duration_min") or 90)
        duration = max(45, min(duration, 180))
        end_min = min(start_min + duration, latest_end)
        if end_min - start_min < 45:
            return start_min
        slots.append(_slot(_fmt_minutes(start_min), _fmt_minutes(end_min), slot_type, place))
        return end_min + buffer_min

    def _append_meal(slots: list[dict], meal: str, start_min: int, duration: int = 75) -> int:
        if start_min >= day_end:
            return start_min
        end_min = min(start_min + duration, day_end)
        place = _pick(food, _fmt_minutes(start_min), _fmt_minutes(end_min))
        if place:
            slots.append(_slot(_fmt_minutes(start_min), _fmt_minutes(end_min), meal, place))
        else:
            label = {"breakfast": "Ăn sáng tự do", "lunch": "Ăn trưa tự do", "dinner": "Ăn tối tự do"}.get(meal, "Ăn tự do")
            slots.append(_slot(_fmt_minutes(start_min), _fmt_minutes(end_min), meal, {"id": "", "name": label, "base_price": 0}))
        return end_min + buffer_min

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
            slots = []
            cur = _time_or(state.get("arrival_time"), max(15 * 60, day_start))
            if cur <= profile["lunch_start"] and day_end - cur >= 3 * 60:
                lunch_start = max(profile["lunch_start"], cur + 30)
                cur = _append_meal(slots, "lunch", lunch_start, profile["lunch_dur"])
            latest_activity_end = min(profile["dinner_start"] - buffer_min, day_end)
            for _ in range(profile["arrival_activities"]):
                next_cur = _append_activity(slots, "afternoon_activity", places, cur, latest_activity_end)
                if next_cur == cur:
                    break
                cur = next_cur
            if profile["dinner_start"] < day_end:
                cur = _append_meal(slots, "dinner", max(profile["dinner_start"], cur), 90)
            if cur < day_end:
                slots.append(_slot(_fmt_minutes(cur), _fmt_minutes(day_end), "evening", notes="Thời gian tự do"))
        elif day_type == "departure":
            slots = []
            departure_time = _time_or(state.get("departure_time"), 11 * 60)
            latest_end = max(day_start + 90, departure_time - 60)
            cur = day_start
            if cur <= 9 * 60 + 30 and latest_end - cur >= 60:
                cur = _append_meal(slots, "breakfast", cur, 60)
            _append_activity(slots, "morning_activity", places, cur, latest_end)
            if latest_end < departure_time:
                slots.append(_slot(_fmt_minutes(latest_end), _fmt_minutes(departure_time), "buffer", notes="Di chuyển/checkout"))
        else:
            slots = []
            cur = day_start
            if cur <= 9 * 60 + 30:
                cur = _append_meal(slots, "breakfast", cur, 60)
            activity_limit = profile["max_standard_activities"]
            morning_cutoff = profile["lunch_start"] - buffer_min
            if activity_limit > 0:
                start_min = max(cur, day_start + 60)
                next_cur = _append_activity(slots, "morning_activity", places, start_min, morning_cutoff)
                if next_cur > start_min:
                    cur = next_cur
                    activity_limit -= 1
            cur = _append_meal(slots, "lunch", max(profile["lunch_start"], cur), profile["lunch_dur"])
            afternoon_cutoff = min(profile["dinner_start"] - buffer_min, day_end)
            while activity_limit > 0 and cur < afternoon_cutoff:
                next_cur = _append_activity(slots, "afternoon_activity", places, cur, afternoon_cutoff)
                if next_cur == cur:
                    break
                cur = next_cur
                activity_limit -= 1
            if profile["dinner_start"] < day_end:
                cur = _append_meal(slots, "dinner", max(profile["dinner_start"], cur), 90)
            if cur < day_end and style != "active":
                slots.append(_slot(_fmt_minutes(cur), _fmt_minutes(day_end), "evening", notes="Thời gian tự do"))
        days.append({
            "day_num": day_num,
            "day_type": day_type,
            "date_str": _date_str(day_num),
            "hotel": hotel,
            "slots": slots,
        })

    return _ensure_required_places({"days": days}, state, retrieved)
