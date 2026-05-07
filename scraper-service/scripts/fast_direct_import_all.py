#!/usr/bin/env python3
"""
Fast Direct Import: Tavily + Apify (HTTP direct) + DB
- Direct HTTP calls (no heavy clients)
- Clean output, real progress
- All 34 destinations
"""

import os
import re
import json
import time
import requests
import httpx
import unicodedata
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

env_path = Path("/home/thahvinh/Desktop/Project_S/tripcompass/scraper-service/.env")
load_dotenv(env_path)

TAVILY_KEY = os.getenv("TAVILY_API_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")

SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
APIFY_ACTOR_ID = "nwua9Gu5YrADL7ZDj"

# 34 destinations
DESTINATIONS = [
    ("Hà Nội", "Hanoi"),
    ("Hải Phòng", "Hai Phong"),
    ("Huế", "Hue"),
    ("Đà Nẵng", "Da Nang"),
    ("Cần Thơ", "Can Tho"),
    ("TP. Hồ Chí Minh", "Ho Chi Minh City"),
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

def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower().strip())
    return "".join(c for c in text if unicodedata.category(c) != "Mn")

def extract_price(text: str) -> Optional[int]:
    """Extract price in VND"""
    patterns = [
        (r'(\d+(?:\.\d+)*)\s*(?:đ|VND|₫)', 1),
        (r'(\d+)\s*[kK]', 1000),
        (r'(\d+000)', 1),
    ]
    for pattern, mult in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for m in matches:
            clean = str(m).replace(".", "").replace(",", "")
            if clean.isdigit():
                price = int(clean) * mult
                if 10000 <= price <= 100_000_000:
                    return price
    return None

def tavily_search(query: str) -> list:
    """Call Tavily API"""
    try:
        resp = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": 5,
            },
            timeout=15
        )
        return resp.json().get("results", [])
    except:
        return []

def discover_places(destination: str) -> tuple:
    """Discover attractions and food via Tavily"""
    attractions = []
    food = []

    # Attractions
    results = tavily_search(f"top attractions things to do {destination} Vietnam")
    for r in results[:3]:
        content = r.get("content", "")[:400]
        names = re.findall(r'\b([A-ZÀ-ỿ][a-zà-ỿ]{2,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b', content)
        for name in names[:2]:
            if len(name) > 3 and name not in [a["name"] for a in attractions]:
                attractions.append({"name": name, "content": content[:150]})

    # Food
    results = tavily_search(f"best restaurants food {destination} Vietnam")
    for r in results[:3]:
        content = r.get("content", "")[:400]
        names = re.findall(r'\b([A-ZÀ-ỿ][a-zà-ỿ]{2,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b', content)
        for name in names[:2]:
            if len(name) > 3 and name not in [f["name"] for f in food]:
                food.append({"name": name, "content": content[:150]})

    return attractions[:5], food[:5]

def apify_call(search_terms: list, destination: str) -> dict:
    """Call Apify API directly (HTTP)"""
    if not APIFY_TOKEN:
        return {}

    try:
        url = "https://api.apify.com/v2/acts/" + APIFY_ACTOR_ID + "/call"
        payload = {
            "searchStringsArray": search_terms[:5],
            "locationQuery": f"{destination}, Vietnam",
            "maxCrawledPlacesPerSearch": 2,
            "language": "vi",
            "maxImages": 8,
            "maxReviews": 3,
            "skipClosedPlaces": False,
        }

        resp = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {APIFY_TOKEN}"},
            timeout=120
        )

        if resp.status_code != 201:
            return {}

        data = resp.json()
        dataset_id = data.get("defaultDatasetId")

        if not dataset_id:
            return {}

        # Get dataset items
        items_resp = requests.get(
            f"https://api.apify.com/v2/datasets/{dataset_id}/items",
            headers={"Authorization": f"Bearer {APIFY_TOKEN}"},
            timeout=30
        )

        if items_resp.status_code != 200:
            return {}

        items = items_resp.json()
        lookup = {}
        for item in items:
            name = item.get("title") or item.get("name") or ""
            if name:
                key = normalize(name)
                if key not in lookup:
                    lookup[key] = item

        return lookup
    except Exception as e:
        print(f"      ⚠️ Apify: {e}")
        return {}

