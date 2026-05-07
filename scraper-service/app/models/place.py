"""
Pydantic models for extraction and backend seed payload.
"""
from __future__ import annotations

import re
from typing import Literal
from pydantic import BaseModel, field_validator


class PlaceExtraction(BaseModel):
    """LLM extraction target — shared for ATTRACTION and FOOD."""
    name: str
    name_en: str | None = None
    address: str | None = None
    area: str | None = None
    hours: str | None = None
    base_price: int | None = None
    recommended_duration: int | None = None  # minutes
    description: str | None = None
    source_url: str | None = None
    # ATTRACTION
    is_free: bool = False
    full_day: bool = False
    # FOOD
    specialty: str | None = None
    meal_types: list[str] = []
    price_min: int | None = None
    price_max: int | None = None

    @field_validator("base_price", "price_min", "price_max", mode="before")
    @classmethod
    def _clean_price(cls, v):
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return abs(int(v))
        cleaned = re.sub(r"[^\d]", "", str(v))
        return int(cleaned) if cleaned else None

    tags: list[str] = []
    must_visit: bool = False
    priority_score: int = 0  # 1-10, LLM-assessed from research signals

    _VALID_TAGS = frozenset({
        # Attraction tags
        "scenic", "historic", "outdoor", "family-friendly", "cultural",
        "adventure", "religious", "beach", "mountain", "urban", "nature", "nightlife",
        # Food tags
        "local", "seafood", "budget", "popular", "traditional", "street-food",
        "restaurant", "breakfast-spot", "hidden-gem", "tourist-favorite",
    })

    @field_validator("tags", mode="before")
    @classmethod
    def _clean_tags(cls, v):
        if not v:
            return []
        if isinstance(v, str):
            v = [v]
        # Only keep tags from the valid preset list
        return [t for t in v if isinstance(t, str) and t.lower() in cls._VALID_TAGS][:5]

    @field_validator("meal_types", mode="before")
    @classmethod
    def _clean_meal_types(cls, v):
        if not v:
            return []
        if isinstance(v, str):
            v = [v]
        valid = {"breakfast", "lunch", "dinner"}
        return [m for m in v if m in valid]

    @field_validator("priority_score", mode="before")
    @classmethod
    def _clean_priority(cls, v):
        try:
            return max(0, min(int(v or 0), 10))
        except (TypeError, ValueError):
            return 0


class ExtractionResult(BaseModel):
    attractions: list[PlaceExtraction] = []
    food_venues: list[PlaceExtraction] = []


class PlaceInput(BaseModel):
    """Matches backend CreatePlaceInput schema exactly."""
    destination: str
    category: Literal["ATTRACTION", "FOOD"]
    name: str
    name_en: str | None = None
    address: str | None = None
    area: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    cover_image: str | None = None
    images: list[str] = []
    rating: float | None = None
    hours: str | None = None
    recommended_duration: int | None = None
    base_price: int | None = None
    metadata: dict = {}
    source_url: str | None = None
    # Planner fields
    must_visit: bool = False
    priority_score: int = 0
    best_time_of_day: str | None = None  # morning|afternoon|evening|any
    tags: list[str] = []

    def is_complete(self, strict: bool = True) -> bool:
        if not self.address:
            return False
        if not self.hours:
            return False
        if strict and self.category == "ATTRACTION":
            if self.base_price is None and not self.metadata.get("is_free"):
                return False
        return True

    def missing_fields(self) -> list[str]:
        missing = []
        if not self.address:
            missing.append("address")
        if not self.hours:
            missing.append("hours")
        if self.category == "ATTRACTION" and self.base_price is None and not self.metadata.get("is_free"):
            missing.append("base_price")
        return missing
