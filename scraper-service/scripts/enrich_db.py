#!/usr/bin/env python3
"""
Enrich existing DB places — fill missing fields via Nominatim + Tavily + LLM.

Pipeline (per place, chỉ gọi cho field NULL hoặc invalid):
  1. Nominatim reverse-geocode (nếu có lat/lng) → clean address + area (free, OSM)
  2. Tavily search per field → LLM extract → validate → update
     - base_price (VND, range 0-5M)
     - hours ("HH:MM-HH:MM")
     - recommended_duration (minutes, range 15-600)
     - best_time_of_day (morning/afternoon/evening/night/any)
  3. Mark price_updated_at = NOW() khi base_price được cập nhật

Idempotent: chạy lại không re-enrich field đã có giá trị (trừ khi --force).
LLM/Tavily quota: ~5 calls/place × 60 places ≈ 300 Tavily + 240 LLM calls.

Usage:
  python enrich_db.py --destination "đà nẵng"
  python enrich_db.py --destination "đà nẵng" --max-places 5     # test nhỏ trước
  python enrich_db.py --destination "đà nẵng" --skip-nominatim   # bỏ qua geocoding
  python enrich_db.py --destination "đà nẵng" --fields base_price,hours

Env (đọc từ scraper-service/.env):
  OPENROUTER_API_KEY    – LLM
  LLM_MODEL_OPENROUTER  – default 'tencent/hy3-preview:free'
  TAVILY_API_KEY        – search
  DATABASE_URL, DB_SCHEMA
"""
from __future__ import annotations

import argparse
import asyncio
import functools
import json
import os
import re
import sys
import time

print = functools.partial(print, flush=True)
from datetime import time as dt_time
from pathlib import Path
from typing import Any, Optional

import asyncpg
import requests

ROOT = Path(__file__).resolve().parents[2]


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


_load_env_file(ROOT / "scraper-service" / ".env")
_load_env_file(ROOT / ".env")

OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY", "")
LLM_MODEL      = os.getenv("LLM_MODEL_OPENROUTER", "tencent/hy3-preview:free")
TAVILY_KEY     = os.getenv("TAVILY_API_KEY", "")
DATABASE_URL   = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set — copy scraper-service/.env.example and set it")
DB_SCHEMA      = os.getenv("DB_SCHEMA", "schema_travel")

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
NOMINATIM_UA   = "tripcompass-enrich/1.0 (https://tripcompass.vn)"
TAVILY_URL     = "https://api.tavily.com/search"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ── Nominatim reverse geocode ─────────────────────────────────────────────────

def nominatim_reverse(lat: float, lng: float) -> Optional[dict]:
    """Trả address dict từ OSM (free, 1 req/s policy)."""
    try:
        r = requests.get(
            f"{NOMINATIM_BASE}/reverse",
            params={"lat": lat, "lon": lng, "format": "json",
                    "addressdetails": "1", "accept-language": "vi,en"},
            headers={"User-Agent": NOMINATIM_UA},
            timeout=5,
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"    ⚠ Nominatim error: {type(e).__name__}")
    return None


def parse_nominatim(data: dict) -> tuple[Optional[str], Optional[str]]:
    """Extract (clean_address, district) từ Nominatim response."""
    if not data:
        return None, None
    addr = data.get("address") or {}
    # Vietnamese admin levels: ward (suburb/quarter) → district (city_district/county) → city
    district = (addr.get("city_district") or addr.get("county") or
                addr.get("suburb") or addr.get("quarter"))
    display = data.get("display_name")
    return display, district


# ── Tavily search ─────────────────────────────────────────────────────────────

def tavily_search(query: str, max_results: int = 3) -> str:
    """Trả concat content của top results."""
    try:
        r = requests.post(
            TAVILY_URL,
            json={"api_key": TAVILY_KEY, "query": query,
                  "max_results": max_results, "search_depth": "basic"},
            timeout=20,
        )
        if r.status_code != 200:
            return ""
        results = r.json().get("results") or []
        return "\n\n---\n\n".join(
            f"URL: {it.get('url','')}\n{it.get('content','')}"
            for it in results
        )
    except Exception as e:
        print(f"    ⚠ Tavily error: {e}")
        return ""


# ── LLM extract via OpenRouter ────────────────────────────────────────────────

