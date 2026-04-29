#!/usr/bin/env python3
"""
fix_all_data.py — Pipeline đầy đủ để fix toàn bộ data trong DB:

Thứ tự fix:
  1. Fix 3 tỉnh food fail (Hưng Yên, Lạng Sơn, Thái Nguyên) — skip-existing-external
  2. Import ảnh nhiều (19-21 ảnh/place) cho TẤT CẢ destinations có external_id
  3. Import attractions cho destinations thiếu (Vĩnh Long, Hội An)
  4. Backfill description từ omkar detail endpoint (ai_description field)
  5. Summary report cuối

Usage:
  python3 fix_all_data.py --all          # chạy tất cả
  python3 fix_all_data.py --fix-food-fail  # chỉ fix 3 tỉnh food fail
  python3 fix_all_data.py --fix-images   # chỉ backfill ảnh
  python3 fix_all_data.py --fix-desc     # chỉ backfill description
  python3 fix_all_data.py --fix-missing  # chỉ import destinations thiếu
  python3 fix_all_data.py --all --dry-run

Env: TRIPADVISOR_API_KEY, BACKEND_URL, BACKEND_JWT
"""
from __future__ import annotations
import argparse, json, os, sys, time, unicodedata
from typing import Optional
import requests

try:
    from dotenv import load_dotenv
    load_dotenv("/home/thahvinh/Desktop/Project_S/tripcompass/scraper-service/.env")
except ImportError:
    pass

OMKAR_KEY    = os.getenv("TRIPADVISOR_API_KEY", "ok_85955b65730bffb2f65b927c587108ea")
BACKEND_URL  = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
BACKEND_JWT  = os.getenv("BACKEND_JWT", "")
TA_BASE      = "https://travel-data-api.omkar.cloud/travel"
OMKAR_H      = {"API-Key": OMKAR_KEY}
SEED_URL     = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
PLACES_URL   = f"{BACKEND_URL}/api/v1/places"
AUTH_H       = {"Authorization": f"Bearer {BACKEND_JWT}"} if BACKEND_JWT else {}
SEED_H       = {**AUTH_H, "Content-Type": "application/json"}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def resolve_location_id(api_seg: str, query: str, label: str) -> Optional[dict]:
    r = requests.get(f"{TA_BASE}/{api_seg}/search", params={"query": query}, headers=OMKAR_H, timeout=30)
    r.raise_for_status()
    results = r.json().get("results", [])
    norm_dest = norm(label)
    candidates = [x for x in results
                  if x.get("place_type") in ("PROVINCE", "MUNICIPALITY")
                  and norm_dest in norm(x.get("name", ""))]
    if not candidates:
        candidates = [x for x in results if norm_dest in norm(x.get("name", ""))]
    if not candidates:
        candidates = results
    if not candidates:
        return None
    top = candidates[0]
    return {"id": str(top["tripadvisor_entity_id"]), "name": top.get("name", query)}


def fetch_list(api_seg: str, loc_id: str, page: int = 1) -> list[dict]:
    r = requests.get(f"{TA_BASE}/{api_seg}/list",
                     params={"query": loc_id, "page": str(page)}, headers=OMKAR_H, timeout=60)
    r.raise_for_status()
    return r.json().get("results", [])


def fetch_detail(entity_id: str, category: str) -> Optional[dict]:
    """Fetch full detail (images, description, coords) from omkar detail endpoint."""
    seg = "restaurants" if category == "FOOD" else "attractions"
    try:
        r = requests.get(f"{TA_BASE}/{seg}/detail", params={"query": entity_id},
                         headers=OMKAR_H, timeout=30)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


def get_photos_from_detail(detail: dict) -> list[str]:
    imgs = detail.get("images") or []
    urls = [img["image_link"] for img in imgs if img.get("image_link")]
    featured = detail.get("featured_image")
    if featured and featured not in urls:
        urls.insert(0, featured)
    return urls[:20]


def seed(destination: str, places: list[dict]) -> dict:
    r = requests.post(SEED_URL, json={"destination": destination, "places": places, "combos": []},
                      headers=SEED_H, timeout=120)
    r.raise_for_status()
    return r.json()


