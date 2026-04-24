"""
Combo model for seed payload.
"""
from __future__ import annotations

from pydantic import BaseModel


class ComboInput(BaseModel):
    destination: str
    name: str
    provider: str | None = None
    price_per_person: int
    includes: list[str] = []
    benefits: list[str] = []
    duration_days: int = 1
    requires_overnight: bool = False
    book_url: str | None = None
