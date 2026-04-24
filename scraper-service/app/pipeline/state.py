"""
ScraperState — LangGraph state for the scraper pipeline.
"""
from __future__ import annotations

from typing import Annotated, TypedDict

from app.models.place import PlaceInput


def _merge_dict(a: dict, b: dict) -> dict:
    """Reducer for research dict — merge research results from parallel agents."""
    merged = dict(a)
    merged.update(b)
    return merged


class ScraperState(TypedDict):
    # Input
    destination: str
    year: int
    category_filter: str | None  # "ATTRACTION" | "FOOD" | None
    dry_run: bool
    no_serpapi: bool
    no_apify: bool

    # Research results — collected from parallel agents via Send
    research: Annotated[dict, _merge_dict]  # {"attractions": str, "food": str, "combos": str}

    # Extracted data
    places: list[PlaceInput]
    combos: list[dict]

    # Post-validate
    complete: list[PlaceInput]
    incomplete: list[PlaceInput]

    # Post-enrich
    enriched: list[PlaceInput]

    # Result
    success: bool
    error: str | None