def get_db_places(destination: str = "", external_source: str = "tripadvisor",
                  category: str = "") -> list[dict]:
    params = {"limit": 1000}
    if destination:
        params["destination"] = norm(destination)
    r = requests.get(PLACES_URL, params=params, headers=AUTH_H, timeout=30)
    if r.status_code != 200:
        return []
    data = r.json()
    items = data if isinstance(data, list) else data.get("data", data.get("places", []))
    result = items
    if external_source:
        result = [p for p in result if p.get("external_source") == external_source]
    if category:
        result = [p for p in result if p.get("category") == category]
    return result


PRICE_RANGE_VND = {"$": 80_000, "$$": 200_000, "$$$": 500_000, "$$$$": 1_200_000}

def map_attraction(item: dict, destination: str, detail: Optional[dict] = None) -> Optional[dict]:
    name = (item.get("name") or "").strip()
    if not name:
        return None
    reviews = item.get("reviews") or 0
    cats = item.get("categories") or []
    tags = sorted({(c.get("name") or "").strip().lower() for c in cats if c.get("name")})

    # Get photos: prefer detail (20 imgs), fallback list's featured_image
    if detail:
        images = get_photos_from_detail(detail)
        coords = detail.get("coordinates") or {}
        lat = coords.get("latitude")
        lng = coords.get("longitude")
        description = detail.get("ai_description") or detail.get("description")
        hours_data = detail.get("hours") or []
        hours_str = None
        for day in hours_data:
            times = day.get("times") or []
            if times:
                hours_str = f"{times[0].get('open','')}-{times[0].get('close','')}"
                break
        addr_obj = detail.get("address") or detail.get("detailed_address") or {}
        address = addr_obj.get("address") if isinstance(addr_obj, dict) else addr_obj
    else:
        img = item.get("featured_image")
        images = [img] if img else []
        lat = None
        lng = None
        description = None
        hours_str = None
        address = None

    cover = images[0] if images else item.get("featured_image")

    return {
        "destination": destination,
        "category": "ATTRACTION",
        "name": name,
        "name_en": name,
        "description": description,
        "address": address,
        "area": item.get("neighborhood"),
        "latitude": lat,
        "longitude": lng,
        "cover_image": cover,
        "images": images,
        "rating": float(item["rating"]) if item.get("rating") is not None else None,
        "review_count": int(reviews) if isinstance(reviews, (int, float)) else 0,
        "hours": hours_str,
        "recommended_duration": 120,
        "base_price": None,
        "external_id": str(item["tripadvisor_entity_id"]) if item.get("tripadvisor_entity_id") else None,
        "external_source": "tripadvisor",
        "must_visit": False,
        "priority_score": min(10, int((reviews or 0) / 1000)),
        "best_time_of_day": "any",
        "tags": tags,
        "source_url": item.get("link"),
        "metadata": {"source": "tripadvisor", "tripadvisor_entity_id": item.get("tripadvisor_entity_id")},
    }


