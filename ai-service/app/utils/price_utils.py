"""
Price parsing, extraction and VND conversion utilities.
"""

import re
from app.config.constants import VND_PER_USD, MIN_HOTEL_VND, MAX_HOTEL_VND, MAX_ATTRACTION_VND, MAX_MEAL_VND


def _usd_to_vnd(usd: float) -> int:
    return int(usd * VND_PER_USD)


def _parse_price(price_str: str) -> int:
    """Parse price string '$123' hoặc '123' → VND int."""
    if not price_str:
        return 0
    clean = re.sub(r'[^\d.]', '', str(price_str))
    try:
        val = float(clean)
        # Nếu giá nhỏ (< 10000) thì coi là USD, convert
        return _usd_to_vnd(val) if val < 10_000 else int(val)
    except ValueError:
        return 0


def _extract_vnd_amounts(text: str) -> list[int]:
    amounts = []
    for m in re.finditer(r'(\d{1,3}(?:[,\.]\d{3})+)\s*(?:VND|vnd|đ\b)', text):
        amounts.append(int(m.group(1).replace(",", "").replace(".", "")))
    for m in re.finditer(r'\b(\d{5,9})\s*(?:VND|vnd|đ\b)', text):
        amounts.append(int(m.group(1)))
    for m in re.finditer(r'(\d+(?:[,\.]\d+)?)\s*triệu', text, re.IGNORECASE):
        amounts.append(int(float(m.group(1).replace(",", ".")) * 1_000_000))
    for m in re.finditer(r'(\d+(?:\.\d+)?)\s*(?:k\b|nghìn)', text, re.IGNORECASE):
        amounts.append(int(float(m.group(1)) * 1_000))
    return [a for a in amounts if 10_000 <= a <= 100_000_000]


_COMBO_TOTAL = re.compile(
    r'\b(?:total|tổng|trọn\s*gói|package|combo|for\s+\d+\s*(?:people|người)'
    r'|\d+\s*(?:people|người)\s*(?:total|tổng))\b', re.IGNORECASE,
)
_COMBO_PER_UNIT = re.compile(
    r'/\s*(?:person|người|pax|chặng|leg|adult|trẻ em)', re.IGNORECASE,
)


def _extract_combo_totals(text: str, num_people: int) -> list[int]:
    min_ok  = 300_000 * max(num_people, 1)
    pattern = re.compile(
        r'(\d{1,3}(?:[,\.]\d{3})+|\d{5,9})\s*(?:VND|vnd|đ\b|triệu|k\b|nghìn)',
        re.IGNORECASE,
    )
    results = []
    for m in pattern.finditer(text):
        start, end = max(0, m.start()-150), min(len(text), m.end()+100)
        window     = text[start:end]
        raw        = m.group(1).replace(",", "").replace(".", "")
        try:
            val = int(raw)
        except ValueError:
            continue
        unit = m.group(0)[len(m.group(1)):].strip().lower()
        if 'triệu' in unit:
            val = int(float(m.group(1).replace(",", ".")) * 1_000_000)
        elif unit.startswith('k') or 'nghìn' in unit:
            val = int(float(m.group(1)) * 1_000)
        if _COMBO_TOTAL.search(window) and not _COMBO_PER_UNIT.search(window) and val >= min_ok:
            results.append(val)
    return sorted(set(results))


def _regex_hotel_price(text: str) -> int:
    for pat in [
        r'(\d[\d,\.]+)\s*(?:VND|đ)?\s*/\s*(?:night|đêm)',
        r'(?:Rate|Giá|rate)\s*:\s*(\d[\d,\.]+)',
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            v = int(re.sub(r'[^\d]', '', m.group(1)) or "0")
            if MIN_HOTEL_VND <= v <= MAX_HOTEL_VND:
                return v
    c = [a for a in _extract_vnd_amounts(text) if MIN_HOTEL_VND <= a <= MAX_HOTEL_VND]
    return min(c) if c else 0


def _regex_attraction_prices(text: str) -> list[int]:
    prices = []
    for pat in [
        r'(?:Admission|Vé|Entry|Ticket)\s*:\s*(\d[\d,\.]+)',
        r'(\d[\d,\.]+)\s*(?:VND|đ)\s*/\s*(?:person|người)',
    ]:
        for m in re.finditer(pat, text, re.IGNORECASE):
            v = int(re.sub(r'[^\d]', '', m.group(1)) or "0")
            if 0 <= v <= MAX_ATTRACTION_VND:
                prices.append(v)
    if not prices:
        prices = [a for a in _extract_vnd_amounts(text) if a <= MAX_ATTRACTION_VND]
    return prices[:10]


def _regex_food_per_day(text: str) -> int:
    meals = []
    for pat in [
        r'(\d[\d,\.]+)\s*(?:VND|đ)\s*/\s*(?:person|người)',
        r'(\d[\d,\.]+)\s*[-–]\s*(\d[\d,\.]+)\s*(?:VND|đ)',
    ]:
        for m in re.finditer(pat, text, re.IGNORECASE):
            v = int(re.sub(r'[^\d]', '', m.group(1)) or "0")
            if 20_000 <= v <= MAX_MEAL_VND:
                meals.append(v)
    if not meals:
        meals = [a for a in _extract_vnd_amounts(text) if 20_000 <= a <= MAX_MEAL_VND]
    return int(sum(meals)/len(meals)*3) if meals else 200_000
