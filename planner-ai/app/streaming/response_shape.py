"""
streaming/response_shape.py — Transform planner-ai output → frontend GenerateResponse shape.

Plan shape contract (done.plan):
  FE expects GenerateResponse: { days: DayPlan[], budget_recap: ..., ... }
  We UNWRAP any wrapper (planning_service returns {success, plan: {...}})
  so done.plan always has `days` at top-level.
"""
import json


_FOOD_SLOT_TYPES = {"breakfast", "lunch", "dinner", "snack", "brunch"}


def _slot_category(slot_type: str) -> str:
    """Map planner-ai slot_type → FE PlaceCategory."""
    return "FOOD" if (slot_type or "").lower() in _FOOD_SLOT_TYPES else "ATTRACTION"


def _to_fe_violation(raw: dict) -> dict:
    """Normalize planner-ai validator violations to frontend Violation shape."""
    rule = raw.get("rule") or raw.get("type") or "PLANNER_WARNING"
    severity = raw.get("severity")
    if severity == "hard":
        severity = "error"
    elif severity == "soft":
        severity = "warning"
    elif severity not in {"error", "warning"}:
        severity = "error" if raw.get("retryable") else "warning"

    day = raw.get("day")
    try:
        day_num = int(day)
    except (TypeError, ValueError):
        day_num = None

    violation = {
        "rule": rule,
        "severity": severity,
        "message": raw.get("message") or "Planner warning",
    }
    if day_num is not None:
        violation["day"] = day_num
    return violation


def _to_generate_response(wrapper: dict) -> dict | None:
    """Transform planner-ai wrapper → frontend GenerateResponse shape.

    Wrapper shape (from create_travel_plan tool):
      {success, destination, num_days, budget_tier, budget_breakdown,
       validation_passed, violations, warnings, plan: {days: [...]}, weather}

    GenerateResponse shape (frontend contract):
      {days: [{day_num, date_str, day_type, primary_area, travel_min, buffer_min,
               slots: [{start, end, slot_type, is_buffer, place?: {id, name, category, ...}}]}],
       budget_recap: {total_budget_vnd, attraction_spent_vnd, food_spent_vnd,
                      remaining_vnd, within_budget},
       budget_tier, violations, slot_template}
    """
    inner = wrapper.get("plan") if isinstance(wrapper, dict) else None
    if not isinstance(inner, dict) or not isinstance(inner.get("days"), list):
        return None

    destination = (wrapper.get("destination") or "").strip() or "Việt Nam"
    breakdown = wrapper.get("budget_breakdown") or {}
    num_days = int(wrapper.get("num_days") or len(inner["days"]) or 1)

    attr_spent = 0
    food_spent = 0
    days_out: list[dict] = []
    for raw_day in inner["days"]:
        if not isinstance(raw_day, dict):
            continue
        slots_out: list[dict] = []
        for raw_slot in raw_day.get("slots", []) or []:
            if not isinstance(raw_slot, dict):
                continue
            slot_type = raw_slot.get("slot_type", "")
            place_id = raw_slot.get("place_id")
            place_name = raw_slot.get("place_name")
            price = int(raw_slot.get("price_vnd") or 0)
            slot_out: dict = {
                "start": raw_slot.get("start", ""),
                "end": raw_slot.get("end", ""),
                "slot_type": slot_type,
                # FIXME: Semantic mismatch. FE uses is_buffer for "travel/buffer time".
                # Here we set it to True for empty slots (e.g. unassigned evening)
                # so that the frontend's savePlanAsItinerary will skip saving them,
                # which achieves the desired behavior but misuses the is_buffer field.
                "is_buffer": not (place_id and place_name),
            }
            notes = raw_slot.get("notes")
            if notes:
                slot_out["notes"] = notes
            if place_id and place_name:
                category = _slot_category(slot_type)
                # Omit lat/lng/cover_image — not available from create_travel_plan.
                # Activity row stores NULL; map can resolve via place_id later.
                slot_out["place"] = {
                    "id": place_id,
                    "name": place_name,
                    "category": category,
                    "base_price": price,
                    "duration_min": 0,
                    "is_must_visit": False,
                    "is_full_day": False,
                    "is_free": price == 0,
                }
                if category == "FOOD":
                    food_spent += price
                else:
                    attr_spent += price
            slots_out.append(slot_out)
        days_out.append({
            "day_num": raw_day.get("day_num", len(days_out) + 1),
            "date_str": raw_day.get("date_str", ""),
            "day_type": raw_day.get("day_type", "standard"),
            "primary_area": destination,
            "travel_min": 0,
            "buffer_min": 0,
            "slots": slots_out,
        })

    user_budget = int(wrapper.get("budget_vnd") or 0)
    hotel_per_night = int(breakdown.get("hotel_budget_per_night") or 0)
    hotel_total = hotel_per_night * max(num_days - 1, 0)

    if user_budget > 0:
        total_budget = user_budget
    else:
        total_budget = int(breakdown.get("attr_budget") or 0) + int(breakdown.get("food_budget") or 0) + hotel_total

    spent = attr_spent + food_spent
    if total_budget < spent and user_budget == 0:
        total_budget = spent

    return {
        "days": days_out,
        "budget_recap": {
            "total_budget_vnd": total_budget,
            "attraction_spent_vnd": attr_spent,
            "food_spent_vnd": food_spent,
            "remaining_vnd": max(total_budget - spent, 0),
            "within_budget": spent <= total_budget,
        },
        "budget_tier": wrapper.get("budget_tier", "standard"),
        "violations": [
            _to_fe_violation(v)
            for v in (wrapper.get("violations") or [])
            if isinstance(v, dict)
        ],
        "slot_template": "standard",
    }


def _extract_plan(raw: str) -> dict | None:
    """Parse plan JSON from tool output and transform to GenerateResponse shape.

    create_travel_plan returns:
      {"success": true, "destination": ..., "num_days": ..., "budget_breakdown": ...,
       "plan": {"days": [...]}, ...}

    FE (GenerateResponse) expects:
      {"days": [...], "budget_recap": {...}, "budget_tier": ..., ...}
    """
    if not raw:
        return None
    clean = raw.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        parsed = json.loads(clean)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(parsed, dict):
        return None

    # Case 1: planning_service wrapper {success, plan: {days: [...]}, ...}
    if isinstance(parsed.get("plan"), dict):
        return _to_generate_response(parsed)

    # Case 2: raw schedule {days: [...]} — wrap with empty metadata then transform
    if isinstance(parsed.get("days"), list):
        return _to_generate_response({"plan": parsed})

    return None
