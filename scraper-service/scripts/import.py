#!/usr/bin/env python3
"""
TripAdvisor → Postgres import (HYBRID).

Chiến lược:
  1. omkar /<category>/search    → resolve destination → entity_id
  2. omkar /<category>/list      → list 30 items/page (ranking từ TripAdvisor)
  3. official TA /location/{id}/details → coords, address, hours, ranking, phone, website
  4. official TA /location/{id}/photos  → multi-size, up to 10 images
  5. Map + upsert vào DB qua asyncpg

Vì sao Hybrid:
  - omkar /attractions/detail đang DOWN globally (HTTP 500) — không dùng được.
  - official TA KHÔNG có endpoint "list all places in city" — chỉ có search/nearby
    (cap 10 results, lẫn spa/tour operator).
  - omkar /list vẫn ổn → giữ làm nguồn discovery; official TA cho enrichment.

Usage:
  python import.py --query "Da Nang" --destination "đà nẵng" --pages 2
  python import.py --query "Da Nang" --destination "đà nẵng" --cat food --pages 2
  python import.py --list-file scraper-service/data/import_destinations_vietnam.jsonl --group destination_brand --cat all --pages 2
  python import.py --query "Da Nang" --destination "đà nẵng" --pages 2 --clear-destination
  python import.py --query "Da Nang" --destination "đà nẵng" --pages 2 --clear-all
  python import.py --query "Da Nang" --destination "đà nẵng" --pages 2 --dry-run

Env (đọc từ scraper-service/.env hoặc môi trường):
  TRIPADVISOR_API_KEY            – omkar Travel Data API key (cho /search + /list)
  TRIPADVISOR_OFFICIAL_API_KEY   – official TripAdvisor Content API key (cho /details + /photos)
  DATABASE_URL                   – required, e.g. postgresql://postgres:<password>@localhost:5432/tripcompass
  DB_SCHEMA                      – default schema_travel
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
import unicodedata
from datetime import time as dt_time
from pathlib import Path
from typing import Any, Optional
from types import SimpleNamespace

import asyncpg
import requests

ROOT = Path(__file__).resolve().parents[2]


def _load_env_file(path: Path) -> None:
    """Lightweight .env loader — không cần python-dotenv."""
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

OMKAR_KEY    = os.getenv("TRIPADVISOR_API_KEY", "")
TA_KEY       = os.getenv("TRIPADVISOR_OFFICIAL_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set — copy scraper-service/.env.example and set it")
DB_SCHEMA    = os.getenv("DB_SCHEMA", "schema_travel")

OMKAR_BASE   = "https://travel-data-api.omkar.cloud/travel"
TA_BASE      = "https://api.content.tripadvisor.com/api/v1"
OMKAR_HEADERS = {"API-Key": OMKAR_KEY}
TA_HEADERS    = {"accept": "application/json"}

LOCATION_CONTAINER_TYPES = {"PROVINCE", "MUNICIPALITY", "CITY", "ISLAND", "ISLAND_GROUP", "NATIONAL_PARK"}
CATEGORY_CONFIG = {
    "attractions": {"api_seg": "attractions", "db_category": "ATTRACTION", "label": "attractions"},
    "food":        {"api_seg": "restaurants", "db_category": "FOOD",       "label": "restaurants"},
}


# ── Source 1: omkar (/search + /list — vẫn hoạt động) ──────────────────────────

def build_omkar_query(query: str) -> str:
    query = query.strip()
    if re.search(r"\b(viet\s*nam|vietnam)\b", query, flags=re.IGNORECASE):
        return query
    return f"{query} Vietnam"


def normalize_location_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^a-z0-9]+", " ", value.lower())
    value = re.sub(r"\b(viet\s*nam|vietnam)\b", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def omkar_search(query: str, api_seg: str = "attractions") -> list[dict]:
    r = requests.get(f"{OMKAR_BASE}/{api_seg}/search",
                     params={"query": build_omkar_query(query)},
                     headers=OMKAR_HEADERS, timeout=30)
    r.raise_for_status()
    return r.json().get("results", [])


def omkar_list(entity_id: str, page: int, api_seg: str = "attractions") -> list[dict]:
    r = requests.get(f"{OMKAR_BASE}/{api_seg}/list",
                     params={"query": entity_id, "page": str(page)},
                     headers=OMKAR_HEADERS, timeout=60)
    r.raise_for_status()
    return r.json().get("results", [])


def resolve_entity_id(query: str, api_seg: str = "attractions") -> Optional[dict]:
    results = omkar_search(query, api_seg=api_seg)
    if not results:
        return None
    query_norm = normalize_location_name(query)

    def score(row: dict) -> int:
        name_norm = normalize_location_name(row.get("name") or "")
        place_type = row.get("place_type")
        value = 0
        if place_type in LOCATION_CONTAINER_TYPES:
            value += 100
        if name_norm == query_norm:
            value += 80
        elif name_norm and (name_norm in query_norm or query_norm in name_norm):
            value += 35
        if "province" in query_norm and place_type == "PROVINCE":
            value += 25
        if "island" in query_norm and place_type == "ISLAND":
            value += 25
        return value

    pick = max(enumerate(results), key=lambda pair: (score(pair[1]), -pair[0]))[1]
    return {
        "id":         str(pick["tripadvisor_entity_id"]),
        "name":       pick.get("name"),
        "place_type": pick.get("place_type"),
    }


def item_entity_id(item: dict) -> Optional[str]:
    value = item.get("tripadvisor_entity_id") or item.get("entity_id") or item.get("location_id")
    return str(value) if value else None


# ── Source 2: Official TripAdvisor Content API ────────────────────────────────

def ta_details(location_id: str, retries: int = 2) -> Optional[dict]:
    for attempt in range(retries + 1):
        try:
            r = requests.get(f"{TA_BASE}/location/{location_id}/details",
                             params={"key": TA_KEY, "language": "en", "currency": "USD"},
                             headers=TA_HEADERS, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (404, 403):
                return None
            if attempt < retries:
                time.sleep(1.0)
        except Exception as e:
            if attempt >= retries:
                print(f"    ⚠ TA details({location_id}) failed: {e}")
                return None
            time.sleep(1.0)
    return None


def ta_photos(location_id: str, limit: int = 10, retries: int = 1) -> list[dict]:
    for attempt in range(retries + 1):
        try:
            r = requests.get(f"{TA_BASE}/location/{location_id}/photos",
                             params={"key": TA_KEY, "language": "en", "limit": str(limit)},
                             headers=TA_HEADERS, timeout=30)
            if r.status_code == 200:
                return r.json().get("data", [])
            if r.status_code in (404, 403):
                return []
            if attempt < retries:
                time.sleep(1.0)
        except Exception:
            if attempt >= retries:
                return []
            time.sleep(1.0)
    return []


# ── Field parsers ─────────────────────────────────────────────────────────────

def parse_hours_periods(hours_field: Any) -> tuple[Optional[dt_time], Optional[dt_time], Optional[str]]:
    """Official TA shape: {periods: [{open: {day, time:'HHMM'}, close: {...}}, ...]}.
    Returns (open_time, close_time, hours_str). Lấy period đầu tiên (Monday usually).
    open/close là datetime.time để asyncpg encode đúng cột TIME."""
    if not hours_field or not isinstance(hours_field, dict):
        return None, None, None
    periods = hours_field.get("periods") or []
    if not periods:
        return None, None, None
    p = periods[0]
    o = (p.get("open") or {}).get("time")
    c = (p.get("close") or {}).get("time")
    if not o or not c or len(o) != 4 or len(c) != 4:
        return None, None, None
    try:
        o_t = dt_time(int(o[:2]), int(o[2:]))
        c_t = dt_time(int(c[:2]), int(c[2:]))
    except (ValueError, TypeError):
        return None, None, None
    return o_t, c_t, f"{o_t.strftime('%H:%M')}-{c_t.strftime('%H:%M')}"


# Heuristic: estimate time spent at attraction based on subcategory keywords
_DURATION_HINTS = [
    (("cave", "caves", "geologic"),                180),
    (("mountain", "mountains"),                    180),
    (("beach", "beaches"),                         120),
    (("park", "parks", "nature"),                  120),
    (("amusement", "theme", "water_park"),         300),
    (("museum", "museums"),                        90),
    (("religious", "temple", "pagoda", "church"),  60),
    (("market", "markets", "shopping"),            90),
    (("spa", "spas", "massage"),                   90),
    (("nightlife", "bar", "club"),                 120),
    (("landmark", "landmarks", "monument"),        60),
    (("tour", "tours"),                            240),
    (("zoo", "aquarium"),                          180),
]


def estimate_duration(subcategories: list[str]) -> int:
    """90 default; override theo subcategory keyword."""
    blob = " ".join(s.lower() for s in subcategories)
    for keywords, mins in _DURATION_HINTS:
        if any(kw in blob for kw in keywords):
            return mins
    return 90


# Reject if area chứa street/road keyword
_STREET_RE = re.compile(r'\b(street|st\.|đường|duong|road|rd\.|blvd|boulevard|avenue|ave\.)\b', re.IGNORECASE)
# UTF-8 corruption: underscore giữa từ Vietnamese (vd 'B_c M_ An', 'Tr_n Phu')
_UTF8_CORRUPT_RE = re.compile(r'\w_\w|^_|_$')
# Address prefix kiểu street ('No. 06', 'Lot 41', 'Số 12')
_STREET_PREFIX_RE = re.compile(r'^(no\.|lot|số|so)\s', re.IGNORECASE)


def parse_area(address_obj: Optional[dict], destination_name: str = "") -> Optional[str]:
    """Trả district/ward/area. Reject:
       - bắt đầu bằng số ('30 Ha Bang')
       - chứa street keyword ('Hung Vuong street')
       - chính là tên destination ('Da Nang' khi destination='Da Nang')
       - UTF-8 corruption ('B_c M_ An')
       - quá dài (> 35 chars, thường là concat).
       Thà NULL còn hơn rác."""
    if not address_obj:
        return None

    dest_lower = (destination_name or "").lower().strip()

    def _looks_like_area(s: str) -> bool:
        if not s:
            return False
        s_clean = s.strip()
        if len(s_clean) < 3 or len(s_clean) > 35:
            return False
        if s_clean[0].isdigit():
            return False
        if _STREET_PREFIX_RE.match(s_clean):
            return False
        if _STREET_RE.search(s_clean):
            return False
        if _UTF8_CORRUPT_RE.search(s_clean):
            return False
        if dest_lower and s_clean.lower() in {dest_lower, dest_lower.replace(" ", "")}:
            return False
        return True

    addr_str = address_obj.get("address_string") or ""
    parts = [p.strip() for p in addr_str.split(",") if p.strip()]
    if len(parts) >= 2 and _looks_like_area(parts[-2]):
        return parts[-2]

    s1 = (address_obj.get("street1") or "").strip()
    sub = [p.strip() for p in s1.split(",") if p.strip()]
    if len(sub) >= 2 and _looks_like_area(sub[-1]):
        return sub[-1]

    return None


# Generic tags xuất hiện ở 90%+ places → noise, không có giá trị filter
_TAG_BLACKLIST = {
    "attractions", "activities", "outdoor activities", "things to do",
    "tours", "tours & activities",
}


def _normalize_tag(name: str) -> str:
    """Chuẩn hóa cho key tag: 'Geologic Formations' → 'geologic_formations'."""
    return (name or "").strip().lower().replace(" & ", "_").replace(" ", "_")


def parse_tags(ta_detail: dict, omkar_item: dict) -> list[str]:
    """Tag list sạch: subcategory.name (đã normalized) + specific group categories.
    Skip generic blacklist. Dedupe. Cap 5 tags để LLM/UI không bị clutter."""
    tags: list[str] = []
    seen: set[str] = set()

    def _add(name: str):
        n = _normalize_tag(name)
        if n and n not in seen and n not in _TAG_BLACKLIST:
            seen.add(n)
            tags.append(n)

    # 1) subcategory.name — đã là snake_case từ TA
    for sc in (ta_detail.get("subcategory") or []):
        _add(sc.get("name"))
    # 2) Specific category names từ groups (thường là term hữu ích như 'Mountains', 'Beaches')
    for g in (ta_detail.get("groups") or []):
        for c in (g.get("categories") or []):
            _add(c.get("name") or c.get("localized_name"))
    # 3) omkar categories (fallback supplementary)
    for c in (omkar_item.get("categories") or []):
        if isinstance(c, dict) and c.get("name"):
            _add(c["name"])

    return tags[:5]


PRICE_RANGE_VND = {
    "$": 80_000,
    "$$": 200_000,
    "$$$": 500_000,
    "$$$$": 1_200_000,
}


def is_in_vietnam_bounds(lat: Optional[float], lng: Optional[float]) -> bool:
    """Coarse guardrail against provider resolver mistakes.

    Omkar can occasionally resolve a Vietnamese destination name to a similarly
    named place overseas. Vietnam's broad bounding box is enough to reject those
    rows before they reach Postgres.
    """
    if lat is None or lng is None:
        return False
    return 8.0 <= lat <= 24.5 and 102.0 <= lng <= 110.5


def restaurant_tags(omkar_item: dict) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()

    def _label(value: Any) -> str:
        if isinstance(value, dict):
            return value.get("name") or value.get("localized_name") or ""
        return str(value or "")

    def _add(value: Any) -> None:
        tag = _normalize_tag(_label(value))
        if tag and tag not in seen:
            seen.add(tag)
            tags.append(tag)

    for item in (omkar_item.get("cuisines") or []):
        _add(item)
    for item in (omkar_item.get("establishment_types") or []):
        _add(item)
    for item in (omkar_item.get("meal_types") or []):
        _add(item)
    return tags[:5]


def restaurant_base_price(omkar_item: dict) -> Optional[int]:
    value = omkar_item.get("price_range") or omkar_item.get("price_level")
    if not value:
        return None
    text = str(value).strip()
    return PRICE_RANGE_VND.get(text)


# Substring nào trong subcategory.name → loại khỏi must_visit (TA award cho cả spa/shopping)
_NOT_MUST_VISIT_KEYWORDS = ("spa", "shopping", "tour", "nightlife", "bar", "club", "mall")


def is_must_visit(ta_detail: dict, reviews: int) -> bool:
    """Tín hiệu mạnh: Travelers Choice award + top 10 ranking + ≥2000 reviews.
    Loại bằng substring match: 'wellness_spas' chứa 'spa' → reject."""
    awards = ta_detail.get("awards") or []
    has_tc = any((a.get("award_type") or "").lower().startswith("travelers choice") for a in awards)
    if not has_tc:
        return False

    rank_str = (ta_detail.get("ranking_data") or {}).get("ranking")
    try:
        rank = int(rank_str) if rank_str else 999
    except (ValueError, TypeError):
        rank = 999

    subcat_names = [(sc.get("name") or "").lower() for sc in (ta_detail.get("subcategory") or [])]
    if any(kw in name for name in subcat_names for kw in _NOT_MUST_VISIT_KEYWORDS):
        return False

    return rank <= 10 and reviews >= 2000


def _safe_int(v: Any) -> Optional[int]:
    try:
        return int(v) if v not in (None, "") else None
    except (ValueError, TypeError):
        return None


def priority_score(ta_detail: dict, reviews: int) -> int:
    """0-10. Top % + review tier."""
    score = 0
    rd = ta_detail.get("ranking_data") or {}
    try:
        rank = int(rd.get("ranking") or 0)
        total = int(rd.get("ranking_out_of") or 0)
    except (ValueError, TypeError):
        rank = total = 0
    if rank and total:
        pct = rank / total
        if pct <= 0.05:   score += 6
        elif pct <= 0.15: score += 4
        elif pct <= 0.30: score += 2
    if   reviews > 5000: score += 4
    elif reviews > 2000: score += 3
    elif reviews >  500: score += 2
    elif reviews >  100: score += 1
    return min(10, score)


def extract_image_urls(photos: list[dict]) -> list[str]:
    """Lấy URL 'large' (550px) — chất lượng tốt cho web, kích thước hợp lý."""
    urls = []
    for p in photos:
        imgs = p.get("images") or {}
        url = (imgs.get("large") or imgs.get("medium") or imgs.get("original") or {}).get("url")
        if url:
            urls.append(url)
    return urls


# ── Mapping ───────────────────────────────────────────────────────────────────

def map_place(omkar_item: dict, ta_detail: Optional[dict],
              ta_photos_data: list[dict], destination: str,
              db_category: str = "ATTRACTION") -> Optional[dict]:
    """Combine omkar list + TA details + TA photos → places row."""
    name = ((ta_detail or {}).get("name") or omkar_item.get("name") or "").strip()
    if not name:
        return None

    eid = (ta_detail or {}).get("location_id") or item_entity_id(omkar_item)
    ta_d = ta_detail or {}

    # Coords (TA returns string; cast to float). (0,0) là sentinel "không có data" → NULL.
    try:
        lat = float(ta_d.get("latitude")) if ta_d.get("latitude") else None
    except (ValueError, TypeError):
        lat = None
    try:
        lng = float(ta_d.get("longitude")) if ta_d.get("longitude") else None
    except (ValueError, TypeError):
        lng = None
    if lat == 0 and lng == 0:
        lat = lng = None
    if not is_in_vietnam_bounds(lat, lng):
        return None

    addr_obj = ta_d.get("address_obj") or {}
    open_t, close_t, hours_str = parse_hours_periods(ta_d.get("hours"))
    photo_urls = extract_image_urls(ta_photos_data)

    # Cover: TA photo[0] preferred, fallback omkar featured_image
    cover = photo_urls[0] if photo_urls else omkar_item.get("featured_image")
    images = list(photo_urls)
    if omkar_item.get("featured_image") and omkar_item["featured_image"] not in images:
        images.append(omkar_item["featured_image"])

    reviews = int(ta_d.get("num_reviews") or omkar_item.get("reviews") or 0)
    rating = ta_d.get("rating") if ta_d.get("rating") is not None else omkar_item.get("rating")

    subcats = [(sc.get("name") or "") for sc in (ta_d.get("subcategory") or [])]
    duration = 60 if db_category == "FOOD" else estimate_duration(subcats)
    tags = restaurant_tags(omkar_item) if db_category == "FOOD" else parse_tags(ta_d, omkar_item)
    base_price = restaurant_base_price(omkar_item) if db_category == "FOOD" else None

    rd = ta_d.get("ranking_data") or {}
    metadata = {
        "source":            "tripadvisor",
        "entity_id":         eid,
        "rank":              _safe_int(rd.get("ranking")),
        "rank_total":        _safe_int(rd.get("ranking_out_of")),
        "awards":            [
            {"year": a.get("year"), "type": a.get("award_type")}
            for a in (ta_d.get("awards") or [])
            if a.get("award_type")
        ],
        "subcategories":     [
            sc.get("name") for sc in (ta_d.get("subcategory") or []) if sc.get("name")
        ],
        "cuisines":          restaurant_tags(omkar_item) if db_category == "FOOD" else None,
        "price_range":       omkar_item.get("price_range") or omkar_item.get("price_level"),
        "photo_count_total": _safe_int(ta_d.get("photo_count")),
        "timezone":          ta_d.get("timezone"),
    }
    metadata = {k: v for k, v in metadata.items() if v not in (None, [], {}, "")}

    return {
        "destination":          destination,
        "category":             db_category,
        "name":                 name,
        "name_en":              name,
        "description":          ta_d.get("description") or omkar_item.get("description"),
        "address":              addr_obj.get("address_string"),
        "area":                 parse_area(addr_obj, (addr_obj.get("city") or "")),
        "latitude":             lat,
        "longitude":            lng,
        "cover_image":          cover,
        "images":               images,
        "rating":               float(rating) if rating is not None else None,
        "review_count":         reviews,
        "must_visit":           is_must_visit(ta_d, reviews),
        "priority_score":       priority_score(ta_d, reviews),
        "best_time_of_day":     None,
        "tags":                 tags,
        "open_time":            open_t,
        "close_time":           close_t,
        "hours":                hours_str,
        "recommended_duration": duration,
        "base_price":           base_price,
        "phone":                ta_d.get("phone"),
        "website":              ta_d.get("website"),
        "external_id":          str(eid) if eid else None,
        "external_source":      "tripadvisor",
        "metadata":             metadata,
        "source_url":           ta_d.get("web_url") or omkar_item.get("link"),
    }


# ── DB ────────────────────────────────────────────────────────────────────────

UPSERT_SQL_TPL = """
INSERT INTO {schema}.places (
    destination, category, name, name_en, description,
    address, area, latitude, longitude,
    cover_image, images, rating, review_count,
    must_visit, priority_score, best_time_of_day, tags,
    open_time, close_time, hours, recommended_duration,
    base_price, phone, website,
    external_id, external_source, metadata, source_url
) VALUES (
    $1, $2::{schema}.place_category, $3, $4, $5,
    $6, $7, $8, $9,
    $10, $11::text[], $12, $13,
    $14, $15, $16, $17::text[],
    $18::time, $19::time, $20, $21,
    $22, $23, $24,
    $25, $26, $27::jsonb, $28
)
ON CONFLICT (external_source, external_id) WHERE external_id IS NOT NULL
DO UPDATE SET
    destination          = EXCLUDED.destination,
    name                 = EXCLUDED.name,
    description          = COALESCE(EXCLUDED.description, {schema}.places.description),
    address              = COALESCE(EXCLUDED.address, {schema}.places.address),
    area                 = COALESCE(EXCLUDED.area, {schema}.places.area),
    latitude             = COALESCE(EXCLUDED.latitude, {schema}.places.latitude),
    longitude            = COALESCE(EXCLUDED.longitude, {schema}.places.longitude),
    cover_image          = CASE
                              WHEN COALESCE(cardinality(EXCLUDED.images), 0) >= COALESCE(cardinality({schema}.places.images), 0)
                              THEN COALESCE(EXCLUDED.cover_image, {schema}.places.cover_image)
                              ELSE {schema}.places.cover_image
                           END,
    images               = CASE
                              WHEN COALESCE(cardinality(EXCLUDED.images), 0) >= COALESCE(cardinality({schema}.places.images), 0)
                              THEN EXCLUDED.images
                              ELSE {schema}.places.images
                           END,
    rating               = COALESCE(EXCLUDED.rating, {schema}.places.rating),
    review_count         = GREATEST(EXCLUDED.review_count, {schema}.places.review_count),
    must_visit           = EXCLUDED.must_visit,
    priority_score       = EXCLUDED.priority_score,
    tags                 = CASE
                              WHEN COALESCE(cardinality(EXCLUDED.tags), 0) > 0 THEN EXCLUDED.tags
                              ELSE {schema}.places.tags
                           END,
    open_time            = COALESCE(EXCLUDED.open_time, {schema}.places.open_time),
    close_time           = COALESCE(EXCLUDED.close_time, {schema}.places.close_time),
    hours                = COALESCE(EXCLUDED.hours, {schema}.places.hours),
    recommended_duration = COALESCE(EXCLUDED.recommended_duration, {schema}.places.recommended_duration),
    phone                = COALESCE(EXCLUDED.phone, {schema}.places.phone),
    website              = COALESCE(EXCLUDED.website, {schema}.places.website),
    metadata             = COALESCE({schema}.places.metadata, '{{}}'::jsonb) || COALESCE(EXCLUDED.metadata, '{{}}'::jsonb),
    source_url           = COALESCE(EXCLUDED.source_url, {schema}.places.source_url),
    updated_at           = NOW()
