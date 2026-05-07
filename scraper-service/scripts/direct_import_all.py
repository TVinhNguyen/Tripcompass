#!/usr/bin/env python3
"""
Direct import script: Tavily → Apify → DB seeding
- Discovers attractions/food via Tavily
- Gets accurate pricing from Tavily results
- Enriches with real images + coords via Apify
- Posts to backend seed endpoint
- No LLM pipeline, just direct API calls
"""

import os
import re
import json
import time
import unicodedata
from pathlib import Path
from typing import Optional
import httpx
from dotenv import load_dotenv

# Load environment
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")

TAVILY_URL = "https://api.tavily.com/search"
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
APIFY_ACTOR_ID = "nwua9Gu5YrADL7ZDj"

# Try to import apify_client
try:
    from apify_client import ApifyClient
    APIFY_AVAILABLE = True
except ImportError:
    APIFY_AVAILABLE = False
    print("⚠️  apify_client not available, Apify enrichment will be skipped")

# 34 destinations (6 cities + 28 provinces)
DESTINATIONS = [
    # Thành phố trực thuộc TW
    ("Hà Nội", "Hanoi"),
    ("Hải Phòng", "Hai Phong"),
    ("Huế", "Hue"),
    ("Đà Nẵng", "Da Nang"),
    ("Cần Thơ", "Can Tho"),
    ("TP. Hồ Chí Minh", "Ho Chi Minh City"),
    # Tỉnh
    ("An Giang", "An Giang"),
    ("Bắc Ninh", "Bac Ninh"),
    ("Cao Bằng", "Cao Bang"),
    ("Cà Mau", "Ca Mau"),
    ("Đồng Nai", "Dong Nai"),
    ("Đồng Tháp", "Dong Thap"),
    ("Đắk Lắk", "Dak Lak"),
    ("Gia Lai", "Gia Lai"),
    ("Hà Tĩnh", "Ha Tinh"),
    ("Hưng Yên", "Hung Yen"),
    ("Khánh Hòa", "Khanh Hoa"),
    ("Lai Châu", "Lai Chau"),
    ("Lâm Đồng", "Lam Dong"),
    ("Lạng Sơn", "Lang Son"),
    ("Lào Cai", "Lao Cai"),
    ("Nghệ An", "Nghe An"),
    ("Ninh Bình", "Ninh Binh"),
    ("Phú Thọ", "Phu Tho"),
    ("Quảng Ninh", "Quang Ninh"),
    ("Quảng Ngãi", "Quang Ngai"),
    ("Quảng Trị", "Quang Tri"),
    ("Sơn La", "Son La"),
    ("Tây Ninh", "Tay Ninh"),
    ("Thái Nguyên", "Thai Nguyen"),
    ("Thanh Hóa", "Thanh Hoa"),
    ("Tuyên Quang", "Tuyen Quang"),
    ("Vĩnh Long", "Vinh Long"),
    ("Điện Biên", "Dien Bien"),
]

def normalize_name(text: str) -> str:
    """Normalize Vietnamese names for matching (strip diacritics)."""
    text = unicodedata.normalize("NFD", text.lower().strip())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text)


def extract_price_from_text(text: str) -> Optional[int]:
    """Extract price in VND from text. Returns price or None."""
    # Look for patterns like "xxx.xxx VND", "xxxK", "xxx000", etc.
    patterns = [
        r"(\d+(?:\.\d+)*)\s*(?:đ|vnd|₫)",  # 1000 đ, 1.000 VND
        r"(\d+)\s*(?:k|K)(?:đ|vnd)?",       # 50K, 50Kđ
        r"(\d+000)",                         # 50000
    ]

    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            # Get the largest number found
            numbers = []
            for m in matches:
                # Remove dots used as thousand separators
                clean = m.replace(".", "").replace(",", "")
                if clean.isdigit():
                    numbers.append(int(clean))

            if numbers:
                largest = max(numbers)
                # Filter out unrealistic prices
                if 1000 <= largest <= 100_000_000:
                    # If it looks like thousands (ending in K), multiply by 1000
                    if largest < 10000 and pattern == patterns[1]:
                        largest *= 1000
                    return largest

    return None


