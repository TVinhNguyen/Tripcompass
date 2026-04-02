"""
Typed Pydantic schemas for decision_engine output.
All scheduling decisions are stored here before being passed to the planner.
"""

from __future__ import annotations
from pydantic import BaseModel


class ScheduledAttraction(BaseModel):
    name: str
    address: str
    area: str = "unknown"
    price_per_person: int = 0
    cost_for_group: int = 0
    hours: str = ""
    free: bool = False
    full_day: bool = False
    is_combo: bool = False
    travel_min_from_center: int = 0


class ScheduledMeal(BaseModel):
    name: str
    address: str
    specialty: str = ""
    price: str = ""       # e.g. "40,000-70,000 VND"
    meal_type: str        # "breakfast" | "lunch" | "dinner"


class TimeSlot(BaseModel):
    start: str            # "08:00"
    end: str              # "11:30"
    slot_type: str        # "morning_activity" | "lunch" | "afternoon_activity" | "dinner" | "evening" | "buffer" | "breakfast" | "full_day_activity"
    attraction: ScheduledAttraction | None = None
    meal: ScheduledMeal | None = None
    is_buffer: bool = False
    combo_covered: bool = False   # True if combo provides this meal


class DayPlan(BaseModel):
    day_num: int
    date_str: str = ""    # "Tue 15/04/2026"
    day_type: str         # "arrival" | "standard" | "full_day" | "departure"
    slots: list[TimeSlot]
    primary_area: str = "center"
    travel_total_min: int = 0
    buffer_min: int = 0


class ValidationViolation(BaseModel):
    rule: str             # "FOOD_REPEAT" | "FAKE_ADDRESS" | "OUTDOOR_NIGHT" | "OVER_BUDGET"
    severity: str         # "error" | "warning"
    message: str
    day: int | None = None