def llm_extract(prompt: str, retries: int = 1) -> Optional[str]:
    """LLM với retry: empty content (throttle) → exponential backoff. Final None nếu fail hết."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_KEY}",
        "HTTP-Referer":  "https://tripcompass.vn",
        "X-Title":       "Tripcompass Enrich",
        "Content-Type":  "application/json",
    }
    body = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system",
             "content": "You are a precise data extractor. Return ONLY the requested value, no explanation, no reasoning."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "max_tokens": 3000,
        "reasoning": {"exclude": True},
    }
    backoff = 1.5
    for attempt in range(retries + 1):
        try:
            r = requests.post(OPENROUTER_URL, json=body, headers=headers, timeout=90)
            if r.status_code == 200:
                msg = (r.json().get("choices") or [{}])[0].get("message", {})
                content = (msg.get("content") or "").strip()
                if not content and msg.get("reasoning"):
                    content = msg["reasoning"].strip()
                if content:
                    return content
                # Empty content + HTTP 200 = silent throttle (free tier hay xảy ra) → retry
                if attempt < retries:
                    time.sleep(backoff)
                    backoff = min(backoff * 1.8, 25.0)
                    continue
                return None
            if r.status_code == 429:
                if attempt < retries:
                    time.sleep(backoff)
                    backoff = min(backoff * 1.8, 25.0)
                    continue
                print(f"    ⚠ LLM throttled (429) after {retries+1} attempts")
                return None
            print(f"    ⚠ LLM HTTP {r.status_code}: {r.text[:200]}")
            return None
        except Exception as e:
            if attempt >= retries:
                print(f"    ⚠ LLM error: {e}")
                return None
            time.sleep(backoff)
            backoff = min(backoff * 1.5, 15.0)
    return None


# ── Per-field regex extraction (cho reasoning model trả nhiều text) ──────────

_PRICE_NUM_RE       = re.compile(r"\b(\d{1,3}(?:[,.\s]\d{3})*|\d+)\b")
_HOURS_FORMAT_RE    = re.compile(r"\b(\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})\b")
_DURATION_NUM_RE    = re.compile(r"\b(\d{2,3})\b")
_BEST_TIME_RE       = re.compile(r"\b(morning|afternoon|evening|night|any)\b", re.IGNORECASE)


def smart_extract(field: str, raw: str) -> Optional[str]:
    """Extract đúng format ra từ text dài (reasoning trace hoặc clean output).
    Ưu tiên: nếu raw đã đúng format → return luôn. Nếu không → regex tìm trong text."""
    if not raw:
        return None
    text = raw.strip()

    if field == "base_price":
        # Direct cleaning first
        cleaned = re.sub(r"[,.\s]", "", text)
        if cleaned.isdigit() and len(cleaned) <= 8:
            return cleaned
        # Regex tìm số có dấu VND/đ context, hoặc lớn nhất hợp lý
        # Ưu tiên patterns: "40,000 VND", "40000đ", "VNĐ 40.000"
        for m in re.finditer(r"(\d{1,3}(?:[,.\s]\d{3})+|\d{4,7})\s*(?:VND|VNĐ|đ|dong)?", text, re.IGNORECASE):
            n_str = re.sub(r"[,.\s]", "", m.group(1))
            try:
                n = int(n_str)
                if 1000 <= n <= 5_000_000:
                    return n_str
            except ValueError:
                continue
        # Detect "free" / "miễn phí"
        if re.search(r"\b(free|miễn phí|no fee|no charge)\b", text, re.IGNORECASE):
            return "0"
        return None

    if field == "hours":
        m = _HOURS_FORMAT_RE.search(text)
        if m:
            return f"{m.group(1)}:{m.group(2)}-{m.group(3)}:{m.group(4)}"
        # 24/7 detection
        if re.search(r"\b(24/7|24 hours|all day|always open)\b", text, re.IGNORECASE):
            return "00:00-23:59"
        return None

    if field == "recommended_duration":
        # Direct integer first
        if text.isdigit():
            return text
        # Tìm pattern "X minutes" hoặc "X hours" trong text
        for m in re.finditer(r"\b(\d{1,3})\s*(min|minutes|hour|hours|h)\b", text, re.IGNORECASE):
            n = int(m.group(1))
            unit = m.group(2).lower()
            if unit.startswith("h"):
                n *= 60
            if 15 <= n <= 600:
                return str(n)
        # Fallback: first integer in valid range
        for m in _DURATION_NUM_RE.finditer(text):
            n = int(m.group(1))
            if 15 <= n <= 600:
                return str(n)
        return None

    if field == "best_time_of_day":
        # Direct lowercase token first
        if text.lower() in _VALID_BEST_TIME:
            return text.lower()
        # Tìm last occurrence (reasoning thường kết luận cuối)
        matches = _BEST_TIME_RE.findall(text)
        if matches:
            return matches[-1].lower()
        return None

    return None


# ── General search (Phase 1: 1 search → multi-field LLM extract) ──────────────

GENERAL_QUERIES: list[str] = [
    "{name} {destination} giá vé giờ mở cửa thời gian tham quan đánh giá",
    "{name} {destination} ticket price opening hours visit duration review",
]

MULTI_FIELD_PROMPT = """\
Extract ALL of the following fields for "{name}" in {destination}.
Return ONLY a valid JSON object with these keys:

