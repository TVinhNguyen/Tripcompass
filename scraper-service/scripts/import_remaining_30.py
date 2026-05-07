#!/usr/bin/env python3
"""
Optimized import for remaining 30 destinations
- Faster Apify settings (fewer search pages)
- Better progress reporting
- Focus on quality over volume
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

env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")

TAVILY_URL = "https://api.tavily.com/search"
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
APIFY_ACTOR_ID = "nwua9Gu5YrADL7ZDj"

try:
    from apify_client import ApifyClient
    APIFY_AVAILABLE = True
except ImportError:
    APIFY_AVAILABLE = False

# 30 remaining destinations (excluding 4 already done)
REMAINING_30 = [
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
    text = unicodedata.normalize("NFD", text.lower().strip())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text)

def extract_price_from_text(text: str) -> Optional[int]:
    patterns = [
        r"(\d+(?:\.\d+)*)\s*(?:đ|vnd|₫)",
        r"(\d+)\s*(?:k|K)(?:đ|vnd)?",
        r"(\d+000)",
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            numbers = []
            for m in matches:
                clean = m.replace(".", "").replace(",", "")
                if clean.isdigit():
                    numbers.append(int(clean))
            if numbers:
                largest = max(numbers)
                if 1000 <= largest <= 100_000_000:
                    if largest < 10000 and "K" in text:
                        largest *= 1000
                    return largest
    return None

def tavily_search(query: str) -> list[dict]:
    if not TAVILY_API_KEY:
        return []
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "basic",
        "max_results": 3,
    }
    try:
        resp = httpx.post(TAVILY_URL, json=payload, timeout=10.0)
        resp.raise_for_status()
        return resp.json().get("results", [])
    except:
        return []

def discover_places(destination: str) -> tuple[list[dict], list[dict]]:
    attractions = []
    food = []

    # Attractions
    results = tavily_search(f"top attractions {destination} Vietnam 2026")
    for r in results:
        content = r.get("content", "")
        names = re.findall(r"\b([A-ZÀ-ỿ][a-zà-ỿ]+(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b", content[:300])
        for name in names[:2]:
            if len(name) > 2:
                attractions.append({"name": name, "description": content[:150]})

    # Food
    results = tavily_search(f"best restaurants food {destination} Vietnam")
    for r in results:
        content = r.get("content", "")
        names = re.findall(r"\b([A-ZÀ-ỿ][a-zà-ỿ]+(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b", content[:300])
        for name in names[:2]:
            if len(name) > 2:
                food.append({"name": name, "description": content[:150]})

    return attractions, food

def apify_scrape_quick(search_terms: list[str], destination: str) -> dict:
    if not APIFY_AVAILABLE or not APIFY_TOKEN:
        return {}
    try:
        client = ApifyClient(APIFY_TOKEN)
        run_input = {
            "searchStringsArray": search_terms,
            "locationQuery": f"{destination}, Vietnam",
            "maxCrawledPlacesPerSearch": 2,  # Reduced for speed
            "language": "vi",
            "maxImages": 5,  # Fewer images but faster
            "maxReviews": 3,
            "skipClosedPlaces": False,
            "scrapeSocialMediaProfiles": {"facebooks": False, "instagrams": False},
            "scrapeContacts": False,
            "scrapeReviewsPersonalData": False,
            "includeWebResults": False,
        }
        run = client.actor(APIFY_ACTOR_ID).call(run_input=run_input)
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

        lookup = {}
        for item in items:
            name = item.get("title") or item.get("name") or ""
            if name:
                key = normalize_name(name)
                if key not in lookup:
                    lookup[key] = item
        return lookup
    except Exception as e:
        print(f"  Apify error: {e}")
        return {}

def extract_enrichment(item: dict) -> dict:
    result = {}
    lat = item.get("location", {}).get("lat") or item.get("latitude")
    lng = item.get("location", {}).get("lng") or item.get("longitude")
    if lat:
        result["latitude"] = float(lat)
    if lng:
        result["longitude"] = float(lng)

    rating = item.get("totalScore") or item.get("rating")
    if rating:
        result["rating"] = float(rating)

    images_raw = item.get("images") or []
    urls = []
    for img in images_raw[:5]:
        if isinstance(img, dict):
            url = img.get("imageUrl") or img.get("url")
        else:
            url = str(img) if isinstance(img, str) else None
        if url and isinstance(url, str) and url.startswith("http"):
            urls.append(url)
    if urls:
        result["images"] = urls
        result["cover_image"] = urls[0]

    return result

def build_place(name: str, destination: str, category: str, price: Optional[int], apify_data: dict) -> Optional[dict]:
    if not apify_data.get("latitude"):
        return None

    return {
        "destination": destination,
        "category": category,
        "name": name,
        "name_en": name,  # Try to use place name as-is
        "address": apify_data.get("address") or f"{destination}, Vietnam",
        "area": "center",
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
            "is_free": category == "ATTRACTION" and price is None,
        },
        "must_visit": False,
        "priority_score": 0,
        "best_time_of_day": "any",
        "tags": [],
    }

def post_to_backend(destination: str, places: list[dict]) -> bool:
    if not places:
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
        print(f"    ✓ +{created} places created")
        return True
    except Exception as e:
        print(f"    ❌ POST failed: {e}")
        return False

def import_one(destination: str):
    print(f"\n🌏 {destination}")
    print(f"   Discovering places...")

    attractions, food = discover_places(destination)
    if not attractions and not food:
        print(f"   ⚠️  No places found")
        return

    total = len(attractions) + len(food)
    print(f"   Found: {len(attractions)} attractions, {len(food)} food")

    print(f"   Enriching with Apify...")
    search_terms = [f"{p['name']} {destination}" for p in (attractions + food)][:6]
    apify_lookup = apify_scrape_quick(search_terms, destination)

    places_to_post = []

    for att in attractions:
        name = att["name"].strip()
        apify_key = normalize_name(name)
        apify_data = apify_lookup.get(apify_key, {})
        price = None  # Could add Tavily price search here

        place = build_place(name, destination, "ATTRACTION", price, apify_data)
        if place:
            places_to_post.append(place)

    for food_item in food:
        name = food_item["name"].strip()
        apify_key = normalize_name(name)
        apify_data = apify_lookup.get(apify_key, {})
        price = None

        place = build_place(name, destination, "FOOD", price, apify_data)
        if place:
            places_to_post.append(place)

    if places_to_post:
        print(f"   Posting {len(places_to_post)} places...")
        post_to_backend(destination, places_to_post)
    else:
        print(f"   ⚠️  No valid places to post")

def main():
    print("\n" + "=" * 70)
    print("🚀 IMPORT: 30 REMAINING DESTINATIONS")
    print("=" * 70)

    for i, (destination, en) in enumerate(REMAINING_30, 1):
        print(f"\n[{i}/{len(REMAINING_30)}]", end="")
        try:
            import_one(destination)
            time.sleep(1)  # Rate limiting
        except Exception as e:
            print(f"   ❌ Error: {e}")

    print("\n" + "=" * 70)
    print("✅ IMPORT COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    main()
