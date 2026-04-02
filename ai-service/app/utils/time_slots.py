"""
app/utils/time_slots.py

Time slot templates and builder for daily itinerary structure.
Maps pre-decided attractions + food venues onto concrete HH:MM time slots.
"""

from __future__ import annotations
from datetime import datetime, timedelta
from copy import deepcopy

from app.models.decisions import TimeSlot, DayPlan, ScheduledAttraction, ScheduledMeal
from app.utils.geo_utils import compute_day_travel_total


# ---------------------------------------------------------------------------
# Slot-type templates
# ---------------------------------------------------------------------------

STANDARD_DAY_TEMPLATE: list[dict] = [
    {"start": "08:00", "end": "11:30", "slot_type": "morning_activity"},
    {"start": "11:30", "end": "13:00", "slot_type": "lunch"},
    {"start": "13:30", "end": "17:00", "slot_type": "afternoon_activity"},
    {"start": "17:00", "end": "17:30", "slot_type": "buffer",  "is_buffer": True},
    {"start": "18:00", "end": "19:30", "slot_type": "dinner"},
    {"start": "19:30", "end": "21:00", "slot_type": "evening"},
]

ARRIVAL_DAY_TEMPLATE: list[dict] = [
    {"start": "15:00", "end": "17:00", "slot_type": "afternoon_activity"},
    {"start": "17:00", "end": "17:30", "slot_type": "buffer", "is_buffer": True},
    {"start": "18:00", "end": "19:30", "slot_type": "dinner"},
    {"start": "19:30", "end": "21:00", "slot_type": "evening"},
]

LAST_DAY_TEMPLATE: list[dict] = [
    {"start": "07:00", "end": "08:00", "slot_type": "breakfast"},
    {"start": "08:00", "end": "10:30", "slot_type": "morning_activity"},
    {"start": "10:30", "end": "11:00", "slot_type": "buffer", "is_buffer": True},
]

FULL_DAY_TEMPLATE: list[dict] = [
    {"start": "07:00", "end": "07:30", "slot_type": "breakfast"},
    {"start": "08:00", "end": "17:00", "slot_type": "full_day_activity"},
    {"start": "17:30", "end": "18:00", "slot_type": "buffer", "is_buffer": True},
    {"start": "18:00", "end": "19:30", "slot_type": "dinner"},
]

# Slot types that accept an attraction
ACTIVITY_SLOT_TYPES = {"morning_activity", "afternoon_activity", "full_day_activity"}
# Slot types that accept a meal
MEAL_SLOT_TYPES = {"breakfast", "lunch", "dinner"}


def _slots_from_template(template: list[dict]) -> list[TimeSlot]:
    return [
        TimeSlot(
            start=t["start"],
            end=t["end"],
            slot_type=t["slot_type"],
            is_buffer=t.get("is_buffer", False),
        )
        for t in template
    ]


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------

