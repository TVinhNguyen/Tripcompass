"""
services/planning_service.py — Core travel planning pipeline.

This module is framework-agnostic: routes and LangChain tools call it, but it
does not return a tool-specific JSON string.
"""
import asyncio
import json
from datetime import date, timedelta
from typing import Optional

from loguru import logger

from app import config


async def generate_travel_plan(
    destination: str,
    num_days: int,
    budget_vnd: int = 0,
    guest_count: int = 2,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    preferences: Optional[list[str]] = None,
    need_hotel: bool = True,
    need_flight: bool = False,
) -> dict:
    """Generate a complete travel plan as a Python dict."""
    from app.nodes.resolve import resolve_destination
    from app.tools.get_places import get_places
    from app.tools.get_food_venues import get_food_venues
    from app.tools.get_combos import get_combos
    from app.tools.get_weather import get_weather
    from app.tools.search_hotels import search_hotels
    from app.nodes.budget import node_budget
    from app.nodes.schedule import node_schedule
    from app.nodes.validate import node_validate
    from app.nodes.enrich import node_enrich

    prefs = _normalize_preferences(preferences)

    # ── 1. Resolve destination ────────────────────────────────────────────
    resolve = await resolve_destination(destination)
    dest_id = resolve["destination_id"]
    dest_name = resolve["destination_name"]
    logger.info(f"[planning_service] {destination!r} → {dest_id!r} ({resolve['resolve_method']})")

    # ── 2. Dates ──────────────────────────────────────────────────────────
    sd = date.fromisoformat(start_date) if start_date else date.today() + timedelta(days=14)
    ed = date.fromisoformat(end_date) if end_date else sd + timedelta(days=num_days - 1)
    travel_month = sd.month

    # ── 3. Gather data (parallel — these queries are independent) ────────
    places_json, food_json, weather_json, combos_json = await asyncio.gather(
        get_places.ainvoke({"destination": dest_id, "tags": prefs or None, "limit": 30}),
        get_food_venues.ainvoke({"destination": dest_id, "tags": prefs or None, "limit": 20}),
        get_weather.ainvoke({"destination": dest_name, "month": travel_month}),
        get_combos.ainvoke({"destination": dest_id}),
    )

    places_data = json.loads(places_json)
    food_data = json.loads(food_json)
    weather_data = json.loads(weather_json)
    combos_data = json.loads(combos_json)

    retrieved = {
        "places": places_data.get("places", []),
        "food": food_data.get("food", []),
        "weather": weather_data,
        "hotels": [],
        "combos": combos_data.get("combos", []),
    }

    warnings = list(resolve.get("warnings", []))
    if not retrieved["places"]:
        warnings.append(f"Không tìm thấy địa điểm nào cho '{dest_id}'.")
    if not retrieved["food"]:
        warnings.append(f"Không tìm thấy nhà hàng nào cho '{dest_id}'.")

    # ── 4. Build state for sub-pipeline ──────────────────────────────────
    base_warnings = list(warnings)
    state: dict = {
        "destination_id": dest_id,
        "destination_name": dest_name,
        "num_days": num_days,
        "guest_count": guest_count,
        "budget_vnd": budget_vnd,
        "start_date": str(sd),
        "end_date": str(ed),
        "travel_month": travel_month,
        "preferences": prefs,
        "need_hotel": need_hotel,
        "need_flight": need_flight,
        "retrieved_data": retrieved,
        "resolve_method": resolve["resolve_method"],
        "violations": [],
        "validation_passed": False,
        "retry_count": 0,
        "schedule_version": 0,
        "warnings": list(base_warnings),
        "errors": [],
    }

    # Compute tier before hotel search so live hotel lookup matches budget.
    state.update(node_budget(state))

    if need_hotel and start_date:
        hotels_json = await search_hotels.ainvoke({
            "destination": dest_name,
            "checkin": str(sd),
            "checkout": str(ed),
            "budget_tier": state.get("budget_tier", "standard"),
            "guests": guest_count,
        })
        retrieved["hotels"] = json.loads(hotels_json).get("hotels", [])
        state["retrieved_data"] = retrieved
        state["warnings"] = list(base_warnings)
        state.update(node_budget(state))

    logger.info(
        f"[planning_service] Data: {len(retrieved['places'])} places, "
        f"{len(retrieved['food'])} food, {len(retrieved['hotels'])} hotels"
    )

    # ── 5. Schedule → Validate (with retry) → Enrich ──────────────────────
    for attempt in range(config.MAX_SCHEDULE_RETRIES + 1):
        state.update(await node_schedule(state))
        state.update(node_validate(state))
        if state["validation_passed"] or state.get("retry_count", 0) >= config.MAX_SCHEDULE_RETRIES:
            break
        logger.info(f"[planning_service] Retry {attempt + 1}: {len(state['violations'])} violations")

    state.update(await node_enrich(state))

    # ── 6. Return ─────────────────────────────────────────────────────────
    return {
        "success": True,
        "destination": dest_name,
        "destination_id": dest_id,
        "num_days": num_days,
        "budget_tier": state.get("budget_tier", "standard"),
        "budget_breakdown": {
            "attr_budget": state.get("attr_budget", 0),
            "food_budget": state.get("food_budget", 0),
            "hotel_budget_per_night": state.get("hotel_budget_per_night", 0),
        },
        "validation_passed": state["validation_passed"],
        "violations": state.get("violations", []),
        "warnings": state.get("warnings", []),
        "plan": state.get("final_plan", state.get("draft_schedule", {})),
        "weather": weather_data,
    }


def _normalize_preferences(preferences: Optional[list[str]]) -> list[str]:
    return sorted({
        str(pref).strip().lower()
        for pref in (preferences or [])
        if str(pref).strip()
    })
