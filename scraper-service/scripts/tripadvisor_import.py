#!/usr/bin/env python3
"""
TripAdvisor → DB import via omkar Travel Data API.
Docs: https://www.omkar.cloud/tools/travel-data-api/about

Pipeline (per destination, per category):
  1. /<cat>/search?query=<destination> Vietnam → resolve province location_id.
  2. /<cat>/list?query=<location_id>&page=1   → up to 30 entries.
  3. Map → CreatePlaceInput.
  4. POST → http://<backend>/api/v1/knowledge-base/seed (upsert by name).

Categories supported: attractions (→ ATTRACTION), restaurants (→ FOOD).

Usage:
  python tripadvisor_import.py --dest "An Giang" --cat food
  python tripadvisor_import.py --dest "An Giang" --cat all
  python tripadvisor_import.py --bulk-missing --cat all
  python tripadvisor_import.py --dest "An Giang" --cat food --dry-run
  python tripadvisor_import.py --dest "Hưng Yên" --cat food --skip-existing-external
  python tripadvisor_import.py --bulk-fail-food --skip-existing-external  # fix 3 tỉnh food fail

Env: TRIPADVISOR_API_KEY, BACKEND_URL, BACKEND_JWT.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from typing import Optional

import requests

try:
    from dotenv import load_dotenv
    load_dotenv("/home/thahvinh/Desktop/Project_S/tripcompass/scraper-service/.env")
except ImportError:
    pass

# omkar Travel Data API key (primary)
API_KEY = os.getenv("TRIPADVISOR_API_KEY", "ok_85955b65730bffb2f65b927c587108ea")
# Official TripAdvisor Content API key (for photos backfill)
OFFICIAL_TA_KEY = os.getenv("TRIPADVISOR_OFFICIAL_API_KEY", "40A4381EA19F409482A459A25202CB03")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
PLACES_URL = f"{BACKEND_URL}/api/v1/places"
BACKEND_TOKEN = os.getenv("BACKEND_JWT", "")
TA_BASE = "https://travel-data-api.omkar.cloud/travel"
OFFICIAL_TA_BASE = "https://api.content.tripadvisor.com/api/v1"
HEADERS = {"API-Key": API_KEY}
SEED_HEADERS = {"Authorization": f"Bearer {BACKEND_TOKEN}"} if BACKEND_TOKEN else {}

# (label_vi, english_query_no_diacritics).
MISSING_DESTINATIONS: list[tuple[str, str]] = [
    ("An Giang", "An Giang Province Vietnam"),
    ("Bắc Ninh", "Bac Ninh Province Vietnam"),
    ("Cao Bằng", "Cao Bang Province Vietnam"),
    ("Cà Mau", "Ca Mau Province Vietnam"),
    ("Đồng Nai", "Dong Nai Province Vietnam"),
    ("Đồng Tháp", "Dong Thap Province Vietnam"),
    ("Đắk Lắk", "Dak Lak Province Vietnam"),
    ("Gia Lai", "Gia Lai Province Vietnam"),
    ("Hà Tĩnh", "Ha Tinh Province Vietnam"),
    ("Hưng Yên", "Hung Yen Province Vietnam"),
    ("Lai Châu", "Lai Chau Province Vietnam"),
    ("Lạng Sơn", "Lang Son Province Vietnam"),
    ("Phú Thọ", "Phu Tho Province Vietnam"),
    ("Quảng Ngãi", "Quang Ngai Province Vietnam"),
    ("Sơn La", "Son La Province Vietnam"),
    ("Tây Ninh", "Tay Ninh Province Vietnam"),
    ("Thái Nguyên", "Thai Nguyen Province Vietnam"),
    ("Thanh Hóa", "Thanh Hoa Province Vietnam"),
    ("Tuyên Quang", "Tuyen Quang Province Vietnam"),
    ("Vĩnh Long", "Vinh Long Province Vietnam"),
    ("Điện Biên", "Dien Bien Province Vietnam"),
]

# Per category: API path segment + DB place_category enum.
CATEGORIES = {
    "attractions": ("attractions", "ATTRACTION"),
    "food":        ("restaurants", "FOOD"),
}

# 3 tỉnh food fail do unique index collision — chạy lại với --skip-existing-external
FAIL_FOOD_DESTINATIONS: list[tuple[str, str]] = [
    ("Hưng Yên",   "Hung Yen Province Vietnam"),
    ("Lạng Sơn",   "Lang Son Province Vietnam"),
    ("Thái Nguyên", "Thai Nguyen Province Vietnam"),
]


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def resolve_location_id(api_seg: str, query: str, expected_dest: str) -> Optional[dict]:
    r = requests.get(f"{TA_BASE}/{api_seg}/search", params={"query": query}, headers=HEADERS, timeout=30)
    r.raise_for_status()
    results = r.json().get("results", [])
    if not results:
        return None

    norm_dest = normalize(expected_dest)
    candidates = [
        x for x in results
        if x.get("place_type") in ("PROVINCE", "MUNICIPALITY")
        and norm_dest in normalize(x.get("name", ""))
    ]
    if not candidates:
        candidates = [x for x in results if norm_dest in normalize(x.get("name", ""))]
    if not candidates:
        candidates = results

    top = candidates[0]
    return {
        "id": str(top["tripadvisor_entity_id"]),
        "name": top.get("name", query),
        "place_type": top.get("place_type"),
    }


def fetch_list(api_seg: str, location_id: str, page: int = 1) -> list[dict]:
    r = requests.get(
        f"{TA_BASE}/{api_seg}/list",
        params={"query": location_id, "page": str(page)},
        headers=HEADERS,
        timeout=60,
    )
    r.raise_for_status()
    return r.json().get("results", [])


def parse_price_usd_to_vnd(text: Optional[str]) -> Optional[int]:
    if not text:
        return None
    m = re.search(r"\$(\d+(?:\.\d+)?)", text)
    if not m:
        return None
    return int(float(m.group(1)) * 25_000)


PRICE_RANGE_VND = {  # rough mid-point estimates per person
    "$": 80_000,
    "$$": 200_000,
    "$$$": 500_000,
    "$$$$": 1_200_000,
}


def first_open_close(hours: list) -> tuple[Optional[str], Optional[str]]:
    """Take Monday's first window if available."""
    if not hours:
        return None, None
    for day in hours:
        times = day.get("times") or []
        if times:
            return times[0].get("open"), times[0].get("close")
    return None, None