def build_daily_time_slots(
    daily_schedule: dict[int, list[dict]],
    food_map: dict[int, dict[str, list[dict]]],
    num_days: int,
    destination: str,
    departure_date: str = "",
    combo_result: dict | None = None,
) -> list[DayPlan]:
    """
    Build a list of DayPlan objects — one per day of the trip.

    Parameters
    ----------
    daily_schedule : {day_num: [attraction_dict, ...]}
    food_map       : {day_num: {meal_type: [venue_dict, ...]}}
    num_days       : total days
    destination    : city name for travel-time estimates
    departure_date : "YYYY-MM-DD" for date labels
    combo_result   : combo engine output (used to mark combo_covered lunch slots)
    """
    day_plans: list[DayPlan] = []
    combo_includes_lunch = (
        (combo_result or {}).get("best_combo") is not None
        and (combo_result or {}).get("use_combo", False)
        and getattr((combo_result or {}).get("best_combo"), "includes_lunch", False)
    )

    # Date helper
    try:
        dep_dt = datetime.strptime(departure_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        dep_dt = None

    for day_n in range(1, num_days + 1):
        attrs = daily_schedule.get(day_n, [])
        meals = food_map.get(day_n, {})

        # Determine day type
        has_full_day = any(a.get("full_day") for a in attrs)
        if day_n == 1:
            day_type = "arrival"
            template = ARRIVAL_DAY_TEMPLATE
        elif day_n == num_days:
            day_type = "departure"
            template = LAST_DAY_TEMPLATE
        elif has_full_day:
            day_type = "full_day"
            template = FULL_DAY_TEMPLATE
        else:
            day_type = "standard"
            template = STANDARD_DAY_TEMPLATE

        slots = _slots_from_template(template)

        # Assign attractions to activity slots
        attr_queue = list(attrs)
        for slot in slots:
            if slot.slot_type in ACTIVITY_SLOT_TYPES and attr_queue:
                raw = attr_queue.pop(0)
                slot.attraction = ScheduledAttraction(
                    name=raw.get("name", ""),
                    address=raw.get("address", "(cần xác nhận)"),
                    area=raw.get("area", "unknown"),
                    price_per_person=raw.get("price_per_person", 0),
                    cost_for_group=raw.get("cost_for_group", 0),
                    hours=raw.get("hours", ""),
                    free=raw.get("free", False),
                    full_day=raw.get("full_day", False),
                    is_combo=raw.get("is_combo", False),
                )

        # Assign meals to meal slots
        meal_type_order: dict[str, str] = {
            "breakfast": "breakfast",
            "lunch":     "lunch",
            "dinner":    "dinner",
        }
        # map slot_type → meal_type (same name in this case)
        for slot in slots:
            if slot.slot_type not in MEAL_SLOT_TYPES:
                continue
            meal_type = meal_type_order.get(slot.slot_type)
            if not meal_type:
                continue
            venues = meals.get(meal_type, [])
            if venues:
                v = venues[0]
                slot.meal = ScheduledMeal(
                    name=v.get("name", ""),
                    address=v.get("address", ""),
                    specialty=v.get("specialty", ""),
                    price=v.get("price", ""),
                    meal_type=meal_type,
                )
            # Mark combo-covered lunch
            if meal_type == "lunch" and combo_includes_lunch:
                slot.combo_covered = True

        # Compute travel total
        travel_total = compute_day_travel_total(slots, destination)

        # Compute buffer total
        buffer_min = 0
        for slot in slots:
            if slot.is_buffer:
                try:
                    start_h, start_m = map(int, slot.start.split(":"))
                    end_h, end_m     = map(int, slot.end.split(":"))
                    buffer_min += (end_h * 60 + end_m) - (start_h * 60 + start_m)
                except ValueError:
                    pass

        # If buffer_min < 30 on a standard day, convert last evening slot to buffer
        if day_type == "standard" and buffer_min < 30:
            for slot in reversed(slots):
                if slot.slot_type == "evening" and not slot.is_buffer:
                    slot.is_buffer = True
                    slot.slot_type = "buffer"
                    slot.attraction = None
                    slot.meal = None
                    try:
                        start_h, start_m = map(int, slot.start.split(":"))
                        end_h, end_m     = map(int, slot.end.split(":"))
                        buffer_min += (end_h * 60 + end_m) - (start_h * 60 + start_m)
                    except ValueError:
                        pass
                    break

        # Date label
        date_str = ""
        if dep_dt:
            d = dep_dt + timedelta(days=day_n - 1)
            date_str = d.strftime("%a %d/%m/%Y")

        # Primary area (first attraction's area)
        primary_area = "center"
        for slot in slots:
            if slot.attraction:
                primary_area = slot.attraction.area
                break

        day_plans.append(DayPlan(
            day_num=day_n,
            date_str=date_str,
            day_type=day_type,
            slots=slots,
            primary_area=primary_area,
            travel_total_min=travel_total,
            buffer_min=buffer_min,
        ))

    return day_plans


def build_brief_from_day_plans(day_plans: list[DayPlan], decisions: dict) -> str:
    """
    Convert list[DayPlan] → time-annotated brief string for Planner.
    Includes HH:MM slots, travel estimates, buffer indicators.
    """
    lines: list[str] = ["=== BRIEF ĐÃ QUYẾT ĐỊNH (Python) ===\n"]
    food_per_meal = decisions.get("food_per_meal_vnd", 80_000)

    for day in day_plans:
        day_label = f"Ngày {day.day_num}"
        if day.date_str:
            day_label += f" ({day.date_str})"
        day_label += f" — {day.day_type}"
        lines.append(f"\n{day_label}:")
        lines.append(f"  📊 Di chuyển: ~{day.travel_total_min} phút | Buffer: {day.buffer_min} phút")

        for slot in day.slots:
            time_range = f"{slot.start}-{slot.end}"
            if slot.is_buffer:
                lines.append(f"  {time_range} ☕ Buffer — nghỉ ngơi / cafe")
            elif slot.attraction:
                a = slot.attraction
                full_tag = " [CẢ NGÀY — 07:00-17:00]" if a.full_day else ""
                combo_tag = " [COMBO]" if a.is_combo else ""
                price_str = "miễn phí" if a.free else f"{a.price_per_person:,} VND/người"
                lines.append(f"  {time_range} 📍 {a.name}{full_tag}{combo_tag} [{a.area}]")
                lines.append(f"           Địa chỉ: {a.address or '(cần xác nhận)'}")
                lines.append(f"           Vé: {price_str} | Giờ: {a.hours or '7:00-17:00'}")
            elif slot.meal:
                m = slot.meal
                meal_icons = {"breakfast": "🌅", "lunch": "☀️", "dinner": "🌙"}
                icon = meal_icons.get(m.meal_type, "🍜")
                combo_note = " [combo — bữa trưa bao gồm]" if slot.combo_covered else ""
                price_str = m.price or f"~{food_per_meal:,} VND/người"
                lines.append(f"  {time_range} {icon} {m.meal_type.title()}: {m.name}{combo_note}")
                lines.append(f"           Địa chỉ: {m.address or '(khu vực địa phương)'}")
                lines.append(f"           Giá: {price_str}")
                if m.specialty:
                    lines.append(f"           Món: {m.specialty}")
            elif slot.slot_type == "evening":
                lines.append(f"  {time_range} 🌙 Tự do — chợ đêm / phố đi bộ / nghỉ ngơi")

    return "\n".join(lines)