RETURNING (xmax = 0) AS inserted;
"""


async def upsert_places(conn: asyncpg.Connection, places: list[dict]) -> tuple[int, int]:
    sql = UPSERT_SQL_TPL.format(schema=DB_SCHEMA)
    inserted = updated = 0
    for p in places:
        row = await conn.fetchrow(
            sql,
            p["destination"], p["category"], p["name"], p["name_en"], p["description"],
            p["address"], p["area"], p["latitude"], p["longitude"],
            p["cover_image"], p["images"] or [], p["rating"], p["review_count"],
            p["must_visit"], p["priority_score"], p["best_time_of_day"], p["tags"] or [],
            p["open_time"], p["close_time"], p["hours"], p["recommended_duration"],
            p["base_price"], p["phone"], p["website"],
            p["external_id"], p["external_source"],
            json.dumps(p["metadata"], ensure_ascii=False), p["source_url"],
        )
        if row and row["inserted"]:
            inserted += 1
        else:
            updated += 1
    return inserted, updated


async def clear_all(conn: asyncpg.Connection) -> int:
    n = await conn.fetchval(f"SELECT COUNT(*) FROM {DB_SCHEMA}.places")
    await conn.execute(f"TRUNCATE {DB_SCHEMA}.places CASCADE")
    return n


async def clear_destination(conn: asyncpg.Connection, destination: str) -> int:
    return await conn.fetchval(
        f"WITH d AS (DELETE FROM {DB_SCHEMA}.places WHERE LOWER(destination) = LOWER($1) RETURNING 1) "
        f"SELECT COUNT(*) FROM d",
        destination,
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def load_import_targets(path: Path) -> list[dict]:
    """Load batch targets from JSON array or JSONL.

    Required per item:
      - query: source search query sent to TripAdvisor/omkar
      - destination: destination label stored in DB

    Extra fields (region/type/notes/aliases) are ignored by the importer but kept
    in the list file for humans.
    """
    if not path.exists():
        raise FileNotFoundError(f"List file not found: {path}")

    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return []

    if path.suffix.lower() == ".json":
        data = json.loads(raw)
        if not isinstance(data, list):
            raise ValueError("JSON list file must contain an array")
        items = data
    else:
        items = []
        for lineno, line in enumerate(raw.splitlines(), 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at {path}:{lineno}: {exc}") from exc

    targets: list[dict] = []
    for idx, item in enumerate(items, 1):
        if not isinstance(item, dict):
            raise ValueError(f"Target #{idx} must be an object")
        query = str(item.get("query") or "").strip()
        destination = str(item.get("destination") or "").strip()
        if not query or not destination:
            raise ValueError(f"Target #{idx} requires non-empty query and destination")
        targets.append(item)
    return targets


def category_keys(cat: str) -> list[str]:
    if cat == "all":
        return ["attractions", "food"]
    if cat not in CATEGORY_CONFIG:
        raise ValueError(f"Unsupported category: {cat}")
    return [cat]


async def run_batch(args: argparse.Namespace) -> int:
    targets = load_import_targets(Path(args.list_file))
    if args.group:
        targets = [target for target in targets if str(target.get("group") or "") == args.group]
    if args.list_limit:
        targets = targets[:args.list_limit]
    if not targets:
        print("✗ List file không có target nào")
        return 2
    if args.clear_all:
        print("✗ Không hỗ trợ --clear-all khi chạy --list-file")
        return 2
    if args.clear_destination:
        print("✗ Không hỗ trợ --clear-destination khi chạy --list-file vì nhiều query có thể chung destination")
        return 2

    cats = category_keys(args.cat)
    print(f"🚀 Batch import: {len(targets)} targets từ {args.list_file} (cat={args.cat}, group={args.group or 'all'})")
    ok = failed = 0
    total_jobs = len(targets) * len(cats)
    job = 0
    for i, target in enumerate(targets, 1):
        for cat in cats:
            job += 1
            query = str(target["query"]).strip()
            destination = str(target["destination"]).strip()
            pages = int(args.pages if args.pages is not None else target.get("pages") or 2)
            print(f"\n{'=' * 78}\n[{job}/{total_jobs}] {destination} [{cat}] ← query={query!r}, pages={pages}")

            target_args = SimpleNamespace(
                query=query,
                destination=destination,
                cat=cat,
                pages=pages,
                sleep=args.sleep,
                dry_run=args.dry_run,
                clear_all=False,
                clear_destination=False,
            )
            code = await run(target_args)
            if code == 0:
                ok += 1
            else:
                failed += 1
                if not args.continue_on_error:
                    print(f"\n✗ Dừng batch tại target #{i}. Thêm --continue-on-error để bỏ qua lỗi.")
                    return code

    print(f"\n✅ BATCH DONE: ok={ok}, failed={failed}, total={total_jobs}")
    return 0

async def run(args: argparse.Namespace) -> int:
    if not OMKAR_KEY:
        print("✗ TRIPADVISOR_API_KEY (omkar) chưa set")
        return 2
    if not TA_KEY:
        print("✗ TRIPADVISOR_OFFICIAL_API_KEY chưa set")
        return 2

    config = CATEGORY_CONFIG[args.cat]
    api_seg = config["api_seg"]
    db_category = config["db_category"]

    print(f"→ Resolve '{args.query}' qua omkar /{api_seg}/search...")
    loc = resolve_entity_id(args.query, api_seg=api_seg)
    if not loc:
        print(f"✗ Không resolve được entity_id cho '{args.query}'")
        return 2
    print(f"  ✓ {loc['name']} (type={loc['place_type']}, id={loc['id']})")

    all_items: list[dict] = []
    list_errors: list[str] = []
    pages = args.pages or 2
    for page in range(1, pages + 1):
        try:
            items = omkar_list(loc["id"], page, api_seg=api_seg)
            print(f"  ✓ omkar list page {page}: {len(items)} items")
            all_items.extend(items)
        except requests.RequestException as exc:
            msg = f"page {page}: {exc}"
            list_errors.append(msg)
            print(f"  ⚠ omkar list {msg}")
        time.sleep(args.sleep)
    if not all_items:
        search_fallback = [
            item for item in omkar_search(args.query, api_seg=api_seg)
            if item_entity_id(item)
        ]
        if not search_fallback:
            print("✗ Empty list")
            return 2
        all_items = search_fallback[:30]
        reason = "lỗi" if list_errors else "rỗng"
        print(f"  ⚠ omkar list {reason}, fallback sang search results: {len(all_items)} items")

    print(f"\n→ Enriching {len(all_items)} {config['label']} qua official TA "
          f"(/details + /photos)...")
    places: list[dict] = []
    detail_ok = detail_fail = 0
    for i, it in enumerate(all_items, 1):
        eid = item_entity_id(it)
        if not eid:
            continue

        detail = ta_details(str(eid))
        if detail:
            detail_ok += 1
        else:
            detail_fail += 1
        photos = ta_photos(str(eid), limit=10) if detail else []
        mapped = map_place(it, detail, photos, args.destination, db_category=db_category)
        if mapped:
            places.append(mapped)
            mark = "✓" if detail else "✗"
            print(f"  {mark} [{i:02d}/{len(all_items)}] {mapped['name'][:48]:48s}  "
                  f"lat={mapped['latitude']}  reviews={mapped['review_count']}  "
                  f"imgs={len(mapped['images'])}  dur={mapped['recommended_duration']}m")
        time.sleep(args.sleep)

    print(f"\n→ Enrichment summary: details OK={detail_ok}, FAIL={detail_fail}")
    print(f"→ Mapped {len(places)} places")

    if args.dry_run:
        if not places:
            print("\n=== DRY RUN — no mapped places ===")
            return 2
        print("\n=== DRY RUN — sample (1st place) ===")
        sample = {**places[0],
                  "metadata": "<...>",
                  "images": f"<{len(places[0]['images'])} urls>"}
        print(json.dumps(sample, ensure_ascii=False, indent=2, default=str))
        return 0

    print(f"\n→ Connecting DB: {DATABASE_URL.split('@')[-1]} (schema={DB_SCHEMA})")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        if args.clear_all:
            n = await clear_all(conn)
            print(f"  ⚠ TRUNCATE places CASCADE → cleared {n} rows")
        elif args.clear_destination:
            n = await clear_destination(conn, args.destination)
            print(f"  ⚠ DELETE destination={args.destination!r} → cleared {n} rows")

        inserted, updated = await upsert_places(conn, places)
        print(f"\n✅ DONE: inserted={inserted}, updated={updated}, total={inserted + updated}")

        n_dest = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places WHERE LOWER(destination) = LOWER($1)",
            args.destination,
        )
        n_coords = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND latitude IS NOT NULL",
            args.destination,
        )
        n_imgs = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND array_length(images, 1) >= 5",
            args.destination,
        )
        n_hours = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND hours IS NOT NULL",
            args.destination,
        )
        n_addr = await conn.fetchval(
            f"SELECT COUNT(*) FROM {DB_SCHEMA}.places "
            f"WHERE LOWER(destination) = LOWER($1) AND address IS NOT NULL",
            args.destination,
        )
        print(f"\n   📊 Verification for {args.destination!r}:")
        print(f"      total           = {n_dest}")
        print(f"      có coords       = {n_coords}  ({100*n_coords//max(n_dest,1)}%)")
        print(f"      có address      = {n_addr}  ({100*n_addr//max(n_dest,1)}%)")
        print(f"      có hours        = {n_hours}  ({100*n_hours//max(n_dest,1)}%)")
        print(f"      có >=5 images   = {n_imgs}  ({100*n_imgs//max(n_dest,1)}%)")
    finally:
        await conn.close()
    return 0


async def run_one_or_all(args: argparse.Namespace) -> int:
    code = 0
    for cat in category_keys(args.cat):
        payload = vars(args).copy()
        payload["cat"] = cat
        target_args = SimpleNamespace(**payload)
        code = await run(target_args)
        if code != 0:
            return code
    return code


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--query",       help="Search query (e.g. 'Da Nang')")
    ap.add_argument("--destination", help="Destination label lưu vào DB (e.g. 'đà nẵng')")
    ap.add_argument("--list-file",   help="JSON/JSONL list of {query,destination,pages?} targets")
    ap.add_argument("--group",       help="Batch mode: chỉ chạy target có group này (e.g. destination_brand)")
    ap.add_argument("--cat",         choices=["attractions", "food", "all"], default="attractions",
                    help="Import category: attractions, food, or all (default attractions)")
    ap.add_argument("--list-limit",  type=int, default=0, help="Chỉ chạy N target đầu tiên trong --list-file")
    ap.add_argument("--continue-on-error", action="store_true", help="Batch mode: tiếp tục khi một target lỗi")
    ap.add_argument("--pages",       type=int,   default=None,
                    help="Số page omkar list. Batch mặc định dùng pages trong list file, nếu truyền --pages thì override.")
    ap.add_argument("--sleep",       type=float, default=0.5, help="Sleep giữa các API call (default 0.5s)")
    ap.add_argument("--dry-run",     action="store_true", help="Không ghi DB; in mẫu 1 place")
    grp = ap.add_mutually_exclusive_group()
    grp.add_argument("--clear-all",         action="store_true",
                     help="TRUNCATE places CASCADE trước import")
    grp.add_argument("--clear-destination", action="store_true",
                     help="DELETE places của destination này trước import")
    args = ap.parse_args()
    if args.list_file:
        return asyncio.run(run_batch(args))
    if not args.query or not args.destination:
        ap.error("--query and --destination are required unless --list-file is used")
    return asyncio.run(run_one_or_all(args))


if __name__ == "__main__":
    sys.exit(main())
