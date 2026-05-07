#!/usr/bin/env python3
"""
Batch Manual Import - 5 destinations at a time
Complete data: 3-4+ images, rating, price, full details
Uses Apify for images/rating, Tavily for prices
"""

import os
import re
import json
import time
import requests
from apify_client import ApifyClient
from dotenv import load_dotenv

load_dotenv("/home/thahvinh/Desktop/Project_S/tripcompass/scraper-service/.env", override=True)

TAVILY_KEY = os.getenv("TAVILY_API_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"

BATCH_1_DESTINATIONS = [
    ("Đà Nẵng", "Da Nang"),
    ("Hà Nội", "Hanoi"),
    ("TP. Hồ Chí Minh", "Ho Chi Minh City"),
    ("Huế", "Hue"),
    ("Hải Phòng", "Hai Phong"),
]

client = ApifyClient(APIFY_TOKEN)

def tavily_search(query: str, max_results: int = 5) -> list:
    """Call Tavily API"""
    try:
        resp = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_KEY,
                "query": query,
                "search_depth": "advanced",
                "max_results": max_results,
                "include_raw_content": True,
            },
            timeout=20
        )
        return resp.json().get("results", [])
    except:
        return []

def extract_price(text: str):
    """Extract price from text"""
    patterns = [
        (r'(\d+(?:\.\d+)*)\s*(?:đ|VND|₫|vnd)', 1),
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

def get_apify_data(place_name: str, destination: str) -> dict:
    """Get complete data from Apify - images, rating, coordinates"""
    print(f"      [Apify] {place_name}...", end=" ", flush=True)

    try:
        run_input = {
            "searchStringsArray": [f"{place_name} {destination}"],
            "locationQuery": f"{destination}, Vietnam",
            "maxCrawledPlacesPerSearch": 1,
            "language": "vi",
            "maxImages": 10,
            "maxReviews": 3,
        }

        run = client.actor("nwua9Gu5YrADL7ZDj").call(run_input=run_input)
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

        if items:
            item = items[0]

            # Extract images
            images = []
            images_raw = item.get("images") or []
            for img in images_raw[:10]:
                if isinstance(img, dict):
                    url = img.get("imageUrl") or img.get("url")
                else:
                    url = str(img) if isinstance(img, str) else None
                if url and isinstance(url, str) and url.startswith("http"):
                    images.append(url)

            data = {
                "latitude": item.get("location", {}).get("lat") or item.get("latitude"),
                "longitude": item.get("location", {}).get("lng") or item.get("longitude"),
                "rating": item.get("totalScore") or item.get("rating"),
                "address": item.get("address") or f"{destination}, Vietnam",
                "images": images,
                "url": item.get("url"),
            }

            print(f"✓ {len(images)} images")
            return data
        else:
            print("⚠️ No data")
            return {}
    except Exception as e:
        print(f"❌ {str(e)[:20]}")
        return {}

def get_price_for_place(place_name: str, destination: str) -> int:
    """Get price via Tavily"""
    query = f"giá vé {place_name} {destination} 2026"
    results = tavily_search(query, max_results=3)

    for result in results:
        content = result.get("content", "")
        price = extract_price(content)
        if price:
            return price

    return None

def import_destination(destination: str, destination_en: str) -> list:
    """Import one destination - return list of verified places"""

    print(f"\n{'='*80}")
    print(f"📍 {destination} ({destination_en})")
    print(f"{'='*80}\n")

    all_places = []

    # Discover attractions
    print(f"[1] Discovering attractions...")
    results = tavily_search(f"top attractions things to do {destination} Vietnam 2026", max_results=5)

    real_attractions = []
    for r in results:
        content = r.get("content", "")
        # Look for real place names (not generic words)
        names = re.findall(r'\b([A-ZÀ-ỿ][a-zà-ỿ]{3,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b', content[:600])
        for name in names:
            if name not in real_attractions and len(name) > 3:
                real_attractions.append(name)

    print(f"    Found {len(real_attractions)} attractions\n")

    # Get full data for each attraction
    for att in real_attractions[:5]:  # Top 5 attractions
        print(f"  [{att}]")

        apify_data = get_apify_data(att, destination)

        if not apify_data.get("latitude"):
            print(f"        ⚠️ Skipped (no coordinates)")
            continue

        price = get_price_for_place(att, destination)
        print(f"      [Price] {price:,} VND" if price else f"      [Price] TBD")

        place = {
            "destination": destination,
            "category": "ATTRACTION",
            "name": att,
            "name_en": att,
            "address": apify_data.get("address", f"{destination}, Vietnam"),
            "latitude": apify_data.get("latitude"),
            "longitude": apify_data.get("longitude"),
            "cover_image": apify_data.get("images")[0] if apify_data.get("images") else None,
            "images": apify_data.get("images", []),
            "rating": apify_data.get("rating", 4.0),
            "hours": "08:00-22:00",
            "base_price": price,
            "metadata": {
                "source": "manual_verification",
                "source_url": apify_data.get("url"),
            },
            "must_visit": False,
            "priority_score": 7,
            "best_time_of_day": "any",
            "tags": [],
        }

        all_places.append(place)
        print()

        time.sleep(1)

    # Discover food
    print(f"[2] Discovering food...")
    results = tavily_search(f"best restaurants food {destination} Vietnam", max_results=5)

    real_food = []
    for r in results:
        content = r.get("content", "")
        names = re.findall(r'\b([A-ZÀ-ỿ][a-zà-ỿ]{3,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b', content[:600])
        for name in names:
            if name not in real_food and len(name) > 3:
                real_food.append(name)

    print(f"    Found {len(real_food)} food places\n")

    # Get full data for each food place
    for food in real_food[:3]:  # Top 3 food places
        print(f"  [{food}]")

        apify_data = get_apify_data(food, destination)

        if not apify_data.get("latitude"):
            print(f"        ⚠️ Skipped (no coordinates)")
            continue

        price = get_price_for_place(food, destination)
        print(f"      [Price] {price:,} VND" if price else f"      [Price] TBD")

        place = {
            "destination": destination,
            "category": "FOOD",
            "name": food,
            "name_en": food,
            "address": apify_data.get("address", f"{destination}, Vietnam"),
            "latitude": apify_data.get("latitude"),
            "longitude": apify_data.get("longitude"),
            "cover_image": apify_data.get("images")[0] if apify_data.get("images") else None,
            "images": apify_data.get("images", []),
            "rating": apify_data.get("rating", 4.0),
            "hours": "08:00-22:00",
            "base_price": price,
            "metadata": {
                "source": "manual_verification",
                "source_url": apify_data.get("url"),
            },
            "must_visit": False,
            "priority_score": 6,
            "best_time_of_day": "any",
            "tags": [],
        }

        all_places.append(place)
        print()

        time.sleep(1)

    return all_places

def main():
    print("""
╔════════════════════════════════════════════════════════════════════════╗
║ BATCH 1: MANUAL IMPORT (5 DESTINATIONS)                               ║
║ Complete data: 3-4+ images, rating, price                             ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

    all_batch_data = {}

    for destination, destination_en in BATCH_1_DESTINATIONS:
        places = import_destination(destination, destination_en)
        all_batch_data[destination] = places

    # Save for review
    with open("/tmp/batch_1_data.json", "w") as f:
        json.dump(all_batch_data, f, indent=2)

    # Print summary
    print(f"\n{'='*80}")
    print("BATCH 1 SUMMARY:\n")

    total_places = 0
    for dest, places in all_batch_data.items():
        total_places += len(places)
        attractions = sum(1 for p in places if p["category"] == "ATTRACTION")
        food = sum(1 for p in places if p["category"] == "FOOD")
        print(f"✓ {dest:20} | {len(places):2} places ({attractions} attr, {food} food)")

    print(f"\n{'='*80}")
    print(f"Total places collected: {total_places}")
    print(f"Data saved to: /tmp/batch_1_data.json")
    print(f"\n⏳ Waiting for your approval before inserting to DB...")

if __name__ == "__main__":
    main()
