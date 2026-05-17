"""
Node 6: Hard Validate — Code only, no LLM.
Migrated from Go validator.go.

Catches objective errors in LLM-generated schedules:
- OVER_BUDGET: total attraction spend exceeds budget
- HALLUCINATED_PLACE: LLM invented a place not in retrieved data
- CLOSED_HOURS: place scheduled outside opening hours
- DUPLICATE_PLACE: same place appears on multiple days
- TIME_OVERLAP: activities overlap within a day
"""
from __future__ import annotations
import math

from app.state import TravelPlanState
from app.services.time_utils import (
    to_minutes as _to_minutes_safe,
    slot_fits_hours as _fits_hours_util,
)

# Slots that count toward food budget (not attraction budget)
FOOD_SLOT_TYPES = {"breakfast", "lunch", "dinner"}

# Slots that are pure buffer / travel time — no place attached
BUFFER_SLOT_TYPES = {"buffer", "evening", "transit"}
EARTH_RADIUS_KM = 6371.0

RETRYABLE_VIOLATION_TYPES = {
    "HALLUCINATED_PLACE",
    "INCOMPLETE_SCHEDULE",
    "INVALID_TIME_RANGE",
    "CLOSED_HOURS",
    "TIME_OVERLAP",
    "INSUFFICIENT_TRAVEL_TIME",
    "REQUIRED_PLACE_MISSING",
}


def _violation(
    violation_type: str,
    day,
    message: str,
    place: str | None = None,
) -> dict:
    retryable = violation_type in RETRYABLE_VIOLATION_TYPES
    violation = {
        "type": violation_type,
        "rule": violation_type,
        "severity": "error" if retryable else "warning",
        "retryable": retryable,
        "day": day,
        "message": message,
    }
    if place is not None:
        violation["place"] = place
    return violation


def _time_to_mins(t: str) -> int:
    """Convert 'HH:MM' → minutes since midnight. Returns 0 on bad input
    (matches legacy behavior — validator treats bad times as 00:00)."""
    parsed = _to_minutes_safe(t)
    return parsed if parsed is not None else 0