def map_attraction(item: dict, destination: str) -> Optional[dict]:
    name = (item.get("name") or "").strip()
    if not name:
        return None
    reviews = item.get("reviews") or 0
    img = item.get("featured_image")
    cats = item.get("categories") or []
    tags = sorted({(c.get("name") or "").strip().lower() for c in cats if c.get("name")})

    metadata = {
        "source": "tripadvisor",
        "tripadvisor_entity_id": item.get("tripadvisor_entity_id"),
        "pricing_text": item.get("pricing_text"),
        "tickets_link": (item.get("commerce") or {}).get("tickets_link"),
        "experiences_count": (item.get("experiences") or {}).get("experiences_count"),
    }
    metadata = {k: v for k, v in metadata.items() if v is not None}

    return {
        "destination": destination,
        "category": "ATTRACTION",
        "name": name,
        "name_en": name,
        "description": item.get("description"),
        "address": None,
        "area": item.get("neighborhood"),
        "latitude": None,
        "longitude": None,
        "cover_image": img,
        "images": [img] if img else [],
        "rating": float(item["rating"]) if item.get("rating") is not None else None,
        "review_count": int(reviews) if isinstance(reviews, (int, float)) else 0,
        "hours": None,
        "recommended_duration": 120,
        "base_price": parse_price_usd_to_vnd(item.get("pricing_text")),
        "external_id": str(item["tripadvisor_entity_id"]) if item.get("tripadvisor_entity_id") else None,
        "external_source": "tripadvisor",
        "metadata": metadata,
        "source_url": item.get("link"),
        "must_visit": False,
        "priority_score": min(10, int((reviews or 0) / 1000)),
        "best_time_of_day": "any",
        "tags": tags,
    }