- "base_price": entrance/admission fee for one adult in VND (integer). Convert USD if needed (1 USD ≈ 25000 VND). 0 if free. null if not found.
- "hours": opening hours as "HH:MM-HH:MM" (24h format). "00:00-23:59" if 24/7. null if not found.
- "best_time_of_day": exactly one of "morning", "afternoon", "evening", "night", "any". Default "any" if unclear.

Example: {{"base_price": 40000, "hours": "07:00-17:30", "best_time_of_day": "morning"}}
Example: {{"base_price": 0, "hours": null, "best_time_of_day": "any"}}

RULES:
- Return ONLY the JSON object, no explanation, no markdown.
- If a field is NOT found in search results, set it to null. Do NOT guess.
- base_price must be integer 0-5000000 or null.
- hours must match "HH:MM-HH:MM" or null.
- best_time_of_day must be one of the 5 values listed.

SEARCH RESULTS:
{search_text}
"""


def build_multi_prompt(name: str, destination: str, search_text: str,
                       fields: list[str]) -> str:
    """Build multi-field prompt, chỉ yêu cầu các fields cần thiết."""
    return MULTI_FIELD_PROMPT.format(
        name=name, destination=destination,
        search_text=search_text[:4500],
    )


def parse_multi_response(raw: str, fields: list[str]) -> dict[str, Any]:
    """Parse JSON response từ multi-field LLM extract. Trả dict field→validated value."""
    if not raw:
        return {}
    # Tìm JSON object trong response (LLM có thể trả thêm text)
    text = raw.strip()
    # Tìm { ... } block
    start = text.find("{")
    end = text.rfind("}") + 1
    if start < 0 or end <= start:
        return {}
    try:
        data = json.loads(text[start:end])
    except json.JSONDecodeError:
        return {}

    results = {}
    for field in fields:
        val = data.get(field)
        if val is None:
            continue
        # Convert to string for smart_extract + validate pipeline
        val_str = str(val)
        smart = smart_extract(field, val_str)
        clean = validate(field, smart)
        if clean is not None:
            results[field] = clean
    return results


# ── Field-specific queries + extract instructions (Phase 2 fallback) ──────────

FIELD_QUERIES: dict[str, list[str]] = {
    "base_price": [
        "giá vé {name} {destination} 2026 VND",
        "{name} {destination} entrance ticket fee admission",
    ],
    "hours": [
        "giờ mở cửa {name} {destination}",
        "{name} opening hours schedule",
    ],
    "recommended_duration": [
        "how long to visit {name} {destination} typical duration",
        "thời gian tham quan {name} {destination}",
    ],
    "best_time_of_day": [
        "{name} best time of day to visit morning afternoon evening",
        "thời điểm tốt nhất tham quan {name} {destination}",
    ],
}

FIELD_INSTRUCTIONS: dict[str, str] = {
    "base_price": (
        "Extract entrance/admission fee for one adult in VND. Convert USD if needed (1 USD ≈ 25000 VND). "
        "Return ONLY a positive integer (e.g. '40000'). If FREE explicitly, return '0'. "
        "If price not mentioned in search results, return 'NOT_FOUND'. Do NOT guess."
    ),
    "hours": (
        "Extract opening hours as 'HH:MM-HH:MM' (24-hour, single window for daytime). "
        "Examples: '07:00-17:30', '09:00-22:00'. If 24/7 → '00:00-23:59'. "
        "If hours not in results, return 'NOT_FOUND'. Do NOT guess."
    ),
    "recommended_duration": (
        "Extract typical visit duration in MINUTES as integer. "
        "Examples: '2 hours' → '120', 'half day' → '240', 'full day' → '480', '30 min' → '30'. "
        "Return ONLY the number. If not in results, return 'NOT_FOUND'."
    ),
    "best_time_of_day": (
        "Based on search results, choose the BEST time of day to visit. "
        "Return EXACTLY ONE of: 'morning', 'afternoon', 'evening', 'night', 'any'. "
        "Lowercase only. If unclear from results, return 'any'."
    ),
}


def build_prompt(field: str, name: str, destination: str, search_text: str) -> str:
    return (
        f"Field: {field}\nPlace: {name}\nDestination: {destination}\n\n"
        f"INSTRUCTION: {FIELD_INSTRUCTIONS[field]}\n\n"
        f"SEARCH RESULTS:\n{search_text[:3500]}\n\n"
        f"Answer ({field}):"
    )


# ── Validation ────────────────────────────────────────────────────────────────

_HOURS_RE = re.compile(r"^(\d{2}):(\d{2})-(\d{2}):(\d{2})$")
_VALID_BEST_TIME = {"morning", "afternoon", "evening", "night", "any"}


def validate(field: str, value: Optional[str]) -> Any:
    """Trả None nếu invalid; ngược lại return giá trị đã typed."""
    if not value or value.upper().strip() in ("NOT_FOUND", "N/A", ""):
        return None
    v = value.strip().strip("'").strip('"').strip()

    if field == "base_price":
        # Strip thousand separators
        v = re.sub(r"[,.\s]", "", v)
        try:
            n = int(v)
            return n if 0 <= n <= 5_000_000 else None
        except ValueError:
            return None

    if field == "hours":
        m = _HOURS_RE.match(v)
        if not m:
            return None
        oh, om, ch, cm = (int(x) for x in m.groups())
        if not (0 <= oh <= 23 and 0 <= om <= 59 and 0 <= ch <= 23 and 0 <= cm <= 59):
            return None
        return v

    if field == "recommended_duration":
        try:
            n = int(v)
            return n if 15 <= n <= 600 else None
        except ValueError:
            return None

    if field == "best_time_of_day":
        v_low = v.lower()
        return v_low if v_low in _VALID_BEST_TIME else None

    return None


# ── Main enrich logic ─────────────────────────────────────────────────────────

ALL_FIELDS = ["base_price", "hours", "recommended_duration", "best_time_of_day"]


def needs_field(place: dict, field: str) -> bool:
    """Field cần enrich? base_price=0 (free entry) → KHÔNG cần re-enrich (LLM đã confirm)."""
    v = place.get(field)
    if field == "base_price":
        # 0 với price_updated_at = đã confirm free entry → skip
        if v == 0 and place.get("price_updated_at"):
            return False
        return v is None
    return v is None or v == ""


async def enrich_place(conn: asyncpg.Connection, place: dict, args: argparse.Namespace) -> dict:
    """Enrich 1 place — 2-phase: general search first, then targeted fallback.

    Phase 1: 1 general Tavily search → 1 multi-field LLM extract (covers ~70% cases)
    Phase 2: Per-field targeted search only for fields still NULL after Phase 1
    """
    name        = place["name"]
    destination = place["destination"]
    place_id    = place["id"]
    stats = {"nominatim": False, "fields_filled": [], "fields_failed": []}

    # ── 1. Nominatim reverse-geocode (chỉ nếu có lat/lng) ──────────────────────
    if not args.skip_nominatim and place.get("latitude") and place.get("longitude"):
        nm = nominatim_reverse(place["latitude"], place["longitude"])
        clean_addr, district = parse_nominatim(nm or {})
        updates = {}
        if clean_addr and (args.force or _nominatim_better_address(clean_addr, place.get("address"))):
            updates["address"] = clean_addr
        if district and (args.force or _nominatim_better_area(district, place.get("area"))):
            updates["area"] = district
        if updates:
            await _update_place(conn, place_id, updates, mark_price=False)
            stats["nominatim"] = True
            print(f"    📍 nominatim → {list(updates.keys())}")
        time.sleep(args.nominatim_sleep)

    # ── 2. Phase 1: General search → multi-field LLM extract ───────────────────
    field_updates: dict[str, Any] = {}
    fields_to_run = [f for f in args.fields if args.force or needs_field(place, f)]

    if not fields_to_run:
        print("    ⏭ all fields already filled")
        return stats

    # General search: 1-2 Tavily calls covering all topics
    general_text = ""
    for q in GENERAL_QUERIES:
        general_text += "\n\n" + tavily_search(
            q.format(name=name, destination=destination), max_results=5
        )
        time.sleep(args.tavily_sleep)

    if general_text.strip():
        # Multi-field LLM: 1 call extracting all fields at once
        prompt = build_multi_prompt(name, destination, general_text, fields_to_run)
        raw = llm_extract(prompt)
        multi_results = parse_multi_response(raw or "", fields_to_run)
        time.sleep(args.llm_sleep)

        for field, value in multi_results.items():
            field_updates[field] = value
            stats["fields_filled"].append(f"{field}={value}")
            print(f"    ✓ {field} = {value}")

    # ── 3. Phase 2: Targeted fallback per field (opt-in via --fallback) ──────
    remaining = [f for f in fields_to_run if f not in field_updates]
    if remaining and not args.fallback:
        for f in remaining:
            stats["fields_failed"].append(f)
        print(f"    ⏩ skip fallback: {remaining} (use --fallback to retry per-field)")
    elif remaining:
        print(f"    🔍 fallback per-field: {remaining}")
        for field in remaining:
            queries = [q.format(name=name, destination=destination) for q in FIELD_QUERIES[field]]
            search_text = ""
            for q in queries:
                search_text += "\n\n" + tavily_search(q, max_results=3)
                time.sleep(args.tavily_sleep)
            if not search_text.strip():
                stats["fields_failed"].append(field)
                print(f"    ✗ {field}: no search results")
                continue
            prompt = build_prompt(field, name, destination, search_text)
            raw = llm_extract(prompt)
            smart = smart_extract(field, raw or "")
            clean = validate(field, smart)
            time.sleep(args.llm_sleep)
            if clean is not None:
                field_updates[field] = clean
                stats["fields_filled"].append(f"{field}={clean}")
                print(f"    ✓ {field} = {clean}")
            else:
                stats["fields_failed"].append(field)
                preview = (raw or "")[:80].replace("\n", " ")
                print(f"    ✗ {field}: smart={smart!r} | raw[:80]={preview!r}")

    if field_updates:
        await _update_place(conn, place_id, field_updates,
                            mark_price=("base_price" in field_updates))

    return stats


_CORRUPT_RE = re.compile(r"\w_\w")


def _looks_corrupted(s: Optional[str]) -> bool:
    return bool(s) and bool(_CORRUPT_RE.search(s))


def _nominatim_better_address(new: str, old: str) -> bool:
    """Nominatim tốt hơn nếu: dài hơn 50 chars VÀ chứa keyword admin Vietnamese."""
    if not new:
        return False
    if not old:
        return True
    if _looks_corrupted(old):
        return True
    has_admin = any(kw in new for kw in ("Phường", "Quận", "Thành phố", "Đường", "Việt Nam"))
    return has_admin and len(new) >= len(old) + 20


def _nominatim_better_area(new: str, old: str) -> bool:
    """Nominatim area tốt hơn nếu: chứa 'Phường' hoặc 'Quận' (structured)."""
    if not new:
        return False
    if not old:
        return True
    new_structured = new.startswith(("Phường", "Quận"))
    old_structured = old.startswith(("Phường", "Quận"))
    return new_structured and not old_structured


async def _update_place(conn: asyncpg.Connection, place_id: Any,
                        updates: dict, mark_price: bool) -> None:
    if not updates:
        return
    sets = []
    vals = []
    idx = 1
    for k, v in updates.items():
        if k == "hours":
            # Cũng update open_time + close_time
            m = _HOURS_RE.match(v)
            if m:
                oh, om, ch, cm = (int(x) for x in m.groups())
                sets.append(f"open_time = ${idx}::time"); vals.append(dt_time(oh, om)); idx += 1
                sets.append(f"close_time = ${idx}::time"); vals.append(dt_time(ch, cm)); idx += 1
            sets.append(f"hours = ${idx}"); vals.append(v); idx += 1
        else:
            sets.append(f"{k} = ${idx}"); vals.append(v); idx += 1
    if mark_price:
        sets.append("price_updated_at = NOW()")
    sets.append("updated_at = NOW()")
    vals.append(place_id)
    sql = f"UPDATE {DB_SCHEMA}.places SET {', '.join(sets)} WHERE id = ${idx}"
    await conn.execute(sql, *vals)


async def fetch_places(conn: asyncpg.Connection, destination: str,
                       limit: Optional[int]) -> list[dict]:
    rows = await conn.fetch(
        f"SELECT id, name, destination, latitude, longitude, address, area, "
        f"       base_price, price_updated_at, hours, recommended_duration, best_time_of_day "
        f"FROM {DB_SCHEMA}.places "
        f"WHERE LOWER(destination) = LOWER($1) "
        f"ORDER BY priority_score DESC, review_count DESC "
        f"{f'LIMIT {limit}' if limit else ''}",
        destination,
    )
    return [dict(r) for r in rows]


async def run(args: argparse.Namespace) -> int:
    if not OPENROUTER_KEY:
        print("✗ OPENROUTER_API_KEY chưa set"); return 2
    if not TAVILY_KEY:
        print("✗ TAVILY_API_KEY chưa set"); return 2

    print(f"→ DB: {DATABASE_URL.split('@')[-1]} schema={DB_SCHEMA}")
    print(f"→ LLM: {LLM_MODEL}")
    print(f"→ Fields: {args.fields}")
    print(f"→ Nominatim: {'OFF' if args.skip_nominatim else 'ON'}")
    print()

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        places = await fetch_places(conn, args.destination, args.max_places)
        print(f"→ Found {len(places)} places để enrich\n")

        total_filled = 0
        total_failed = 0
        nominatim_count = 0
        for i, place in enumerate(places, 1):
            print(f"[{i:02d}/{len(places)}] {place['name']}")
            try:
                s = await enrich_place(conn, place, args)
                total_filled += len(s["fields_filled"])
                total_failed += len(s["fields_failed"])
                if s["nominatim"]:
                    nominatim_count += 1
            except Exception as e:
                print(f"    ✗ Error: {e}")
                total_failed += 1
            print()

        print("=" * 60)
        print(f"✅ DONE: {total_filled} fields filled, {total_failed} failed, "
              f"{nominatim_count} nominatim updates")

        # Final coverage
        n_dest = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places WHERE LOWER(destination) = LOWER($1)",
            args.destination)
        n_price = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND base_price IS NOT NULL AND base_price > 0",
            args.destination)
        n_hours = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND hours IS NOT NULL", args.destination)
        n_dur = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND recommended_duration IS NOT NULL",
            args.destination)
        n_btod = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND best_time_of_day IS NOT NULL",
            args.destination)
        n_area = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND area IS NOT NULL",
            args.destination)

        print(f"\n📊 Coverage cho {args.destination!r}:")
        for label, n in [("base_price", n_price), ("hours", n_hours),
                         ("recommended_duration", n_dur),
                         ("best_time_of_day", n_btod), ("area", n_area)]:
            print(f"   {label:25s} {n}/{n_dest}  ({100*n//max(n_dest,1)}%)")
    finally:
        await conn.close()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--destination",     required=True, help="vd 'đà nẵng'")
    ap.add_argument("--max-places",      type=int, default=None,
                    help="Limit số places (default: all)")
    ap.add_argument("--fields",          type=lambda s: [x.strip() for x in s.split(",")],
                    default=ALL_FIELDS,
                    help=f"Comma-separated, mặc định: {','.join(ALL_FIELDS)}")
    ap.add_argument("--force",           action="store_true",
                    help="Re-enrich kể cả field đã có giá trị")
    ap.add_argument("--skip-nominatim",  action="store_true",
                    help="Bỏ qua reverse-geocode address+area")
    ap.add_argument("--fallback",        action="store_true",
                    help="Bật Phase 2 per-field targeted search (chậm, chỉ dùng khi cần)")
    ap.add_argument("--nominatim-sleep", type=float, default=1.1,
                    help="Sleep sau Nominatim (default 1.1s — policy 1 req/s)")
    ap.add_argument("--tavily-sleep",    type=float, default=0.5)
    ap.add_argument("--llm-sleep",       type=float, default=0.3)
    return asyncio.run(run(ap.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