def tavily_search(query: str, destination: str = None) -> list[dict]:
    """
    Call Tavily API to search for information.
    Returns list of result objects with 'title', 'content', 'url'.
    """
    if not TAVILY_API_KEY:
        print("❌ TAVILY_API_KEY not set")
        return []

    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "advanced",
        "max_results": 5,
        "include_raw_content": True,
    }

    try:
        resp = httpx.post(TAVILY_URL, json=payload, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        return results
    except Exception as e:
        print(f"  ❌ Tavily search failed: {e}")
        return []


def tavily_discover_places(destination: str) -> tuple[list[dict], list[dict]]:
    """
    Discover top attractions and food via Tavily.
    Returns (attractions, food_venues) as list of dicts with 'name', 'description'.
    """
    attractions = []
    food = []

    # Search attractions
    query_att = f"địa điểm du lịch nổi tiếng {destination} 2025 2026"
    print(f"  🔍 Tavily: discovering attractions in {destination}…")
    results_att = tavily_search(query_att, destination)

    # Parse attractions from results
    for r in results_att:
        content = r.get("content", "")
        # Extract place names (heuristic: look for capitalized phrases)
        names = re.findall(r"\b([A-ZÀ-ỿ][a-zà-ỿ]+(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b", content[:500])
        for name in names[:3]:  # Take top 3
            if name and len(name) > 2:
                attractions.append({
                    "name": name,
                    "description": content[:200],
                    "source": r.get("url", ""),
                })

    # Search food
    query_food = f"quán ăn ngon nổi tiếng {destination} 2025"
    print(f"  🔍 Tavily: discovering food in {destination}…")
    results_food = tavily_search(query_food, destination)

    for r in results_food:
        content = r.get("content", "")
        names = re.findall(r"\b([A-ZÀ-ỿ][a-zà-ỿ]+(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b", content[:500])
        for name in names[:3]:
            if name and len(name) > 2:
                food.append({
                    "name": name,
                    "description": content[:200],
                    "source": r.get("url", ""),
                })

    print(f"  ✓ Found {len(attractions)} attractions, {len(food)} food venues")
    return attractions, food


def tavily_get_price(place_name: str, destination: str) -> Optional[int]:
    """Get price for a specific attraction via Tavily."""
    query = f"giá vé {place_name} {destination} 2026"
    results = tavily_search(query)

    for r in results:
        content = r.get("content", "")
        price = extract_price_from_text(content)
        if price:
            return price

    return None


def apify_scrape_batch(search_terms: list[str], destination: str) -> dict:
    """
    Call Apify Google Maps Actor in batch mode.
    Returns dict: {normalized_name → apify_item}
    """
    if not APIFY_AVAILABLE or not APIFY_TOKEN:
        print("  ⚠️  Apify unavailable")
        return {}

    try:
        client = ApifyClient(APIFY_TOKEN)
        run_input = {
            "searchStringsArray": search_terms,
            "locationQuery": f"{destination}, Vietnam",
            "maxCrawledPlacesPerSearch": 3,
            "language": "vi",
            "maxImages": 10,
            "maxReviews": 5,
            "skipClosedPlaces": False,
            "scrapeSocialMediaProfiles": {"facebooks": False, "instagrams": False, "youtubes": False},
            "scrapeContacts": False,
            "scrapeReviewsPersonalData": False,
            "includeWebResults": False,
        }

        print(f"  🔄 Apify: scraping {len(search_terms)} places…")
        run = client.actor(APIFY_ACTOR_ID).call(run_input=run_input)
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

        lookup = {}
        for item in items:
            name = item.get("title") or item.get("name") or ""
            if name:
                key = normalize_name(name)
                if key not in lookup:
                    lookup[key] = item

        print(f"  ✓ Apify: got {len(lookup)} unique places")
        return lookup
    except Exception as e:
        print(f"  ❌ Apify failed: {e}")
        return {}


def extract_apify_enrichment(item: dict) -> dict:
    """Extract lat, lng, images, rating, hours from Apify item."""
    result = {}

    # Coordinates
    lat = item.get("location", {}).get("lat") or item.get("latitude")
    lng = item.get("location", {}).get("lng") or item.get("longitude")
    if lat:
        result["latitude"] = float(lat)
    if lng:
        result["longitude"] = float(lng)

    # Rating
    rating = item.get("totalScore") or item.get("rating")
    if rating:
        result["rating"] = float(rating)

    # Images — fix extraction
    images_raw = item.get("images") or []
    urls = []
    for img in images_raw[:10]:
        if isinstance(img, dict):
            url = img.get("imageUrl") or img.get("url") or img.get("thumbnail")
        else:
            url = str(img) if isinstance(img, str) else None

        if url and isinstance(url, str) and url.startswith("http"):
            urls.append(url)

    if urls:
        result["images"] = urls
        result["cover_image"] = urls[0]

    # Hours
    hours_raw = item.get("openingHours")
    if hours_raw and isinstance(hours_raw, list) and hours_raw:
        for line in hours_raw:
            if isinstance(line, str):
                m = re.search(r"(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})", line)
                if m:
                    result["hours"] = f"{m.group(1)}-{m.group(2)}"
                    break

    # Address
    address_parts = []
    if item.get("street"):
        address_parts.append(item["street"])
    if item.get("city"):
        address_parts.append(item["city"])
    if address_parts:
        result["address"] = ", ".join(address_parts)

    return result


def build_place_input(
    name: str,
    destination: str,
    category: str,
    price: Optional[int] = None,
    apify_data: dict = None,
) -> Optional[dict]:
    """Build PlaceInput dict for backend."""
    if not apify_data:
        apify_data = {}

    # Required fields validation
    if not apify_data.get("latitude") or not apify_data.get("longitude"):
        return None
    if not apify_data.get("address"):
        return None

    place = {
        "destination": destination,
        "category": category,
        "name": name,
        "name_en": apify_data.get("name_en") or _try_translate(name),
        "address": apify_data.get("address"),
        "area": apify_data.get("area") or "center",
        "latitude": apify_data.get("latitude"),
        "longitude": apify_data.get("longitude"),
        "cover_image": apify_data.get("cover_image"),
        "images": apify_data.get("images", []),
        "rating": apify_data.get("rating", 4.0),
        "hours": apify_data.get("hours") or "08:00-22:00",
        "recommended_duration": 120 if category == "ATTRACTION" else 45,
        "base_price": price,
        "metadata": {
            "source": "apify+tavily",
            "source_place_url": apify_data.get("source_url"),
            "reviews_count": apify_data.get("reviews_count"),
            "categories": apify_data.get("categories", []),
            "is_free": category == "ATTRACTION" and price is None,
            "priority_score": 0,
        },
        "source_url": apify_data.get("source_url"),
        "must_visit": False,
        "priority_score": 0,
        "best_time_of_day": "any",
        "tags": [],
    }

    return place


def _try_translate(vietnamese_name: str) -> str:
    """Simple heuristic translation for common Vietnamese place names."""
    translations = {
        "hà nội": "Hanoi",
        "hồ chí minh": "Ho Chi Minh City",
        "đà nẵng": "Da Nang",
        "huế": "Hue",
        "hải phòng": "Hai Phong",
        "cần thơ": "Can Tho",
        "nha trang": "Nha Trang",
        "đà lạt": "Da Lat",
        "phú quốc": "Phu Quoc",
        "hạ long": "Ha Long",
        "sapa": "Sapa",
        "hội an": "Hoi An",
        "mũi né": "Mui Ne",
        "vũng tàu": "Vung Tau",
        "phong nha": "Phong Nha",
        "ninh bình": "Ninh Binh",
        "tràng an": "Trang An",
    }

    key = vietnamese_name.lower().strip()
    return translations.get(key, vietnamese_name)


def post_to_backend(destination: str, places: list[dict]) -> bool:
    """POST places to backend seed endpoint."""
    if not places:
        print(f"  ⚠️  No places to post for {destination}")
        return False

    payload = {
        "destination": destination,
        "places": places,
        "combos": [],
    }

    try:
        resp = httpx.post(SEED_URL, json=payload, timeout=30.0)
        resp.raise_for_status()
        result = resp.json()

        created = result.get("places_created", 0)
        updated = result.get("places_updated", 0)
        print(f"  ✓ Posted {destination}: +{created} created, {updated} updated")
        return True
    except Exception as e:
        print(f"  ❌ POST failed for {destination}: {e}")
        return False


def import_destination(destination: str, destination_en: str):
    """Full workflow for one destination."""
    print(f"\n{'='*70}")
    print(f"📍 {destination} ({destination_en})")
    print(f"{'='*70}")

    # Step 1: Discover via Tavily
    attractions_raw, food_raw = tavily_discover_places(destination)

    if not attractions_raw and not food_raw:
        print(f"  ❌ No places discovered")
        return

    # Step 2: Enrich via Apify
    search_terms = [f"{p['name']} {destination}" for p in attractions_raw + food_raw]
    apify_lookup = apify_scrape_batch(search_terms, destination)

    places_to_post = []

    # Process attractions
    for att in attractions_raw:
        name = att["name"].strip()
        apify_key = normalize_name(name)
        apify_data = apify_lookup.get(apify_key, {})

        # Get price from Tavily if attraction
        price = tavily_get_price(name, destination)

        place = build_place_input(
            name=name,
            destination=destination,
            category="ATTRACTION",
            price=price,
            apify_data=apify_data,
        )

        if place:
            places_to_post.append(place)
            status = "✓" if apify_data else "⚠️ "
            print(f"  {status} Attraction: {name} (${price if price else 'free'}) — {len(apify_data.get('images', []))} images")

    # Process food
    for food in food_raw:
        name = food["name"].strip()
        apify_key = normalize_name(name)
        apify_data = apify_lookup.get(apify_key, {})

        # Food might have price too
        price = tavily_get_price(name, destination)

        place = build_place_input(
            name=name,
            destination=destination,
            category="FOOD",
            price=price,
            apify_data=apify_data,
        )

        if place:
            places_to_post.append(place)
            status = "✓" if apify_data else "⚠️ "
            print(f"  {status} Food: {name} (${price if price else '?'}) — {len(apify_data.get('images', []))} images")

    # Step 3: Post to backend
    if places_to_post:
        print(f"\n  📤 Posting {len(places_to_post)} places to backend…")
        post_to_backend(destination, places_to_post)
    else:
        print(f"  ❌ No valid places to post")


def main():
    print("🚀 Direct Import: Tavily + Apify → DB Seeding\n")

    # Import all destinations
    for i, (destination, destination_en) in enumerate(DESTINATIONS, 1):
        print(f"\n[{i}/{len(DESTINATIONS)}] {destination}")
        try:
            import_destination(destination, destination_en)
            time.sleep(2)  # Rate limiting
        except Exception as e:
            print(f"  ❌ Error: {e}")
            continue

    print(f"\n{'='*70}")
    print("✅ Import complete!")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
