"""
services/normalize.py — Shared input normalisation helpers.
"""
import unicodedata
from typing import Optional


def normalize_destination(destination: str) -> str:
    return " ".join((destination or "").strip().lower().split())


def normalize_preferences(preferences: Optional[list[str]]) -> list[str]:
    return sorted({
        str(pref).strip().lower()
        for pref in (preferences or [])
        if str(pref).strip()
    })


def normalize_travel_style(value: Optional[str]) -> str:
    style = str(value or "balanced").strip().lower()
    if style == "standard":
        return "balanced"
    if style in {"relaxed", "balanced", "active"}:
        return style
    return "balanced"


def normalize_time_strictness(value: Optional[str]) -> str:
    strictness = str(value or "balanced").strip().lower()
    if strictness in {"flexible", "balanced", "strict"}:
        return strictness
    return "balanced"


def normalize_time(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip()
    try:
        hour_s, minute_s = raw.split(":", 1)
        hour = int(hour_s)
        minute = int(minute_s)
    except (TypeError, ValueError):
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return f"{hour:02d}:{minute:02d}"


def ascii_fold(value: str) -> str:
    """Lowercase and strip Vietnamese diacritics for tolerant DB matching."""
    if not value:
        return ""
    lowered = value.lower().replace("đ", "d")
    return unicodedata.normalize("NFD", lowered).encode("ascii", "ignore").decode()
