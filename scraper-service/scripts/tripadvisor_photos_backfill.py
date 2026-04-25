#!/usr/bin/env python3
"""
tripadvisor_photos_backfill.py — Backfill images từ official TripAdvisor Content API.

Với mỗi place có external_source='tripadvisor' và external_id trong DB:
  1. Gọi official TA GET /location/{id}/photos (key=TRIPADVISOR_OFFICIAL_API_KEY)
  2. Lấy tối đa 10-15 ảnh (original/large URL)
  3. Re-seed qua POST /api/v1/knowledge-base/seed để update images array

API docs: https://tripadvisor-content-api.readme.io/reference/getlocationphotos

Usage:
  python tripadvisor_photos_backfill.py --dest "An Giang"
  python tripadvisor_photos_backfill.py --bulk-all
  python tripadvisor_photos_backfill.py --dest "Đà Nẵng" --min-photos 5 --dry-run

Env: TRIPADVISOR_OFFICIAL_API_KEY, BACKEND_URL, BACKEND_JWT.

Note: Official API miễn phí cho non-commercial / limited use.
      Rate limit: 5000 calls/month, cool cache 2s giữa mỗi request.
"""
from __future__ import annotations

import argparse
import json
import os
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

OFFICIAL_TA_KEY = os.getenv("TRIPADVISOR_OFFICIAL_API_KEY", "40A4381EA19F409482A459A25202CB03")
BACKEND_URL     = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
PLACES_URL      = f"{BACKEND_URL}/api/v1/places"
SEED_URL        = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
BACKEND_TOKEN   = os.getenv("BACKEND_JWT", "")
OFFICIAL_BASE   = "https://api.content.tripadvisor.com/api/v1"
AUTH_HEADERS    = {"Authorization": f"Bearer {BACKEND_TOKEN}"} if BACKEND_TOKEN else {}
SEED_HEADERS    = {**AUTH_HEADERS}


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


# ── Fetch ──────────────────────────────────────────────────────────────────────

def fetch_places_from_backend(destination: str) -> list[dict]:
    """Lấy danh sách places từ backend theo destination."""
    dest_ascii = normalize(destination)
    params = {"limit": 500}
    # Try both vi and ascii name
    for dest_param in [destination, dest_ascii]:
        try:
            r = requests.get(
                PLACES_URL,
                params={**params, "destination": dest_param},
                headers=AUTH_HEADERS,
                timeout=15,
            )
            if r.status_code == 200:
                data = r.json()
                items = data if isinstance(data, list) else data.get("places", data.get("data", []))
                ta_places = [p for p in items if p.get("external_source") == "tripadvisor" and p.get("external_id")]
                if ta_places:
                    print(f"  ✓ Found {len(ta_places)} TripAdvisor places for '{destination}'")
                    return ta_places
        except Exception as e:
            print(f"  ⚠ Backend query failed ({dest_param!r}): {e}")
    print(f"  ⚠ No TripAdvisor places found in DB for '{destination}'")
    return []


def fetch_photos_official(location_id: str, limit: int = 15) -> list[str]:
    """Fetch photo URLs từ official TripAdvisor Content API.
    Returns: list of image URL strings (original/large resolution)."""
    try:
        r = requests.get(
            f"{OFFICIAL_BASE}/location/{location_id}/photos",
            params={"key": OFFICIAL_TA_KEY, "language": "en", "limit": str(limit)},
            timeout=20,
        )
        if r.status_code == 200:
            data = r.json()
            photos = data.get("data", [])
            urls = []
            for p in photos:
                src = p.get("images", {})
                # Priority: original > large > medium > small
                url = None
                for size in ("original", "large", "medium", "small"):
                    url = (src.get(size) or {}).get("url")
                    if url:
                        break
                if url:
                    urls.append(url)
            return urls
        elif r.status_code == 403:
            print(f"  ⚠ Official TA API 403 Forbidden for id={location_id} — key may need domain whitelist")
        elif r.status_code == 429:
            print(f"  ⚠ Rate limited — sleeping 5s")
            time.sleep(5)
        else:
            print(f"  ⚠ Official TA API HTTP {r.status_code} for id={location_id}")
    except Exception as e:
        print(f"  ⚠ Photos fetch error for id={location_id}: {e}")
    return []