def map_restaurant(item: dict, destination: str, detail: Optional[dict] = None) -> Optional[dict]:
    name = (item.get("name") or "").strip()
    if not name:
        return None
    reviews = item.get("reviews") or 0
    addr = item.get("address") or {}
    coords = item.get("coordinates") or {}

    if detail:
        images = get_photos_from_detail(detail)
        det_coords = detail.get("coordinates") or {}
        lat = det_coords.get("latitude") or coords.get("latitude")
        lng = det_coords.get("longitude") or coords.get("longitude")
        description = detail.get("ai_description") or detail.get("description")
        hours_data = detail.get("hours") or item.get("hours") or []
        det_addr = detail.get("address") or detail.get("detailed_address") or {}
        address = (det_addr.get("address") if isinstance(det_addr, dict) else det_addr) or addr.get("address")
    else:
        images = [item.get("featured_image")] if item.get("featured_image") else []
        lat = coords.get("latitude")
        lng = coords.get("longitude")
        description = None
        hours_data = item.get("hours") or []
        address = addr.get("address")

    cover = images[0] if images else item.get("featured_image")

    # hours string
    hours_str = None
    for day in (hours_data if isinstance(hours_data, list) else []):
        times = day.get("times") or []
        if times:
            hours_str = f"{times[0].get('open','')}-{times[0].get('close','')}"
            break
    # list endpoint provides hours directly
    if not hours_str and isinstance(item.get("hours"), list):
        for day in item["hours"]:
            times = day.get("times") or []
            if times:
                hours_str = f"{times[0].get('open','')}-{times[0].get('close','')}"
                break

    def _label(x):
        if isinstance(x, dict):
            return (x.get("name") or "").strip().lower()
        return str(x).strip().lower()

    cuisines = [_label(c) for c in (item.get("cuisines") or []) if _label(c)]
    estab = [_label(e) for e in (item.get("establishment_types") or []) if _label(e)]
    tags = sorted(set(cuisines + estab) - {""})
    price_range = item.get("price_range")
    base_price = PRICE_RANGE_VND.get(price_range) if price_range else None

    return {
        "destination": destination,
        "category": "FOOD",
        "name": name,
        "name_en": name,
        "description": description,
        "address": address,
        "area": (item.get("parent_location") or {}).get("name"),
        "latitude": lat,
        "longitude": lng,
        "cover_image": cover,
        "images": images,
        "rating": float(item["rating"]) if item.get("rating") is not None else None,
        "review_count": int(reviews) if isinstance(reviews, (int, float)) else 0,
        "hours": hours_str,
        "recommended_duration": 60,
        "base_price": base_price,
        "phone": item.get("phone"),
        "website": item.get("menu_link"),
        "external_id": str(item["tripadvisor_entity_id"]) if item.get("tripadvisor_entity_id") else None,
        "external_source": "tripadvisor",
        "must_visit": False,
        "priority_score": min(10, int((reviews or 0) / 500)),
        "best_time_of_day": "any",
        "tags": tags,
        "source_url": item.get("link"),
        "metadata": {"source": "tripadvisor", "tripadvisor_entity_id": item.get("tripadvisor_entity_id"),
                     "price_range": price_range, "cuisines": cuisines},
    }


# ─────────────────────────────────────────────────────────────────────────────
# TASK 1: Fix 3 tỉnh food fail  
# ─────────────────────────────────────────────────────────────────────────────

FAIL_FOOD = [
    ("Hưng Yên",   "Hung Yen Province Vietnam"),
    ("Lạng Sơn",   "Lang Son Province Vietnam"),
    ("Thái Nguyên", "Thai Nguyen Province Vietnam"),
]

def fix_food_fail(dry_run=False, with_photos=True, sleep=1.5):
    """Fix 3 tỉnh food import fail bằng cách skip external_id đã có."""
    print("\n" + "="*60)
    print("TASK 1: Fix 3 tỉnh food fail (Hưng Yên, Lạng Sơn, Thái Nguyên)")
    print("="*60)
    stats = []
    for label, query in FAIL_FOOD:
        print(f"\n→ {label} [food]")
        # Get existing external_ids
        existing = get_db_places(label, category="FOOD")
        existing_ids = {str(p["external_id"]) for p in existing if p.get("external_id")}
        print(f"  ℹ {len(existing)} existing food, {len(existing_ids)} external_ids")

        loc = resolve_location_id("restaurants", query, label)
        if not loc:
            print("  ✗ Resolve failed"); stats.append({"dest": label, "ok": False}); continue
        print(f"  ✓ Resolved: {loc['name']} (id={loc['id']})")

        items = fetch_list("restaurants", loc["id"])
        print(f"  ✓ Fetched {len(items)} items")

        places = []
        for item in items:
            eid = str(item.get("tripadvisor_entity_id") or "")
            if eid and eid in existing_ids:
                continue  # skip collision
            detail = None
            if with_photos and eid:
                detail = fetch_detail(eid, "FOOD")
                time.sleep(0.5)
            p = map_restaurant(item, label, detail)
            if p:
                places.append(p)

        print(f"  ✓ {len(places)} places to seed (skipped {len(items)-len(places)} collisions)")
        if not places:
            stats.append({"dest": label, "ok": True, "created": 0}); continue
        if dry_run:
            print(f"  [dry-run] Would seed {len(places)} places")
            stats.append({"dest": label, "ok": True, "dry_run": True})
            continue
        res = seed(label, places)
        print(f"  ✓ created={res.get('places_created',0)}, updated={res.get('places_updated',0)}")
        stats.append({"dest": label, "ok": True, **res})
        time.sleep(sleep)
    return stats


# ─────────────────────────────────────────────────────────────────────────────
# TASK 2: Backfill images + description + coords  
# ─────────────────────────────────────────────────────────────────────────────

