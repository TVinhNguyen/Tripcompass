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


def normalize_required_places(required_places: Optional[list[str]]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for place in required_places or []:
        value = " ".join(str(place).strip(" .;:!?").split())
        if not value:
            continue
        key = ascii_fold(value)
        if key in seen:
            continue
        seen.add(key)
        normalized.append(value)
    return normalized


def extract_required_places(raw_input: Optional[str]) -> list[str]:
    text = " ".join(str(raw_input or "").strip().split())
    if not text:
        return []

    # Only colon-terminated markers — bare "phai co" matches anywhere in a
    # sentence ("Bà Nà phải có thời gian sáng đẹp") and produces garbage
    # required_places. Requiring the colon is the conventional way users
    # introduce a list in Vietnamese chat ("phải có: A, B, C").
    folded = ascii_fold(text)
    markers = ["phai co:", "must have:", "must include:", "include:"]
    start = -1
    marker_len = 0
    for marker in markers:
        idx = folded.find(marker)
        if idx >= 0:
            start = idx
            marker_len = len(marker)
            break
    if start < 0:
        return []

    segment = text[start + marker_len:]
    for stop in (". ", "? ", "! ", "\n"):
        if stop in segment:
            segment = segment.split(stop, 1)[0]
    segment = segment.replace(" và ", ",").replace(" and ", ",")
    return normalize_required_places([s for s in segment.split(",")])


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