def map_restaurant(item: dict, destination: str) -> Optional[dict]:
    name = (item.get("name") or "").strip()
    if not name:
        return None
    reviews = item.get("reviews") or 0
    img = item.get("featured_image")
    addr = item.get("address") or {}
    coords = item.get("coordinates") or {}
    open_t, close_t = first_open_close(item.get("hours") or [])

    def _label(x):
        if isinstance(x, dict):
            return (x.get("name") or "").strip().lower()
        return str(x).strip().lower()

    cuisines = [s for s in (_label(c) for c in (item.get("cuisines") or [])) if s]
    estab = [s for s in (_label(e) for e in (item.get("establishment_types") or [])) if s]
    tags = sorted(set(cuisines + estab))

    price_range = item.get("price_range")
    base_price = PRICE_RANGE_VND.get(price_range) if price_range else None

    metadata = {
        "source": "tripadvisor",
        "tripadvisor_entity_id": item.get("tripadvisor_entity_id"),
        "price_range": price_range,
        "cuisines": cuisines,
        "establishment_types": estab,
        "has_reservation": item.get("has_reservation"),
        "has_delivery": item.get("has_delivery"),
        "menu_link": item.get("menu_link"),
        "award": item.get("award"),
    }
    metadata = {k: v for k, v in metadata.items() if v is not None}

    hours_str = None
    if open_t and close_t:
        hours_str = f"{open_t} - {close_t}"

    return {
        "destination": destination,
        "category": "FOOD",
        "name": name,
        "name_en": name,
        "description": None,
        "address": addr.get("address"),
        "area": (item.get("parent_location") or {}).get("name"),
        "latitude": coords.get("latitude"),
        "longitude": coords.get("longitude"),
        "cover_image": img,
        "images": [img] if img else [],
        "rating": float(item["rating"]) if item.get("rating") is not None else None,
        "review_count": int(reviews) if isinstance(reviews, (int, float)) else 0,
        "hours": hours_str,
        "recommended_duration": 60,
        "base_price": base_price,
        "phone": item.get("phone"),
        "website": item.get("menu_link"),
        "external_id": str(item["tripadvisor_entity_id"]) if item.get("tripadvisor_entity_id") else None,
        "external_source": "tripadvisor",
        "metadata": metadata,
        "source_url": item.get("link"),
        "must_visit": False,
        "priority_score": min(10, int((reviews or 0) / 500)),
        "best_time_of_day": "any",
        "tags": tags,
    }


MAPPERS = {"attractions": map_attraction, "food": map_restaurant}


def fetch_existing_external_ids(destination_label: str) -> set[str]:
    """Query backend /places endpoint to get external_ids already in DB for this destination.
    Falls back to empty set if endpoint unavailable (safe to continue without dedup)."""
    try:
        dest_ascii = normalize(destination_label)
        r = requests.get(
            PLACES_URL,
            params={"destination": dest_ascii, "external_source": "tripadvisor", "limit": 500},
            headers=SEED_HEADERS,
            timeout=15,
        )
        if r.status_code == 200:
            data = r.json()
            items = data if isinstance(data, list) else data.get("places", data.get("data", []))
            ids = {str(p["external_id"]) for p in items if p.get("external_id")}
            print(f"  ℹ Fetched {len(ids)} existing external_ids for '{destination_label}'")
            return ids
        else:
            print(f"  ⚠ Could not fetch existing external_ids (HTTP {r.status_code}) — proceeding without dedup")
    except Exception as e:
        print(f"  ⚠ Dedup query failed: {e} — proceeding without dedup")
    return set()


def fetch_photos_official(location_id: str, limit: int = 10) -> list[str]:
    """Fetch photo URLs from official TripAdvisor Content API.
    Returns list of image URLs. Empty list if API unavailable."""
    try:
        r = requests.get(
            f"{OFFICIAL_TA_BASE}/location/{location_id}/photos",
            params={"key": OFFICIAL_TA_KEY, "language": "en", "limit": str(limit)},
            timeout=20,
        )
        if r.status_code == 200:
            data = r.json()
            photos = data.get("data", [])
            urls = []
            for p in photos:
                # Official API returns images.original/large/medium
                src = p.get("images", {})
                url = (src.get("original") or src.get("large") or src.get("medium") or {}).get("url")
                if url:
                    urls.append(url)
            return urls
        else:
            print(f"  ⚠ Official TA photos API: HTTP {r.status_code} — skipping")
    except Exception as e:
        print(f"  ⚠ Official TA photos fetch failed: {e}")
    return []


def post_seed(destination: str, places: list[dict]) -> dict:
    payload = {"destination": destination, "places": places, "combos": []}
    r = requests.post(SEED_URL, json=payload, headers=SEED_HEADERS, timeout=60)
    r.raise_for_status()
    return r.json()


