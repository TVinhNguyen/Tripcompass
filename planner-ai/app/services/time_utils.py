"""
services/time_utils.py — Time parsing/formatting shared across schedule + validate.

All times are 'HH:MM' strings, converted to minutes-since-midnight ints (0-1439)
for arithmetic. Helpers are defensive: malformed input returns a sentinel rather
than raising, so callers can decide how to fall back.
"""


def to_minutes(t: str | None) -> int | None:
    """Parse 'HH:MM' → minutes since midnight. Returns None on bad input."""
    if not t:
        return None
    try:
        h, m = str(t).split(":", 1)
        hi, mi = int(h), int(m)
    except (ValueError, AttributeError):
        return None
    if not (0 <= hi <= 23 and 0 <= mi <= 59):
        return None
    return hi * 60 + mi


def to_minutes_or(t: str | None, fallback: int) -> int:
    """Like to_minutes but never None — uses fallback on parse failure."""
    parsed = to_minutes(t)
    return parsed if parsed is not None else fallback


def format_minutes(minutes: int) -> str:
    """Minutes since midnight → 'HH:MM', clamped to [00:00, 23:59]."""
    minutes = max(0, min(minutes, 23 * 60 + 59))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def parse_hours(hours: str | None) -> tuple[int, int] | None:
    """Parse 'HH:MM-HH:MM' → (open_min, close_min). Returns None on bad input.

    Venues open past midnight return close_min < open_min (e.g. 18:00-02:00
    → (1080, 120)). Callers that care about overnight windows handle that
    explicitly. 24/7 venues encoded as '00:00-23:59' return (0, 1439).
    """
    if not hours or "-" not in hours:
        return None
    try:
        open_s, close_s = hours.split("-", 1)
    except ValueError:
        return None
    open_m = to_minutes(open_s.strip())
    close_m = to_minutes(close_s.strip())
    if open_m is None or close_m is None:
        return None
    return open_m, close_m


def slot_fits_hours(hours: str | None, start: str, end: str) -> bool:
    """True if the slot [start, end] sits inside the venue's open window.

    Unknown hours → True (don't reject when data is missing).
    Overnight windows are checked as two segments: [open, 24:00) ∪ [00:00, close].
    """
    hrs = parse_hours(hours)
    if hrs is None:
        return True
    open_m, close_m = hrs
    ss = to_minutes(start)
    se = to_minutes(end)
    if ss is None or se is None:
        return False
    if se < ss:
        return False
    if open_m <= close_m:
        return open_m <= ss and se <= close_m
    return (ss >= open_m and se <= 1440) or (ss >= 0 and se <= close_m)
