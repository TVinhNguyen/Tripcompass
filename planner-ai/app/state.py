"""
state.py — Shape of the travel-planning pipeline state.

TypedDict with `total=False` so partial updates from each node still type-check.
The runtime container remains a plain dict (LangGraph requires this), but type
hints catch typos at lint time. Keys map to the fields nodes read/write — kept
in sync with planning_service.generate_travel_plan and the node implementations.
"""
from __future__ import annotations

from typing import Any, TypedDict


class TravelPlanState(TypedDict, total=False):
    # ── Inputs (set by planning_service entry point) ─────────────────────────
    destination_id: str
    destination_name: str
    num_days: int
    guest_count: int
    budget_vnd: int
    start_date: str
    end_date: str
    travel_month: int
    travel_style: str           # "relaxed" | "balanced" | "active"
    arrival_time: str | None
    departure_time: str | None
    daily_start_time: str | None
    daily_end_time: str | None
    time_strictness: str        # "flexible" | "balanced" | "strict"
    preferences: list[str]
    need_hotel: bool
    need_flight: bool
    resolve_method: str         # "alias" | "db_exact" | "db_partial"

    # ── Data retrieval ───────────────────────────────────────────────────────
    retrieved_data: dict[str, Any]  # {places, food, hotels, weather, combos}

    # ── Budget node outputs ──────────────────────────────────────────────────
    budget_tier: str            # "survival" | "budget" | "standard" | "premium"
    attr_budget: int
    food_budget: int
    hotel_budget_per_night: int
    budget_constraints: dict[str, Any]
    budget_per_day_per_person: int

    # ── Schedule node outputs ────────────────────────────────────────────────
    draft_schedule: dict[str, Any]
    schedule_version: int
    skip_retry: bool            # set when fallback was used; outer loop reads + pops it

    # ── Validate node outputs ────────────────────────────────────────────────
    violations: list[dict[str, Any]]
    validation_passed: bool
    retry_count: int

    # ── Enrich node outputs ──────────────────────────────────────────────────
    final_plan: dict[str, Any]
    cache_key: str

    # ── Diagnostics carried throughout ───────────────────────────────────────
    warnings: list[str]
    errors: list[str]