def import_destination_category(
    label_vi: str,
    query_en: str,
    cat_key: str,
    dry_run: bool = False,
    skip_existing_external: bool = False,
    fetch_extra_photos: bool = False,
) -> dict:
    api_seg, _enum = CATEGORIES[cat_key]
    print(f"\n→ {label_vi} [{cat_key}]  (query: {query_en!r})")

    loc = resolve_location_id(api_seg, query_en, label_vi)
    if not loc:
        print("  ✗ Resolve failed")
        return {"destination": label_vi, "cat": cat_key, "ok": False, "reason": "resolve_failed"}
    print(f"  ✓ Resolved: {loc['name']} ({loc['place_type']}, id={loc['id']})")

    items = fetch_list(api_seg, loc["id"])
    print(f"  ✓ Fetched {len(items)} entries")
    if not items:
        return {"destination": label_vi, "cat": cat_key, "ok": False, "reason": "empty_list"}

    mapper = MAPPERS[cat_key]
    places = [p for p in (mapper(it, label_vi) for it in items) if p]
    print(f"  ✓ Mapped {len(places)} valid places")

    # ── Dedup: skip places whose external_id already exists in DB ────────────
    if skip_existing_external:
        existing_ids = fetch_existing_external_ids(label_vi)
        if existing_ids:
            before = len(places)
            places = [
                p for p in places
                if not p.get("external_id") or str(p["external_id"]) not in existing_ids
            ]
            skipped = before - len(places)
            if skipped:
                print(f"  ℹ Dedup: skipped {skipped} places with existing external_id")

    if not places:
        print("  ℹ All places already exist in DB — nothing to seed")
        return {"destination": label_vi, "cat": cat_key, "ok": True, "places_created": 0, "places_updated": 0, "skipped_all": True}

    # ── Optional: fetch extra photos from official TripAdvisor API ────────────
    if fetch_extra_photos:
        for place in places:
            eid = place.get("external_id")
            if eid:
                extra = fetch_photos_official(eid, limit=10)
                if extra:
                    existing = place.get("images") or []
                    # Merge: cover first, then extra, deduplicate
                    merged = list(dict.fromkeys([place["cover_image"]] + extra + existing))
                    place["images"] = [u for u in merged if u]
                    if not place.get("cover_image") and place["images"]:
                        place["cover_image"] = place["images"][0]
                    print(f"    📷 {place['name']}: {len(place['images'])} photos")

    if dry_run:
        print(json.dumps(places[0], ensure_ascii=False, indent=2)[:800])
        return {"destination": label_vi, "cat": cat_key, "ok": True, "dry_run": True, "count": len(places)}

    result = post_seed(label_vi, places)
    print(f"  ✓ Seed: created={result.get('places_created',0)}, updated={result.get('places_updated',0)}")
    return {"destination": label_vi, "cat": cat_key, "ok": True, **result}


def main():
    ap = argparse.ArgumentParser(description="TripAdvisor → DB import via omkar Travel Data API.")
    ap.add_argument("--dest", help="Single destination, e.g. 'An Giang'")
    ap.add_argument("--query", help="Override English query")
    ap.add_argument("--bulk-missing",   action="store_true", help="Import all MISSING_DESTINATIONS")
    ap.add_argument("--bulk-fail-food", action="store_true", help="Re-import 3 fail food destinations (Hưng Yên, Lạng Sơn, Thái Nguyên)")
    ap.add_argument("--cat", choices=["attractions", "food", "all"], default="all")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-existing-external", action="store_true",
                    help="Skip places whose external_id already exists in DB (fix unique constraint collisions)")
    ap.add_argument("--photos", action="store_true",
                    help="Fetch extra photos from official TripAdvisor Content API for richer images")
    ap.add_argument("--sleep", type=float, default=1.5)
    args = ap.parse_args()

    if not args.dest and not args.bulk_missing and not args.bulk_fail_food:
        ap.error("Provide --dest, --bulk-missing, or --bulk-fail-food")

    if args.bulk_fail_food:
        targets = FAIL_FOOD_DESTINATIONS
        # Force food only for the 3 fail destinations
        cats = ["food"]
    elif args.bulk_missing:
        targets = MISSING_DESTINATIONS
        cats = ["attractions", "food"] if args.cat == "all" else [args.cat]
    else:
        default_q = args.query or f"{normalize(args.dest).title()} Province Vietnam"
        targets = [(args.dest, default_q)]
        cats = ["attractions", "food"] if args.cat == "all" else [args.cat]

    summary = []
    for label, query in targets:
        for cat in cats:
            try:
                res = import_destination_category(
                    label, query, cat,
                    dry_run=args.dry_run,
                    skip_existing_external=args.skip_existing_external,
                    fetch_extra_photos=args.photos,
                )
            except requests.HTTPError as e:
                print(f"  ✗ HTTP error: {e}")
                res = {"destination": label, "cat": cat, "ok": False, "reason": str(e)}
            except Exception as e:
                print(f"  ✗ Error: {e}")
                res = {"destination": label, "cat": cat, "ok": False, "reason": str(e)}
            summary.append(res)
            time.sleep(args.sleep)

    ok = sum(1 for s in summary if s.get("ok"))
    created = sum(s.get("places_created", 0) for s in summary)
    updated = sum(s.get("places_updated", 0) for s in summary)
    print(f"\n=== DONE: {ok}/{len(summary)} ok | created={created}, updated={updated} ===")
    if any(not s.get("ok") for s in summary):
        print("Failed:", [s for s in summary if not s.get("ok")])
    return 0 if ok == len(summary) else 1


if __name__ == "__main__":
    sys.exit(main())
