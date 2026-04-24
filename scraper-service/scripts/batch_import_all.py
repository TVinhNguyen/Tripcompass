"""
batch_import_all.py — Batch importer cho 34 tỉnh/thành Việt Nam.

Strategy:
  1. ONE Apify actor run/destination (batch all terms → saves credits)
     → lat/lng, ảnh, rating, reviews, giờ mở cửa
  2. Tavily: verify/fill hours + giá vé + địa chỉ khi thiếu
  3. Confidence filter + dedupe → import DB
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from loguru import logger

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)

APIFY_TOKEN    = os.environ.get("APIFY_TOKEN", "").strip()
APIFY_ACTOR_ID = os.environ.get("APIFY_ACTOR_ID", "nwua9Gu5YrADL7ZDj").strip()
TAVILY_KEY     = os.environ.get("TAVILY_API_KEY", "").strip()
BACKEND_URL    = os.environ.get("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL       = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
MAX_ATTR       = int(os.environ.get("MAX_ATTR", "15"))
MAX_FOOD       = int(os.environ.get("MAX_FOOD", "12"))
CONF_THRESHOLD = float(os.environ.get("CONF_THRESHOLD", "0.35"))

OUT_DIR  = ROOT / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
MASTER_MD = ROOT / "VIETNAM_DESTINATIONS_MASTER.md"

logger.remove()
logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}", level="INFO")
logger.add(ROOT / "data" / "batch_import.log", level="DEBUG", rotation="20 MB")

# ── 34 tỉnh/thành ────────────────────────────────────────────────────────────
DESTINATIONS = [
    "Hà Nội", "Hải Phòng", "Huế", "Đà Nẵng", "Cần Thơ", "Hồ Chí Minh",
    "An Giang", "Bắc Ninh", "Cao Bằng", "Cà Mau", "Đồng Nai", "Đồng Tháp",
    "Đắk Lắk", "Gia Lai", "Hà Tĩnh", "Hưng Yên", "Khánh Hòa", "Lai Châu",
    "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Nghệ An", "Ninh Bình", "Phú Thọ",
    "Quảng Ninh", "Quảng Ngãi", "Quảng Trị", "Sơn La", "Tây Ninh",
    "Thái Nguyên", "Thanh Hóa", "Tuyên Quang", "Vĩnh Long", "Điện Biên",
]

# 63 → 34: bài viết cũ dùng địa danh cũ vẫn được tìm thấy
NEW_TO_LEGACY: dict[str, list[str]] = {
    "Tuyên Quang":  ["Hà Giang", "Tuyên Quang"],
    "Lào Cai":      ["Yên Bái", "Lào Cai"],
    "Thái Nguyên":  ["Bắc Kạn", "Thái Nguyên"],
    "Phú Thọ":      ["Vĩnh Phúc", "Hòa Bình", "Phú Thọ"],
    "Bắc Ninh":     ["Bắc Giang", "Bắc Ninh"],
    "Hưng Yên":     ["Thái Bình", "Hưng Yên"],
    "Hải Phòng":    ["Hải Phòng", "Hải Dương"],
    "Ninh Bình":    ["Hà Nam", "Nam Định", "Ninh Bình"],
    "Quảng Trị":    ["Quảng Bình", "Quảng Trị"],
    "Đà Nẵng":      ["Đà Nẵng", "Quảng Nam"],
    "Quảng Ngãi":   ["Kon Tum", "Quảng Ngãi"],
    "Gia Lai":      ["Bình Định", "Gia Lai"],
    "Khánh Hòa":    ["Ninh Thuận", "Khánh Hòa"],
    "Lâm Đồng":     ["Đắk Nông", "Bình Thuận", "Lâm Đồng"],
    "Đắk Lắk":     ["Phú Yên", "Đắk Lắk"],
    "Hồ Chí Minh":  ["Hồ Chí Minh", "Bà Rịa - Vũng Tàu", "Bình Dương", "Vũng Tàu"],
    "Đồng Nai":     ["Bình Phước", "Đồng Nai"],
    "Tây Ninh":     ["Long An", "Tây Ninh"],
    "Cần Thơ":      ["Cần Thơ", "Sóc Trăng", "Hậu Giang"],
    "Vĩnh Long":    ["Bến Tre", "Trà Vinh", "Vĩnh Long"],
    "Đồng Tháp":    ["Tiền Giang", "Đồng Tháp"],
    "Cà Mau":       ["Bạc Liêu", "Cà Mau"],
    "An Giang":     ["Kiên Giang", "An Giang"],
}

# Keywords phân loại FOOD vs ATTRACTION
_FOOD_KW = {
    "restaurant", "food", "cafe", "coffee", "bar", "bakery", "pizza", "seafood",
    "noodle", "pho", "fast food", "meal", "nhà hàng", "quán ăn", "ăn uống",
    "quan an", "bun", "banh", "com", "buffet", "bistro", "eatery",
}
_ATTR_KW = {
    "tourist", "attraction", "museum", "temple", "pagoda", "church", "park",
    "beach", "waterfall", "mountain", "market", "landmark", "heritage",
    "historical", "nature", "garden", "zoo", "entertainment", "resort",
    "chùa", "đền", "hồ", "vịnh", "đảo", "núi", "thác", "cầu",
    "bảo tàng", "khu du lịch", "danh thắng", "di tích", "thành", "lăng",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _normalize_vn(text: str) -> str:
    """Strip Vietnamese diacritics for fuzzy matching."""
    text = unicodedata.normalize("NFD", (text or "").lower().strip())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text)


def _legacy_aliases(destination: str) -> list[str]:
    raw = NEW_TO_LEGACY.get(destination.strip(), [destination.strip()])
    seen: set[str] = set()
    out: list[str] = []
    for a in raw:
        k = _norm(a)
        if k not in seen:
            seen.add(k)
            out.append(a)
    return out


def _parse_hours(text: str) -> str | None:
    if not text:
        return None
    m = re.search(r"(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})", text)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    if re.search(r"24[/\s]?7|24\s*gi[oờ]|24h", text.lower()):
        return "00:00-23:59"
    return None


def _parse_price(text: str) -> int | None:
    if not text:
        return None
    if re.search(r"mi[eễ]n\s*ph[ií]|free|kh[oô]ng\s*(m[aấ]t|t[oố]n|ph[ií])", text.lower()):
        return 0
    nums = re.findall(r"\d[\d.,]{2,}", text)
    vals: list[int] = []
    for n in nums:
        raw = re.sub(r"[^\d]", "", n)
        if not raw:
            continue
        v = int(raw)
        if 5_000 <= v <= 10_000_000:
            vals.append(v)
    return min(vals) if vals else None


def _detect_category(item: dict[str, Any]) -> str:
    cats = " ".join(str(c) for c in (item.get("categories") or [])).lower()
    title = _norm(item.get("title") or item.get("name") or "")
    combined = cats + " " + title
    food_score = sum(1 for kw in _FOOD_KW if kw in combined)
    attr_score = sum(1 for kw in _ATTR_KW if kw in combined)
    if food_score > attr_score:
        return "FOOD"
    if attr_score > food_score:
        return "ATTRACTION"
    # Tie: attractions often have a numeric price, food uses "₫" level
    price_text = str(item.get("price") or item.get("priceLevel") or "")
    if re.search(r"\d{5,}", price_text):
        return "ATTRACTION"
    return "FOOD"


def _extract_images(item: dict[str, Any], max_n: int = 6) -> list[str]:
    out: list[str] = []
    for img in (item.get("images") or []):
        if isinstance(img, dict):
            url = img.get("imageUrl") or img.get("url") or img.get("thumbnail") or ""
        else:
            url = str(img)
        if isinstance(url, str) and url.startswith("http"):
            out.append(url)
        if len(out) >= max_n:
            break
    if not out and isinstance(item.get("image"), str) and item["image"].startswith("http"):
        out = [item["image"]]
    return out


def _address_parts(item: dict[str, Any], destination: str) -> str:
    parts = []
    for key in ("street", "city", "state"):
        val = item.get(key)
        if isinstance(val, str) and val.strip() and val.upper() not in ("VN", "VNM", "VIETNAM", "VIET NAM"):
            parts.append(val.strip())
    return ", ".join(parts) if parts else f"{destination}, Việt Nam"


def _parse_opening_hours_from_item(item: dict[str, Any]) -> str | None:
    oh = item.get("openingHours") or []
    if isinstance(oh, list) and oh:
        blob = " ".join(str(h) for h in oh[:5])
        return _parse_hours(blob)
    if isinstance(oh, str):
        return _parse_hours(oh)
    # Fallback: temporaryClosedUntil, etc.
    return None


def _confidence(p: dict[str, Any]) -> float:
    s = 0.0
    if p.get("latitude") and p.get("longitude"):
        s += 0.40
    if p.get("rating") is not None:
        s += 0.20
    if p.get("address") and "Việt Nam" not in p["address"]:
        s += 0.15
    if p.get("hours"):
        s += 0.10
    if p.get("images"):
        s += 0.10
    if p.get("cover_image"):
        s += 0.05
    return round(min(s, 1.0), 2)


# ── Apify ────────────────────────────────────────────────────────────────────

def apify_run(search_terms: list[str], location: str, limit: int = 25) -> list[dict]:
    """Single Apify actor run with all search terms batched."""
    if not APIFY_TOKEN or not search_terms:
        logger.warning("Apify skipped — no token or no terms")
        return []
    from apify_client import ApifyClient
    client = ApifyClient(APIFY_TOKEN)
    run_input = {
        "searchStringsArray": search_terms,
        "locationQuery": f"{location}, Vietnam",
        "maxCrawledPlacesPerSearch": limit,
        "language": "vi",
        "maxImages": 6,
        "maxReviews": 8,
        "reviewsSort": "newest",
        "skipClosedPlaces": False,
        "scrapeContacts": False,
        "scrapeReviewsPersonalData": False,
        "includeWebResults": False,
    }
    try:
        logger.info("Apify: {} terms @ '{}', limit={}/term", len(search_terms), location, limit)
        run = client.actor(APIFY_ACTOR_ID).call(run_input=run_input)
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        logger.info("Apify: {} raw items returned", len(items))
        return items
    except Exception as e:
        logger.error("Apify error: {}", e)
        return []


# ── Tavily ───────────────────────────────────────────────────────────────────

def tavily_verify(name: str, destination: str, category: str) -> dict:
    if not TAVILY_KEY:
        return {}
    from langchain_tavily import TavilySearch
    aliases = _legacy_aliases(destination)
    geo = " ".join(aliases[:2])
    if category == "ATTRACTION":
        q = f"{name} {geo} địa chỉ giờ mở cửa giá vé vào cửa"
    else:
        q = f"{name} {geo} địa chỉ giờ mở cửa thực đơn giá"
    try:
        tool = TavilySearch(max_results=3, tavily_api_key=TAVILY_KEY)
        docs = tool.invoke({"query": q})
        if not docs:
            return {}
        blob = "\n".join(str(d.get("content", "")) for d in docs if isinstance(d, dict))
        src = next((d.get("url") for d in docs if isinstance(d, dict) and d.get("url")), None)
        return {
            "hours": _parse_hours(blob),
            "base_price": _parse_price(blob),
            "source_url": src,
            "description": blob[:400],
        }
    except Exception as e:
        logger.debug("Tavily error for '{}': {}", name, e)
        return {}


# ── Convert Apify items → places ─────────────────────────────────────────────

def items_to_places(items: list[dict], destination: str) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()

    for item in items:
        name = (item.get("title") or item.get("name") or "").strip()
        if not name or len(name) < 3:
            continue
        key = _normalize_vn(name)
        if key in seen:
            continue
        seen.add(key)

        lat = (item.get("location") or {}).get("lat") or item.get("latitude")
        lng = (item.get("location") or {}).get("lng") or item.get("longitude")
        rating = item.get("totalScore") or item.get("rating")
        images = _extract_images(item)
        hours = _parse_opening_hours_from_item(item)
        address = _address_parts(item, destination)
        category = _detect_category(item)
        area = item.get("district") or item.get("neighborhood") or item.get("postalCode") or None

        # Reviews as description
        reviews_raw = item.get("reviews") or []
        texts = [
            (r.get("text") or r.get("textTranslated") or "")[:150]
            for r in reviews_raw[:5] if isinstance(r, dict)
        ]
        description = " | ".join(t for t in texts if t)[:400] or None

        # Priority from rating
        priority = 5
        if rating:
            r = float(rating)
            priority = 9 if r >= 4.7 else (8 if r >= 4.5 else (7 if r >= 4.2 else (5 if r >= 4.0 else 3)))
        must_visit = priority >= 8

        place: dict[str, Any] = {
            "destination": destination,
            "category": category,
            "name": name,
            "name_en": item.get("nameEn") or None,
            "address": address,
            "area": area,
            "latitude": float(lat) if lat is not None else None,
            "longitude": float(lng) if lng is not None else None,
            "cover_image": images[0] if images else None,
            "images": images,
            "rating": float(rating) if rating is not None else None,
            "hours": hours,
            "recommended_duration": 90 if category == "ATTRACTION" else 45,
            "base_price": None,
            "metadata": {
                "source": "apify",
                "source_place_url": item.get("url"),
                "reviews_count": item.get("reviewsCount"),
                "categories": item.get("categories") or [],
                "description": description,
                "price_level": item.get("price") or item.get("priceLevel"),
            },
            "source_url": item.get("url"),
            "must_visit": must_visit,
            "priority_score": priority,
            "best_time_of_day": "any",
            "tags": [],
        }
        out.append(place)

    return out


def _dedupe(places: list[dict]) -> list[dict]:
    by_key: dict[tuple, dict] = {}
    for p in places:
        key = (p["category"], _normalize_vn(p["name"]))
        if key not in by_key:
            by_key[key] = p
        else:
            cur = by_key[key]
            if (_confidence(p), len(p.get("images") or []), p.get("rating") or 0) > (
                _confidence(cur), len(cur.get("images") or []), cur.get("rating") or 0
            ):
                by_key[key] = p
    return list(by_key.values())


# ── Enrich with Tavily ────────────────────────────────────────────────────────

def enrich_place(p: dict, destination: str) -> dict:
    needs_hours = not p.get("hours")
    needs_price = p["category"] == "ATTRACTION" and p.get("base_price") is None

    if needs_hours or needs_price:
        t = tavily_verify(p["name"], destination, p["category"])
        time.sleep(0.8)
        if t.get("hours") and needs_hours:
            p["hours"] = t["hours"]
        if t.get("base_price") is not None and needs_price:
            p["base_price"] = int(t["base_price"])
        if t.get("source_url") and not p.get("source_url"):
            p["source_url"] = t["source_url"]
        if t.get("description") and not p["metadata"].get("description"):
            p["metadata"]["description"] = t["description"]

    p["metadata"]["confidence"] = _confidence(p)
    return p


# ── Combos ───────────────────────────────────────────────────────────────────

def build_combos(destination: str, places: list[dict], n: int = 5) -> list[dict]:
    top_attrs = [
        p["name"] for p in sorted(
            [x for x in places if x["category"] == "ATTRACTION"],
            key=lambda x: x.get("rating") or 0, reverse=True
        )[:5]
    ]

    combos: list[dict] = []

    if TAVILY_KEY:
        from langchain_tavily import TavilySearch
        try:
            aliases = _legacy_aliases(destination)
            q = f"combo tour du lịch {' '.join(aliases[:2])} 2025 2026 giá trọn gói khuyến mãi"
            tool = TavilySearch(max_results=n, tavily_api_key=TAVILY_KEY)
            docs = tool.invoke({"query": q})
            for d in (docs or []):
                if not isinstance(d, dict):
                    continue
                content = d.get("content") or ""
                title = ((d.get("title") or "").strip() or f"Combo du lịch {destination}")[:160]
                url = d.get("url")
                price = _parse_price(content)
                if not price or not (200_000 <= price <= 15_000_000):
                    price = 1_500_000
                m = re.search(r"(\d+)\s*(ngày|day)", content.lower())
                days = max(1, int(m.group(1))) if m else 2
                provider = None
                if isinstance(url, str) and "://" in url:
                    provider = re.sub(r"^www\.", "", url.split("://")[-1].split("/")[0])
                combos.append({
                    "destination": destination,
                    "name": title,
                    "cover_image": None,
                    "provider": provider,
                    "price_per_person": int(price),
                    "includes": top_attrs[:4],
                    "benefits": ["Xe đưa đón", "Vé tham quan", "Hỗ trợ đặt lịch"],
                    "duration_days": days,
                    "requires_overnight": days > 1,
                    "book_url": url,
                })
            time.sleep(0.5)
        except Exception as e:
            logger.warning("Tavily combo failed for {}: {}", destination, e)

    # Fill with template combos to always have at least n
    templates = [
        (f"Khám phá {destination} 1 ngày", 1, 800_000),
        (f"Tour {destination} 2N1Đ", 2, 1_500_000),
        (f"Trọn gói {destination} 3N2Đ", 3, 2_800_000),
        (f"Combo gia đình {destination}", 2, 2_200_000),
        (f"Tour {destination} cuối tuần", 2, 1_800_000),
    ]
    for tname, days, price in templates:
        if len(combos) >= n:
            break
        combos.append({
            "destination": destination,
            "name": tname,
            "cover_image": None,
            "provider": "internal",
            "price_per_person": price,
            "includes": top_attrs[:4],
            "benefits": ["Xe đưa đón", "Vé tham quan"],
            "duration_days": days,
            "requires_overnight": days > 1,
            "book_url": None,
        })

    return combos[:n]


# ── Main pipeline per destination ─────────────────────────────────────────────

def process_destination(destination: str, dry_run: bool = False) -> dict[str, Any]:
    logger.info("=" * 60)
    logger.info("▶ {}", destination)
    aliases = _legacy_aliases(destination)
    logger.info("  Aliases: {}", aliases)

    # Build search terms — 2 per geo alias (ATTRACTION + FOOD queries)
    search_terms: list[str] = []
    for geo in aliases[:2]:
        search_terms += [
            f"địa điểm du lịch {geo}",
            f"nhà hàng quán ăn ngon {geo}",
        ]
    # Dedupe terms
    search_terms = list(dict.fromkeys(search_terms))

    # PRIMARY: Apify batch run
    raw_items = apify_run(search_terms, location=aliases[0], limit=25)

    # If first run returned < 15 items and we have more aliases, try secondary geo
    if len(raw_items) < 15 and len(aliases) > 1:
        logger.info("  Low results ({}), trying secondary alias: {}", len(raw_items), aliases[1])
        extra = apify_run(
            [f"tourist attraction {aliases[1]}", f"restaurant {aliases[1]}"],
            location=aliases[1], limit=20,
        )
        raw_items.extend(extra)

    logger.info("  Total raw items: {}", len(raw_items))

    # Convert + dedupe
    places = _dedupe(items_to_places(raw_items, destination))
    logger.info("  After dedupe: {}", len(places))

    # Enrich with Tavily (only for places missing hours/price)
    enriched: list[dict] = []
    for i, p in enumerate(places):
        needs = not p.get("hours") or (p["category"] == "ATTRACTION" and p.get("base_price") is None)
        if needs:
            logger.info("  [{}/{}] Enriching '{}' via Tavily", i + 1, len(places), p["name"])
            try:
                p = enrich_place(p, destination)
            except Exception as e:
                logger.warning("  Enrich error for '{}': {}", p["name"], e)
                p["metadata"]["confidence"] = _confidence(p)
        else:
            p["metadata"]["confidence"] = _confidence(p)
        enriched.append(p)

    # Confidence filter
    confident = [p for p in enriched if p["metadata"].get("confidence", 0) >= CONF_THRESHOLD]
    logger.info("  Confident (≥{:.0%}): {}", CONF_THRESHOLD, len(confident))

    # Sort + cap per category
    attrs = sorted(
        [p for p in confident if p["category"] == "ATTRACTION"],
        key=lambda x: (x.get("rating") or 0, x["metadata"].get("confidence", 0)), reverse=True
    )[:MAX_ATTR]
    foods = sorted(
        [p for p in confident if p["category"] == "FOOD"],
        key=lambda x: (x.get("rating") or 0, x["metadata"].get("confidence", 0)), reverse=True
    )[:MAX_FOOD]

    final_places = attrs + foods
    logger.info("  Final: {} ATTRACTION + {} FOOD = {}", len(attrs), len(foods), len(final_places))

    # Combos
    combos = build_combos(destination, final_places, n=5)

    # Save JSON
    slug = _normalize_vn(destination).replace(" ", "_")
    out_path = OUT_DIR / f"seed_{slug}.json"
    out_payload = {
        "destination": destination,
        "places": final_places,
        "combos": combos,
        "generated_at": datetime.now().isoformat(),
        "stats": {
            "raw_items": len(raw_items),
            "after_dedupe": len(places),
            "confident": len(confident),
            "attractions": len(attrs),
            "food": len(foods),
        },
    }
    out_path.write_text(json.dumps(out_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("  Saved → {}", out_path.name)

    # Import to DB
    import_result = None
    if not dry_run and final_places:
        try:
            payload = {"destination": destination, "places": final_places, "combos": combos}
            resp = httpx.post(SEED_URL, json=payload, timeout=120.0)
            resp.raise_for_status()
            import_result = resp.json()
            logger.info("  ✅ Imported: places_created={} combos_created={}",
                        import_result.get("places_created", "?"),
                        import_result.get("combos_created", "?"))
        except Exception as e:
            logger.error("  ❌ Import failed: {}", e)

    _update_master_log(destination, final_places, combos, import_result)

    return {
        "destination": destination,
        "attractions": len(attrs),
        "food": len(foods),
        "combos": len(combos),
        "imported": bool(import_result),
        "result": import_result,
    }


def _update_master_log(destination: str, places: list[dict], combos: list[dict], result: dict | None) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    n_attr = sum(1 for p in places if p["category"] == "ATTRACTION")
    n_food = sum(1 for p in places if p["category"] == "FOOD")
    lines = [
        "",
        f"### {ts} — {destination}",
        f"- Places: {len(places)} (ATTRACTION={n_attr}, FOOD={n_food})",
        f"- Combos: {len(combos)}",
    ]
    if result:
        lines.append(f"- Import: places_created={result.get('places_created', 0)}, combos_created={result.get('combos_created', 0)}")
    lines.append("- Top places:")
    top = sorted(places, key=lambda x: x.get("rating") or 0, reverse=True)[:5]
    for p in top:
        lines.append(f"  - {p['name']} ({p['category']}) rating={p.get('rating')} conf={p['metadata'].get('confidence')}")

    if MASTER_MD.exists():
        text = MASTER_MD.read_text(encoding="utf-8")
    else:
        text = "# Vietnam Destinations Master List\n"

    text = re.sub(rf"- \[ \] {re.escape(destination)}\b", f"- [x] {destination}", text)
    marker = "## Nhật ký chạy"
    if marker in text:
        text = text + "\n" + "\n".join(lines) + "\n"
    else:
        text += f"\n{marker}\n" + "\n".join(lines) + "\n"
    MASTER_MD.write_text(text, encoding="utf-8")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Batch import 34 Vietnam destinations (Apify + Tavily)")
    parser.add_argument("--dest", help="Single destination")
    parser.add_argument("--dry-run", action="store_true", help="Skip DB import, save JSON only")
    parser.add_argument("--start-from", help="Skip destinations before this one")
    parser.add_argument("--only", help="Comma-separated destinations to run")
    args = parser.parse_args()

    if args.only:
        targets = [d.strip() for d in args.only.split(",")]
    elif args.dest:
        targets = [args.dest.strip()]
    else:
        targets = list(DESTINATIONS)
        if args.start_from:
            needle = _normalize_vn(args.start_from)
            try:
                idx = next(i for i, d in enumerate(targets) if _normalize_vn(d) == needle)
                targets = targets[idx:]
                logger.info("Resuming from index {}: {}", idx, targets[0])
            except StopIteration:
                logger.error("--start-from '{}' not found", args.start_from)
                sys.exit(1)

    logger.info("Targets ({})): {}", len(targets), targets)
    summary: list[dict] = []

    for dest in targets:
        try:
            r = process_destination(dest, dry_run=args.dry_run)
            summary.append(r)
        except Exception as e:
            logger.error("FAILED {}: {}", dest, e)
            summary.append({"destination": dest, "error": str(e)})
        time.sleep(5)  # Polite gap between destinations

    print("\n" + "=" * 70)
    print(f"BATCH COMPLETE — {len(summary)} destinations")
    print("=" * 70)
    for s in summary:
        if s.get("error"):
            print(f"  ❌ {s['destination']}: {s['error']}")
        else:
            status = "✅" if s.get("imported") else "📁"
            print(f"  {status} {s['destination']}: {s.get('attractions', 0)} attr + {s.get('food', 0)} food + {s.get('combos', 0)} combos")


if __name__ == "__main__":
    main()
