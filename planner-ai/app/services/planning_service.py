"""
services/planning_service.py — Core travel planning pipeline.

This module is framework-agnostic: routes and LangChain tools call it, but it
does not return a tool-specific JSON string.
"""
import asyncio
import json
import time
from datetime import date, timedelta
from typing import Optional

from loguru import logger

from app import config
from app.services.normalize import (
    ascii_fold,
    extract_required_places,
    normalize_preferences,
    normalize_required_places,
    normalize_time,
    normalize_time_strictness,
    normalize_travel_style,
)


async def generate_travel_plan(
    destination: str,
    num_days: int,
    budget_vnd: int = 0,
    guest_count: int = 2,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    travel_style: Optional[str] = None,
    arrival_time: Optional[str] = None,
    departure_time: Optional[str] = None,
    daily_start_time: Optional[str] = None,
    daily_end_time: Optional[str] = None,
    time_strictness: Optional[str] = "balanced",
    preferences: Optional[list[str]] = None,
    required_places: Optional[list[str]] = None,
    raw_input: Optional[str] = None,
    need_hotel: bool = True,
    need_flight: bool = False,
    include_enrich: bool = True,
) -> dict:
    """Generate a complete travel plan as a Python dict."""
    # Keep pipeline imports local so routes/tools can import this service without
    # pulling provider clients until a plan is requested.
    from app.data_sources.combos import fetch_combos
    from app.data_sources.food import fetch_food_venues
    from app.data_sources.hotels import search_hotels_data
    from app.data_sources.places import fetch_places
    from app.data_sources.weather import fetch_weather
    from app.nodes.resolve import resolve_destination
    from app.nodes.budget import node_budget
    from app.nodes.schedule import node_schedule
    from app.nodes.validate import node_validate
    from app.nodes.enrich import node_enrich

    prefs = normalize_preferences(preferences)
    required_names = normalize_required_places([
        *normalize_required_places(required_places),
        *extract_required_places(raw_input),
    ])

    # Per-request stage timings — emitted as one structured log line at the
    # end so we can grep production for [plan-timing] and aggregate. All
    # values are seconds-from-start, so the difference between consecutive
    # entries shows how long each stage actually took.
    t_start = time.monotonic()
    timings: dict[str, float] = {}

    def mark(stage: str) -> None:
        timings[stage] = round(time.monotonic() - t_start, 3)

    # ── 1. Resolve destination ────────────────────────────────────────────
    resolve = await resolve_destination(destination)
    dest_id = resolve["destination_id"]
    dest_name = resolve["destination_name"]
    logger.info(f"[planning_service] {destination!r} → {dest_id!r} ({resolve['resolve_method']})")
    mark("resolve")

    # ── 2. Dates ──────────────────────────────────────────────────────────
    sd = date.fromisoformat(start_date) if start_date else date.today() + timedelta(days=14)
    ed = date.fromisoformat(end_date) if end_date else sd + timedelta(days=num_days - 1)
    travel_month = sd.month

    # ── 3. Gather data (parallel — these queries are independent) ────────
    places_data, food_data, weather_data, combos_data = await asyncio.gather(
        fetch_places(destination=dest_id, tags=prefs or None, limit=80),
        fetch_food_venues(destination=dest_id, tags=prefs or None, limit=20),
        fetch_weather(destination=dest_name, month=travel_month),
        fetch_combos(destination=dest_id),
    )
    mark("data_sources")

    retrieved = {
        "places": places_data.get("places", []),
        "food": food_data.get("food", []),
        "weather": weather_data,
        "hotels": [],
        "combos": combos_data.get("combos", []),
    }
    required_resolved, missing_required = _resolve_required_places(required_names, retrieved["places"])
    retrieved["required_places"] = required_resolved

    warnings = list(resolve.get("warnings", []))
    if not retrieved["places"]:
        warnings.append(f"Không tìm thấy địa điểm nào cho '{dest_id}'.")
    if not retrieved["food"]:
        warnings.append(f"Không tìm thấy nhà hàng nào cho '{dest_id}'.")
    for name in missing_required:
        warnings.append(f"Không tìm thấy địa điểm bắt buộc '{name}' trong dữ liệu {dest_name}.")

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
        "travel_style": normalize_travel_style(travel_style),
        "arrival_time": normalize_time(arrival_time),
        "departure_time": normalize_time(departure_time),
        "daily_start_time": normalize_time(daily_start_time),
        "daily_end_time": normalize_time(daily_end_time),
        "time_strictness": normalize_time_strictness(time_strictness),
        "preferences": prefs,
        "required_place_names": required_names,
        "required_places": required_resolved,
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
    mark("budget")

    if need_hotel and start_date:
        hotels_data = await search_hotels_data(
            destination=dest_name,
            checkin=str(sd),
            checkout=str(ed),
            budget_tier=state.get("budget_tier", "standard"),
            guests=guest_count,
        )
        retrieved["hotels"] = hotels_data.get("hotels", [])
        state["retrieved_data"] = retrieved
        state["warnings"] = list(base_warnings)
        state.update(node_budget(state))
        mark("hotel")

    logger.info(
        f"[planning_service] Data: {len(retrieved['places'])} places, "
        f"{len(retrieved['food'])} food, {len(retrieved['hotels'])} hotels"
    )

    # ── 5. Schedule → Validate (with retry) → Enrich ──────────────────────
    used_fallback = False
    schedule_attempts = 0
    for attempt in range(config.MAX_SCHEDULE_RETRIES + 1):
        state.update(await node_schedule(state))
        mark(f"schedule_attempt_{attempt}")
        state.update(node_validate(state))
        mark(f"validate_attempt_{attempt}")
        schedule_attempts += 1
        retryable_violations = state.get("retryable_violations", [])
        if (
            state["validation_passed"]
            or not retryable_violations
            or state.get("retry_count", 0) > config.MAX_SCHEDULE_RETRIES
        ):
            break
        # If the schedule node fell back because the LLM timed out, retrying
        # with the same prompt + provider will just burn another timeout.
        # Accept the deterministic fallback and move on.
        if state.pop("skip_retry", False):
            used_fallback = True
            logger.info("[planning_service] Skipping retry — schedule used deterministic fallback")
            break
        logger.info(
            f"[planning_service] Retry {attempt + 1}: "
            f"{len(retryable_violations)} retryable / {len(state['violations'])} total violations"
        )

    # Enrichment is cosmetic; skip it entirely when the schedule LLM was the
    # culprit — saves another timeout against the same flaky provider.
    if used_fallback:
        logger.info("[planning_service] Skipping enrichment — same LLM provider was timing out")
        state["final_plan"] = state.get("draft_schedule", {})
    elif not include_enrich:
        logger.info("[planning_service] Skipping enrichment — caller requested fast plan")
        state["final_plan"] = state.get("draft_schedule", {})
    else:
        state.update(await node_enrich(state))
        mark("enrich")
    mark("total")
    logger.info(
        "[plan-timing] "
        + json.dumps({
            "destination": dest_id,
            "num_days": num_days,
            "include_enrich": include_enrich,
            "used_fallback": used_fallback,
            "schedule_attempts": schedule_attempts,
            "stages": timings,
        }, ensure_ascii=False)
    )

    # ── 6. Return ─────────────────────────────────────────────────────────
    return {
        "success": True,
        "destination": dest_name,
        "destination_id": dest_id,
        "num_days": num_days,
        "budget_vnd": state.get("budget_vnd", budget_vnd),
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


def _required_match_score(required_name: str, place: dict) -> tuple[int, int] | None:
    needle = ascii_fold(required_name)
    aliases = [
        ascii_fold(str(place.get("name") or "")),
        *(ascii_fold(str(item)) for item in (place.get("sub_attractions") or [])),
    ]
    aliases = [alias for alias in aliases if alias]
    if not needle:
        return None
    for alias in aliases:
        if needle == alias:
            return (0, -int(place.get("priority_score") or 0))
    for alias in aliases:
        if needle in alias or alias in needle:
            return (1, -int(place.get("priority_score") or 0))
    needle_tokens = set(needle.replace("-", " ").split())
    if not needle_tokens:
        return None
    best_overlap = 0
    for alias in aliases:
        alias_tokens = set(alias.replace("-", " ").split())
        overlap = len(needle_tokens & alias_tokens)
        if overlap > best_overlap:
            best_overlap = overlap
    if best_overlap >= min(2, len(needle_tokens)):
        return (2, -best_overlap)
    return None


def _resolve_required_places(required_names: list[str], places: list[dict]) -> tuple[list[dict], list[str]]:
    resolved: list[dict] = []
    missing: list[str] = []
    used_ids: set[str] = set()

    for name in required_names:
        candidates = []
        for place in places:
            score = _required_match_score(name, place)
            if score is not None:
                candidates.append((score, place))
        if not candidates:
            missing.append(name)
            continue
        candidates.sort(key=lambda item: item[0])
        place = candidates[0][1]
        place_id = str(place.get("id") or "")
        if place_id and place_id not in used_ids:
            used_ids.add(place_id)
            resolved.append(place)

    return resolved, missing