def _fits_hours(hours: str, start_str: str, end_str: str) -> bool:
    """Wrapper over time_utils.slot_fits_hours that accepts an end_str
    defaulting to start_str (preserves legacy validator behavior)."""
    return _fits_hours_util(hours, start_str, end_str or start_str)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two lat/lng points in kilometers."""
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) * math.sin(d_lat / 2)
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) * math.sin(d_lng / 2)
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def _estimate_travel_min(km: float) -> int:
    """Estimate travel minutes at ~30km/h, with a 5-minute minimum."""
    if km < 0.3:
        return 5
    return max(5, math.ceil(km / 30.0 * 60.0))


def _coords(place: dict) -> tuple[float, float] | None:
    lat = place.get("latitude")
    lng = place.get("longitude")
    if lat is None or lng is None:
        lat = place.get("lat")
        lng = place.get("lng")
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None
    if lat_f == 0 and lng_f == 0:
        return None
    return lat_f, lng_f


def _build_place_index(retrieved: dict) -> dict[str, dict]:
    """Build id → place dict from all retrieved data."""
    index: dict[str, dict] = {}
    for place in retrieved.get("places", []):
        index[str(place.get("id", ""))] = place
    for food in retrieved.get("food", []):
        index[str(food.get("id", ""))] = food
    return index


def node_validate(state: TravelPlanState) -> dict:
    """
    Node 6: Validate LLM-generated schedule against hard rules.
    Returns violations list; if empty → validation_passed = True.
    Retry counter increments only when violations exist.
    """
    violations: list[dict] = []
    schedule   = state.get("draft_schedule", {})
    retrieved  = state.get("retrieved_data", {})
    attr_budget = state.get("attr_budget", 0)

    days: list[dict] = schedule.get("days", [])
    place_index = _build_place_index(retrieved)
    valid_ids   = set(place_index.keys())
    expected_days = state.get("num_days", 0)

    try:
        expected_days = int(expected_days)
    except (TypeError, ValueError):
        expected_days = 0

    if not days:
        violations.append(_violation(
            "INCOMPLETE_SCHEDULE",
            "all",
            "Schedule không có ngày nào.",
        ))
    elif expected_days > 0 and len(days) != expected_days:
        violations.append(_violation(
            "INCOMPLETE_SCHEDULE",
            "all",
            f"Schedule có {len(days)} ngày nhưng yêu cầu {expected_days} ngày.",
        ))

    # Track across days
    seen_place_ids: dict[str, int] = {}  # id → first day_num
    scheduled_place_ids: set[str] = set()
    total_attr_spend = 0

    for day in days:
        day_num = day.get("day_num", "?")
        slots   = day.get("slots", [])
        day_times: list[tuple[int, int, str]] = []  # (start_min, end_min, name)
        route_slots: list[tuple[int, int, str, dict]] = []  # (start_min, end_min, name, place)

        for slot in slots:
            slot_type  = slot.get("slot_type", "")
            place_id   = str(slot.get("place_id", "")) if slot.get("place_id") else None
            place_name = slot.get("place_name", "unknown")
            price_vnd  = slot.get("price_vnd", 0) or 0
            start_str  = slot.get("start", "")
            end_str    = slot.get("end", "")

            invalid_time = False
            if start_str and end_str:
                start_min = _time_to_mins(start_str)
                end_min = _time_to_mins(end_str)
                if end_min < start_min:
                    violations.append(_violation(
                        "INVALID_TIME_RANGE",
                        day_num,
                        (
                            f"'{place_name}' có khung giờ {start_str}–{end_str} qua nửa đêm. "
                            "Mỗi slot phải nằm trong cùng một ngày; hãy kết thúc trước 23:59 "
                            "hoặc chuyển phần sau nửa đêm sang ngày kế tiếp."
                        ),
                        place_name,
                    ))
                    invalid_time = True

            if slot_type in BUFFER_SLOT_TYPES or not place_id:
                continue
            scheduled_place_ids.add(place_id)

            # ── 1. HALLUCINATED_PLACE ──────────────────────────────────────
            if place_id not in valid_ids:
                violations.append(_violation(
                    "HALLUCINATED_PLACE",
                    day_num,
                    f"'{place_name}' không có trong danh sách địa điểm được retrieve. LLM có thể đã bịa.",
                    place_name,
                ))
                continue  # skip further checks on this slot

            place = place_index[place_id]

            # ── 2. CLOSED_HOURS ────────────────────────────────────────────
            hours = place.get("hours", "") or place.get("opening_hours", "")
            breakfast_exempt = slot_type == "breakfast"
            if hours and not breakfast_exempt and "00:00-24:00" not in hours:
                if not _fits_hours(hours, start_str, end_str):
                    violations.append(_violation(
                        "CLOSED_HOURS",
                        day_num,
                        f"'{place_name}' mở cửa {hours} nhưng "
                        f"được xếp {start_str}–{end_str}.",
                        place_name,
                    ))

            # ── 3. DUPLICATE_PLACE ─────────────────────────────────────────
            if place_id in seen_place_ids:
                first_day = seen_place_ids[place_id]
                if first_day != day_num:
                    violations.append(_violation(
                        "DUPLICATE_PLACE",
                        day_num,
                        f"'{place_name}' xuất hiện ở cả ngày {first_day} và ngày {day_num}.",
                        place_name,
                    ))
            else:
                seen_place_ids[place_id] = day_num

            # ── 4. Track attraction spend ──────────────────────────────────
            if slot_type not in FOOD_SLOT_TYPES:
                total_attr_spend += price_vnd

            # ── 5. Collect times for overlap check (skip if range was invalid) ─
            if start_str and end_str and not invalid_time:
                day_times.append((start_min, end_min, place_name))
                if _coords(place):
                    route_slots.append((start_min, end_min, place_name, place))

        # ── 6. TIME_OVERLAP (within day) ──────────────────────────────────
        day_times.sort(key=lambda x: x[0])
        for i in range(len(day_times) - 1):
            _, end_a, name_a = day_times[i]
            start_b, _, name_b = day_times[i + 1]
            if end_a > start_b:
                violations.append(_violation(
                    "TIME_OVERLAP",
                    day_num,
                    f"'{name_a}' kết thúc {end_a//60:02d}:{end_a%60:02d} "
                    f"nhưng '{name_b}' bắt đầu lúc {start_b//60:02d}:{start_b%60:02d}.",
                    f"{name_a} / {name_b}",
                ))

        # ── 7. INSUFFICIENT_TRAVEL_TIME (within day) ──────────────────────
        route_slots.sort(key=lambda x: x[0])
        for i in range(len(route_slots) - 1):
            _, end_a, name_a, place_a = route_slots[i]
            start_b, _, name_b, place_b = route_slots[i + 1]
            coords_a = _coords(place_a)
            coords_b = _coords(place_b)
            if not coords_a or not coords_b:
                continue
            distance_km = _haversine_km(coords_a[0], coords_a[1], coords_b[0], coords_b[1])
            required_min = _estimate_travel_min(distance_km)
            gap_min = start_b - end_a
            if gap_min < required_min:
                violations.append(_violation(
                    "INSUFFICIENT_TRAVEL_TIME",
                    day_num,
                    (
                        f"'{name_a}' → '{name_b}' cần khoảng {required_min} phút di chuyển "
                        f"({distance_km:.1f}km) nhưng lịch chỉ chừa {gap_min} phút."
                    ),
                    f"{name_a} / {name_b}",
                ))

    # ── 8. OVER_BUDGET ────────────────────────────────────────────────────
    for required in state.get("required_places", []) or []:
        # state["required_places"] is resolved dicts; guard against accidental
        # pass-through of the parallel state["required_place_names"] (list[str]).
        if not isinstance(required, dict):
            continue
        required_id = str(required.get("id") or "")
        if required_id and required_id not in scheduled_place_ids:
            violations.append(_violation(
                "REQUIRED_PLACE_MISSING",
                "all",
                f"Lịch trình thiếu địa điểm bắt buộc '{required.get('name') or required_id}'.",
                required.get("name") or required_id,
            ))

    if attr_budget > 0 and total_attr_spend > attr_budget:
        violations.append(_violation(
            "OVER_BUDGET",
            "all",
            (
                f"Tổng chi phí attractions {total_attr_spend:,}đ "
                f"vượt quá budget {attr_budget:,}đ."
            ),
        ))

    passed = len(violations) == 0
    return {
        "violations":        violations,
        "retryable_violations": [v for v in violations if v.get("retryable")],
        "validation_passed": passed,
        "retry_count":       state.get("retry_count", 0) + (0 if passed else 1),
    }


def route_after_validate(state: TravelPlanState) -> str:
    """
    Conditional edge after Node 6.
    Returns: "enrich" (pass or max retries) | "schedule" (retry).
    """
    from app import config

    if state.get("validation_passed"):
        return "enrich"
    if state.get("retry_count", 0) > config.MAX_SCHEDULE_RETRIES:
        return "enrich"   # proceed with best-effort plan + warnings
    if not any(v.get("retryable") for v in state.get("violations", [])):
        return "enrich"
    return "schedule"     # retry Node 5