ALL_DESTINATIONS = [
    "An Giang", "Bắc Ninh", "Cao Bằng", "Cà Mau", "Đồng Nai", "Đồng Tháp",
    "Đắk Lắk", "Gia Lai", "Hà Tĩnh", "Hưng Yên", "Lai Châu", "Lạng Sơn",
    "Phú Thọ", "Quảng Ngãi", "Sơn La", "Tây Ninh", "Thái Nguyên",
    "Thanh Hóa", "Tuyên Quang", "Vĩnh Long", "Điện Biên",
    # Old verified ones
    "Đà Nẵng", "Hà Nội", "Hồ Chí Minh", "Huế", "Cần Thơ", "Hải Phòng",
    "Khánh Hòa", "Lâm Đồng", "Lào Cai", "Nghệ An", "Ninh Bình",
    "Quảng Ninh", "Quảng Trị", "Hội An",
]

def backfill_enrichments(destination: str, dry_run=False, min_images=3,
                          sleep=1.5) -> dict:
    """Backfill images, description, lat/lng cho một destination từ omkar detail."""
    places = get_db_places(destination)
    ta_places = [p for p in places if p.get("external_id")]
    if not ta_places:
        return {"destination": destination, "ok": True, "skipped": "no_ta_places"}

    to_update = []
    for p in ta_places:
        ext_id = str(p["external_id"])
        category = p.get("category", "ATTRACTION")
        has_imgs = len([u for u in (p.get("images") or []) if u]) 
        needs_img = has_imgs < min_images
        needs_lat = not p.get("latitude")
        needs_desc = not p.get("description")

        if not (needs_img or needs_lat or needs_desc):
            continue  # Already complete

        detail = fetch_detail(ext_id, category)
        time.sleep(sleep)
        if not detail:
            continue

        photos = get_photos_from_detail(detail)
        det_coords = detail.get("coordinates") or {}
        description = detail.get("ai_description") or detail.get("description")

        updated = {
            "destination": p["destination"],
            "category": category,
            "name": p["name"],
            "name_en": p.get("name_en") or p["name"],
            "description": description or p.get("description"),
            "address": p.get("address"),
            "area": p.get("area"),
            "latitude": det_coords.get("latitude") or p.get("latitude"),
            "longitude": det_coords.get("longitude") or p.get("longitude"),
            "cover_image": (photos[0] if photos else p.get("cover_image")),
            "images": list(dict.fromkeys(
                ([p.get("cover_image")] if p.get("cover_image") else []) + photos + (p.get("images") or [])
            )) if photos else (p.get("images") or []),
            "rating": p.get("rating"),
            "review_count": p.get("review_count", 0),
            "hours": p.get("hours"),
            "recommended_duration": p.get("recommended_duration", 90),
            "base_price": p.get("base_price"),
            "external_id": ext_id,
            "external_source": "tripadvisor",
            "must_visit": p.get("must_visit", False),
            "priority_score": p.get("priority_score", 0),
            "best_time_of_day": p.get("best_time_of_day", "any"),
            "tags": p.get("tags", []),
            "source_url": p.get("source_url"),
            "phone": p.get("phone"),
            "website": p.get("website"),
        }
        updated["images"] = [u for u in updated["images"] if u]

        old_imgs = has_imgs
        new_imgs = len(updated["images"])
        changes = []
        if photos and new_imgs > old_imgs: changes.append(f"imgs {old_imgs}→{new_imgs}")
        if needs_lat and updated.get("latitude"): changes.append("lat/lng✓")
        if needs_desc and updated.get("description"): changes.append("desc✓")

        if changes:
            print(f"  ✓ {p['name'][:45]}: {', '.join(changes)}")
            to_update.append(updated)

    if not to_update:
        return {"destination": destination, "ok": True, "updated": 0}
    if dry_run:
        print(f"  [dry-run] Would update {len(to_update)} places")
        return {"destination": destination, "ok": True, "dry_run": True, "to_update": len(to_update)}

    res = seed(destination, to_update)
    return {"destination": destination, "ok": True,
            "seed_created": res.get("places_created", 0),
            "seed_updated": res.get("places_updated", 0)}


# ─────────────────────────────────────────────────────────────────────────────
# TASK 3: Import destinations còn thiếu attractions
# ─────────────────────────────────────────────────────────────────────────────

MISSING_ATT = [
    ("Vĩnh Long",  "Vinh Long Province Vietnam"),
    ("Hội An",     "Hoi An Vietnam"),
]