def fetch_photos_omkar_detail(location_id: str) -> list[str]:
    """Fallback: fetch ảnh từ omkar detail endpoint (dùng thay official TA nếu 403)."""
    omkar_key = os.getenv("TRIPADVISOR_API_KEY", "ok_85955b65730bffb2f65b927c587108ea")
    try:
        for seg in ("attractions", "restaurants"):
            r = requests.get(
                f"https://travel-data-api.omkar.cloud/travel/{seg}/detail",
                params={"query": location_id},
                headers={"API-Key": omkar_key},
                timeout=30,
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("name"):
                    # omkar returns photos array
                    photos = data.get("photos") or []
                    urls = [p.get("url") or p.get("link") for p in photos if isinstance(p, dict)]
                    urls = [u for u in urls if u]
                    # Also grab featured_image if present
                    featured = data.get("featured_image")
                    if featured and featured not in urls:
                        urls.insert(0, featured)
                    return urls[:15]
    except Exception as e:
        print(f"  ⚠ Omkar detail fallback failed for id={location_id}: {e}")
    return []


# ── Update ─────────────────────────────────────────────────────────────────────

def build_seed_payload(place: dict, new_images: list[str]) -> dict:
    """Merge new images into existing and return seed-compatible place dict."""
    existing = list(place.get("images") or [])
    cover = place.get("cover_image") or (existing[0] if existing else None)

    # Deduplicate: cover first, then new, then existing
    all_images = list(dict.fromkeys(
        ([cover] if cover else []) + new_images + existing
    ))
    all_images = [u for u in all_images if u]

    return {
        "destination": place["destination"],
        "category":    place["category"],
        "name":        place["name"],
        "name_en":     place.get("name_en") or place["name"],
        "cover_image": all_images[0] if all_images else cover,
        "images":      all_images,
        # Preserve all other fields
        "description":          place.get("description"),
        "address":              place.get("address"),
        "area":                 place.get("area"),
        "latitude":             place.get("latitude"),
        "longitude":            place.get("longitude"),
        "rating":               place.get("rating"),
        "review_count":         place.get("review_count", 0),
        "hours":                place.get("hours"),
        "recommended_duration": place.get("recommended_duration", 90),
        "base_price":           place.get("base_price"),
        "external_id":          place.get("external_id"),
        "external_source":      place.get("external_source", "tripadvisor"),
        "must_visit":           place.get("must_visit", False),
        "priority_score":       place.get("priority_score", 0),
        "best_time_of_day":     place.get("best_time_of_day", "any"),
        "tags":                 place.get("tags", []),
        "source_url":           place.get("source_url"),
        "phone":                place.get("phone"),
        "website":              place.get("website"),
    }


def seed_places(destination: str, places: list[dict]) -> dict:
    payload = {"destination": destination, "places": places, "combos": []}
    r = requests.post(SEED_URL, json=payload, headers=SEED_HEADERS, timeout=60)
    r.raise_for_status()
    return r.json()


# ── Main logic ─────────────────────────────────────────────────────────────────

def backfill_destination(destination: str, min_photos: int = 3, dry_run: bool = False,
                          use_omkar_fallback: bool = True, sleep: float = 2.0) -> dict:
    print(f"\n{'='*60}")
    print(f"📷 Backfill photos: {destination}")
    print(f"{'='*60}")

    places = fetch_places_from_backend(destination)
    if not places:
        return {"destination": destination, "ok": False, "reason": "no_ta_places"}

    updated = []
    skipped = 0
    for place in places:
        ext_id = str(place["external_id"])
        current_imgs = place.get("images") or []
        current_count = len([u for u in current_imgs if u])

        if current_count >= min_photos:
            skipped += 1
            continue

        print(f"\n  → {place['name']} (id={ext_id}, current images={current_count})")

        # Try official API first
        new_photos = fetch_photos_official(ext_id, limit=15)
        if not new_photos and use_omkar_fallback:
            print(f"    Fallback: trying omkar detail endpoint…")
            new_photos = fetch_photos_omkar_detail(ext_id)

        if not new_photos:
            print(f"    ⚠ No photos found — keeping existing {current_count} images")
            continue

        total = len(set([place.get("cover_image")] + new_photos + current_imgs) - {None})
        print(f"    ✓ Fetched {len(new_photos)} new photos → total {total}")

        seed_payload = build_seed_payload(place, new_photos)
        if dry_run:
            print(f"    [dry-run] Would update images: {seed_payload['images'][:3]}…")
        else:
            updated.append(seed_payload)

        time.sleep(sleep)

    result = {"destination": destination, "ok": True, "processed": len(places),
              "skipped_already_rich": skipped, "to_update": len(updated)}

    if updated and not dry_run:
        try:
            res = seed_places(destination, updated)
            result["seed_created"] = res.get("places_created", 0)
            result["seed_updated"] = res.get("places_updated", 0)
            print(f"\n  ✓ Seeded: created={result['seed_created']}, updated={result['seed_updated']}")
        except Exception as e:
            print(f"\n  ✗ Seed failed: {e}")
            result["ok"] = False
            result["reason"] = str(e)

    return result


# ── Destinations list ─────────────────────────────────────────────────────────

ALL_DESTINATIONS = [
    "An Giang", "Bắc Ninh", "Cao Bằng", "Cà Mau", "Đồng Nai", "Đồng Tháp",
    "Đắk Lắk", "Gia Lai", "Hà Tĩnh", "Hưng Yên", "Lai Châu", "Lạng Sơn",
    "Phú Thọ", "Quảng Ngãi", "Sơn La", "Tây Ninh", "Thái Nguyên",
    "Thanh Hóa", "Tuyên Quang", "Vĩnh Long", "Điện Biên",
]

PRIORITY_DESTINATIONS = [
    "Đà Nẵng", "Lâm Đồng", "Lào Cai", "Cần Thơ",
    "Hà Nội", "Hồ Chí Minh", "Hội An", "Khánh Hòa",
]


def main():
    ap = argparse.ArgumentParser(description="Backfill TripAdvisor photos cho places trong DB.")
    ap.add_argument("--dest", help="Single destination")
    ap.add_argument("--bulk-new",      action="store_true", help="Backfill 19 tỉnh mới import")
    ap.add_argument("--bulk-priority", action="store_true", help="Backfill destinations ưu tiên")
    ap.add_argument("--bulk-all",      action="store_true", help="Backfill tất cả destinations")
    ap.add_argument("--min-photos", type=int, default=3,
                    help="Chỉ update places có < N ảnh (default=3)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-omkar-fallback", action="store_true",
                    help="Không dùng omkar detail làm fallback nếu official API fail")
    ap.add_argument("--sleep", type=float, default=2.0,
                    help="Delay giữa mỗi API call (default=2s, tránh rate limit)")
    args = ap.parse_args()

    if not any([args.dest, args.bulk_new, args.bulk_priority, args.bulk_all]):
        ap.error("Provide --dest, --bulk-new, --bulk-priority, or --bulk-all")

    if args.bulk_all:
        targets = ALL_DESTINATIONS + PRIORITY_DESTINATIONS
    elif args.bulk_priority:
        targets = PRIORITY_DESTINATIONS
    elif args.bulk_new:
        targets = ALL_DESTINATIONS
    else:
        targets = [args.dest]

    print(f"🚀 Starting photos backfill: {len(targets)} destinations, min_photos={args.min_photos}")
    print(f"   official_key={'****' + OFFICIAL_TA_KEY[-4:] if OFFICIAL_TA_KEY else 'MISSING'}")
    print(f"   backend={BACKEND_URL}")
    print(f"   dry_run={args.dry_run}")

    summary = []
    for dest in targets:
        try:
            res = backfill_destination(
                dest,
                min_photos=args.min_photos,
                dry_run=args.dry_run,
                use_omkar_fallback=not args.no_omkar_fallback,
                sleep=args.sleep,
            )
        except Exception as e:
            print(f"  ✗ Unexpected error for {dest}: {e}")
            res = {"destination": dest, "ok": False, "reason": str(e)}
        summary.append(res)

    ok = sum(1 for s in summary if s.get("ok"))
    total_updated = sum(s.get("to_update", 0) for s in summary)
    print(f"\n{'='*60}")
    print(f"=== DONE: {ok}/{len(summary)} ok | places_to_update={total_updated} ===")
    if any(not s.get("ok") for s in summary):
        print("Failed:", [s for s in summary if not s.get("ok")])
    return 0 if ok == len(summary) else 1


if __name__ == "__main__":
    sys.exit(main())
