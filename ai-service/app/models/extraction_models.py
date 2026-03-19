"""
Pydantic models for LLM structured output extraction.
"""

import re
from pydantic import BaseModel, Field, field_validator


class ClarificationResult(BaseModel):
    is_complete:        bool
    missing_fields:     list[str] = Field(default_factory=list)
    follow_up_question: str       = Field(default="")
    trip:               dict      = Field(default_factory=dict)


class HotelExtract(BaseModel):
    price_per_night_vnd: int = Field(default=0)
    num_rooms:           int = Field(default=1)

    @field_validator("price_per_night_vnd", "num_rooms", mode="before")
    @classmethod
    def to_int(cls, v):
        if isinstance(v, (int, float)):
            return abs(int(v))
        return int(re.sub(r'[^\d]', '', str(v or "")) or "0")


class AttractionExtract(BaseModel):
    admission_prices_vnd: list[int] = Field(default_factory=list)

    @field_validator("admission_prices_vnd", mode="before")
    @classmethod
    def to_list(cls, v):
        def _c(x):
            if isinstance(x, (int, float)):
                return abs(int(x))
            return int(re.sub(r'[^\d]', '', str(x or "")) or "0")
        if not v:
            return []
        return [_c(x) for x in (v if isinstance(v, list) else [v])]


class FoodExtract(BaseModel):
    avg_meal_cost_per_person_vnd: int = Field(default=0)

    @field_validator("avg_meal_cost_per_person_vnd", mode="before")
    @classmethod
    def to_int(cls, v):
        if isinstance(v, (int, float)):
            return abs(int(v))
        return int(re.sub(r'[^\d]', '', str(v or "")) or "0")


class JudgeOutput(BaseModel):
    winner_index:     int   = 0
    winner_reasoning: str   = ""
    improvement_note: str   = ""