def import_missing_attractions(dry_run=False, with_photos=True, sleep=1.5):
    """Import attractions cho destinations chưa có."""
    print("\n" + "="*60)
    print("TASK 3: Import missing attractions (Vĩnh Long, Hội An)")
    print("="*60)
    stats = []
    for label, query in MISSING_ATT:
        print(f"\n→ {label} [attractions]")
        loc = resolve_location_id("attractions", query, label)
        if not loc:
            print("  ✗ Resolve failed"); stats.append({"dest": label, "ok": False}); continue
        print(f"  ✓ Resolved: {loc['name']} (id={loc['id']})")
        items = fetch_list("attractions", loc["id"])
        print(f"  ✓ Fetched {len(items)} items")
        places = []
        for item in items:
            eid = str(item.get("tripadvisor_entity_id") or "")
            detail = None
            if with_photos and eid:
                detail = fetch_detail(eid, "ATTRACTION")
                time.sleep(0.5)
            p = map_attraction(item, label, detail)
            if p:
                places.append(p)
        print(f"  ✓ Mapped {len(places)} places")
        if dry_run:
            print(f"  [dry-run] First: {json.dumps(places[0], ensure_ascii=False)[:200]}")
            stats.append({"dest": label, "ok": True, "dry_run": True})
            continue
        res = seed(label, places)
        print(f"  ✓ created={res.get('places_created',0)}, updated={res.get('places_updated',0)}")
        stats.append({"dest": label, "ok": True, **res})
        time.sleep(sleep)
    return stats


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Fix all data quality issues in DB")
    ap.add_argument("--all",            action="store_true", help="Run all tasks")
    ap.add_argument("--fix-food-fail",  action="store_true", help="Fix Hưng Yên/Lạng Sơn/Thái Nguyên food")
    ap.add_argument("--fix-images",     action="store_true", help="Backfill images/desc/coords for all")
    ap.add_argument("--fix-missing",    action="store_true", help="Import missing attractions")
    ap.add_argument("--dest",           help="Specific destination for --fix-images")
    ap.add_argument("--min-images",     type=int, default=3, help="Min images threshold (default=3)")
    ap.add_argument("--no-photos",      action="store_true", help="Skip photo fetching (faster)")
    ap.add_argument("--dry-run",        action="store_true")
    ap.add_argument("--sleep",          type=float, default=1.0)
    args = ap.parse_args()

    if not BACKEND_JWT:
        print("⚠ BACKEND_JWT not set — seed will fail. Set in scraper-service/.env")
        sys.exit(1)

    with_photos = not args.no_photos

    print(f"🚀 Data fix pipeline")
    print(f"   backend={BACKEND_URL}")
    print(f"   jwt={'****' + BACKEND_JWT[-6:]}")
    print(f"   photos={with_photos}, dry_run={args.dry_run}")

    all_stats = []

    if args.all or args.fix_food_fail:
        stats = fix_food_fail(dry_run=args.dry_run, with_photos=with_photos, sleep=args.sleep)
        all_stats.extend(stats)

    if args.all or args.fix_missing:
        stats = import_missing_attractions(dry_run=args.dry_run, with_photos=with_photos, sleep=args.sleep)
        all_stats.extend(stats)

    if args.all or args.fix_images:
        print("\n" + "="*60)
        print("TASK 2: Backfill images + description + lat/lng")
        print("="*60)
        dests = [args.dest] if args.dest else ALL_DESTINATIONS
        for dest in dests:
            print(f"\n📷 {dest}")
            try:
                res = backfill_enrichments(dest, dry_run=args.dry_run,
                                           min_images=args.min_images, sleep=args.sleep)
                all_stats.append(res)
                u = res.get("seed_updated", res.get("to_update", 0))
                print(f"  → updated={u}")
            except Exception as e:
                print(f"  ✗ Error: {e}")
                all_stats.append({"destination": dest, "ok": False, "reason": str(e)})

    ok = sum(1 for s in all_stats if s.get("ok", True))
    print(f"\n{'='*60}")
    print(f"✅ DONE: {ok}/{len(all_stats)} tasks ok")
    failed = [s for s in all_stats if not s.get("ok", True)]
    if failed:
        print("Failed:", [f.get("destination", f.get("dest")) for f in failed])


if __name__ == "__main__":
    main()