def build_place(name: str, destination: str, category: str, price: Optional[int],
                apify_item: dict) -> Optional[dict]:
    """Build PlaceInput"""
    if not apify_item.get("latitude") and not apify_item.get("location", {}).get("lat"):
        return None

    lat = apify_item.get("latitude") or apify_item.get("location", {}).get("lat")
    lng = apify_item.get("longitude") or apify_item.get("location", {}).get("lng")

    if not lat or not lng:
        return None

    # Extract images
    images = []
    images_raw = apify_item.get("images") or []
    for img in images_raw[:8]:
        if isinstance(img, dict):
            url = img.get("imageUrl") or img.get("url")
        else:
            url = str(img) if isinstance(img, str) else None
        if url and isinstance(url, str) and url.startswith("http"):
            images.append(url)

    return {
        "destination": destination,
        "category": category,
        "name": name,
        "name_en": name,
        "address": apify_item.get("address") or f"{destination}, Vietnam",
        "area": "center",
        "latitude": float(lat),
        "longitude": float(lng),
        "cover_image": images[0] if images else None,
        "images": images,
        "rating": float(apify_item.get("rating") or apify_item.get("totalScore") or 4.0),
        "hours": apify_item.get("hours") or "08:00-22:00",
        "recommended_duration": 120 if category == "ATTRACTION" else 45,
        "base_price": price,
        "metadata": {"source": "tavily+apify"},
        "must_visit": False,
        "priority_score": 0,
        "best_time_of_day": "any",
        "tags": [],
    }

def post_to_backend(destination: str, places: list) -> int:
    """POST places to backend"""
    if not places:
        return 0

    payload = {"destination": destination, "places": places, "combos": []}

    try:
        resp = httpx.post(SEED_URL, json=payload, timeout=30)
        result = resp.json()
        return result.get("places_created", 0)
    except:
        return 0

def main():
    print("""
╔════════════════════════════════════════════════════════════════════════╗
║  FAST DIRECT IMPORT: All 34 Destinations                              ║
║  Tavily → Apify → DB (direct HTTP, clean output)                      ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

    total_created = 0

    for i, (dest, dest_en) in enumerate(DESTINATIONS, 1):
        print(f"\n[{i:2d}/34] {dest:<20}", end="")

        # Discover
        attractions, food = discover_places(dest)
        if not attractions and not food:
            print(" ⚠️ No places found")
            continue

        total_found = len(attractions) + len(food)

        # Apify
        search_terms = [f"{p['name']} {dest}" for p in attractions + food]
        apify_lookup = apify_call(search_terms, dest)

        # Build
        places = []
        for att in attractions:
            name = att["name"].strip()
            key = normalize(name)
            apify_data = apify_lookup.get(key, {})

            # Try to get price
            price_query = f"giá vé {name} {dest} 2026"
            price_results = tavily_search(price_query)
            price = None
            for r in price_results:
                price = extract_price(r.get("content", ""))
                if price:
                    break

            place = build_place(name, dest, "ATTRACTION", price, apify_data)
            if place:
                places.append(place)

        for food_item in food:
            name = food_item["name"].strip()
            key = normalize(name)
            apify_data = apify_lookup.get(key, {})

            place = build_place(name, dest, "FOOD", None, apify_data)
            if place:
                places.append(place)

        # POST
        if places:
            created = post_to_backend(dest, places)
            total_created += created
            print(f" ✓ {len(places)} places → +{created} created")
        else:
            print(f" ❌ No valid places")

        time.sleep(1)  # Rate limit

    print(f"""
╔════════════════════════════════════════════════════════════════════════╗
║ ✅ IMPORT COMPLETE                                                     ║
║ Total created: {total_created:<50} ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

if __name__ == "__main__":
    main()
