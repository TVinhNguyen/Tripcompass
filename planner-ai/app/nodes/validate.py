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
from app.state import TravelPlanState

# Slots that count toward food budget (not attraction budget)
FOOD_SLOT_TYPES = {"breakfast", "lunch", "dinner"}

# Slots that are pure buffer / travel time — no place attached
BUFFER_SLOT_TYPES = {"buffer", "evening", "transit"}


def _parse_hours(hours_str: str) -> tuple[int, int]:
    """Parse "08:00-17:00" → (480, 1020) in minutes since midnight."""
    try:
        open_part, close_part = hours_str.split("-")
        oh, om = map(int, open_part.strip().split(":"))
        ch, cm = map(int, close_part.strip().split(":"))
        return oh * 60 + om, ch * 60 + cm
    except Exception:
        return 0, 24 * 60  # treat as always open on parse error


def _time_to_mins(t: str) -> int:
    """Convert "14:30" → 870."""
    try:
        h, m = map(int, t.split(":"))
        return h * 60 + m
    except Exception:
        return 0


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

    # Track across days
    seen_place_ids: dict[str, int] = {}  # id → first day_num
    total_attr_spend = 0

    for day in days:
        day_num = day.get("day_num", "?")
        slots   = day.get("slots", [])
        day_times: list[tuple[int, int, str]] = []  # (start_min, end_min, name)

        for slot in slots:
            slot_type  = slot.get("slot_type", "")
            place_id   = str(slot.get("place_id", "")) if slot.get("place_id") else None
            place_name = slot.get("place_name", "unknown")
            price_vnd  = slot.get("price_vnd", 0) or 0
            start_str  = slot.get("start", "")
            end_str    = slot.get("end", "")

            if slot_type in BUFFER_SLOT_TYPES or not place_id:
                continue

            # ── 1. HALLUCINATED_PLACE ──────────────────────────────────────
            if place_id not in valid_ids:
                violations.append({
                    "type":    "HALLUCINATED_PLACE",
                    "day":     day_num,
                    "place":   place_name,
                    "message": f"'{place_name}' không có trong danh sách địa điểm được retrieve. LLM có thể đã bịa.",
                })
                continue  # skip further checks on this slot

            place = place_index[place_id]

            # ── 2. CLOSED_HOURS ────────────────────────────────────────────
            hours = place.get("hours", "") or place.get("opening_hours", "")
            breakfast_exempt = slot_type == "breakfast"
            if hours and not breakfast_exempt and "00:00-24:00" not in hours:
                open_min, close_min = _parse_hours(hours)
                slot_start = _time_to_mins(start_str)
                slot_end   = _time_to_mins(end_str) if end_str else slot_start
                if slot_start < open_min or slot_end > close_min:
                    violations.append({
                        "type":    "CLOSED_HOURS",
                        "day":     day_num,
                        "place":   place_name,
                        "message": f"'{place_name}' m\u1edf c\u1eeda {hours} nh\u01b0ng "
                                   f"\u0111\u01b0\u1ee3c x\u1ebfp {start_str}\u2013{end_str}.",
                    })

            # ── 3. DUPLICATE_PLACE ─────────────────────────────────────────
            if place_id in seen_place_ids:
                first_day = seen_place_ids[place_id]
                if first_day != day_num:
                    violations.append({
                        "type":    "DUPLICATE_PLACE",
                        "day":     day_num,
                        "place":   place_name,
                        "message": f"'{place_name}' xuất hiện ở cả ngày {first_day} và ngày {day_num}.",
                    })
            else:
                seen_place_ids[place_id] = day_num

            # ── 4. Track attraction spend ──────────────────────────────────
            if slot_type not in FOOD_SLOT_TYPES:
                total_attr_spend += price_vnd

            # ── 5. Collect times for overlap check ─────────────────────────
            if start_str and end_str:
                day_times.append((_time_to_mins(start_str), _time_to_mins(end_str), place_name))

        # ── 6. TIME_OVERLAP (within day) ──────────────────────────────────
        day_times.sort(key=lambda x: x[0])
        for i in range(len(day_times) - 1):
            _, end_a, name_a = day_times[i]
            start_b, _, name_b = day_times[i + 1]
            if end_a > start_b:
                violations.append({
                    "type":    "TIME_OVERLAP",
                    "day":     day_num,
                    "place":   f"{name_a} / {name_b}",
                    "message": f"'{name_a}' kết thúc {end_a//60:02d}:{end_a%60:02d} "
                               f"nhưng '{name_b}' bắt đầu lúc {start_b//60:02d}:{start_b%60:02d}.",
                })

    # ── 7. OVER_BUDGET ────────────────────────────────────────────────────
    if attr_budget > 0 and total_attr_spend > attr_budget:
        violations.append({
            "type":    "OVER_BUDGET",
            "day":     "all",
            "message": (
                f"Tổng chi phí attractions {total_attr_spend:,}đ "
                f"vượt quá budget {attr_budget:,}đ."
            ),
        })

    passed = len(violations) == 0
    return {
        "violations":        violations,
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
    if state.get("retry_count", 0) >= config.MAX_SCHEDULE_RETRIES:
        return "enrich"   # proceed with best-effort plan + warnings
    return "schedule"     # retry Node 5
