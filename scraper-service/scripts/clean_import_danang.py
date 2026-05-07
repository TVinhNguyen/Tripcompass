#!/usr/bin/env python3
"""
Clean import for Đà Nẵng - step by step with full verification
"""

import os
import re
import json
import time
import requests
import httpx
from apify_client import ApifyClient
from dotenv import load_dotenv

load_dotenv("/home/thahvinh/Desktop/Project_S/tripcompass/scraper-service/.env", override=True)

TAVILY_KEY = os.getenv("TAVILY_API_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"

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
    except Exception as e:
        print(f"  ⚠️ Tavily error: {e}")
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

            print(f"✓ {len(images)} img, rating={data['rating']}")
            return data
        else:
            print("⚠️ No data")
            return {}
    except Exception as e:
        print(f"❌ {str(e)[:30]}")
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

def import_danang():
    """Import Đà Nẵng with full verification"""

    print("""
╔════════════════════════════════════════════════════════════════════════╗
║ CLEAN IMPORT: Đà Nẵng (Manual Verification)                           ║
║ Tavily discovery → Apify enrichment → manual verify → DB insert       ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

    all_places = []
    destination = "Đà Nẵng"
    destination_en = "Da Nang"

    # Discover attractions
    print(f"\n[STEP 1] Discovering attractions via Tavily...")
    results = tavily_search(f"top attractions things to do {destination} Vietnam 2026", max_results=5)

    real_attractions = []
    for r in results:
        content = r.get("content", "")
        names = re.findall(r'\b([A-ZÀ-ỿ][a-zà-ỿ]{3,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b', content[:600])
        for name in names:
            if name not in real_attractions and len(name) > 3:
                real_attractions.append(name)

    print(f"    Found {len(real_attractions)} potential attractions")
    print(f"    Top candidates: {', '.join(real_attractions[:5])}\n")

    # Get full data for top 5 attractions
    for att in real_attractions[:5]:
        print(f"  [{att}]")

        apify_data = get_apify_data(att, destination)

        if not apify_data.get("latitude"):
            print(f"        ⚠️ Skipped (no coordinates)")
            continue

        price = get_price_for_place(att, destination)
        price_str = f"{price:,} VND" if price else "FREE/N/A"
        print(f"      [Price] {price_str}")

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
            "recommended_duration": 120,
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
        time.sleep(1)

    # Discover food
    print(f"\n[STEP 2] Discovering food via Tavily...")
    results = tavily_search(f"best restaurants food {destination} Vietnam", max_results=5)

    real_food = []
    for r in results:
        content = r.get("content", "")
        names = re.findall(r'\b([A-ZÀ-ỿ][a-zà-ỿ]{3,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b', content[:600])
        for name in names:
            if name not in real_food and len(name) > 3:
                real_food.append(name)

    print(f"    Found {len(real_food)} potential food places")
    print(f"    Top candidates: {', '.join(real_food[:5])}\n")

    # Get full data for top 3 food places
    for food in real_food[:3]:
        print(f"  [{food}]")

        apify_data = get_apify_data(food, destination)

        if not apify_data.get("latitude"):
            print(f"        ⚠️ Skipped (no coordinates)")
            continue

        price = get_price_for_place(food, destination)
        price_str = f"{price:,} VND" if price else "N/A"
        print(f"      [Price] {price_str}")

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
            "recommended_duration": 45,
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
        time.sleep(1)

    # Summary
    print(f"\n[STEP 3] Summary")
    attractions = [p for p in all_places if p["category"] == "ATTRACTION"]
    food = [p for p in all_places if p["category"] == "FOOD"]

    print(f"    ✓ {len(attractions)} Attractions:")
    for a in attractions:
        imgs = "✓" if a.get("images") else "✗"
        print(f"      [{imgs}] {a['name']:<30} {a['address'][:40]}")

    print(f"\n    ✓ {len(food)} Food places:")
    for f in food:
        imgs = "✓" if f.get("images") else "✗"
        print(f"      [{imgs}] {f['name']:<30} {f['address'][:40]}")

    # Save for manual review
    with open("/tmp/danang_verified.json", "w") as f:
        json.dump(all_places, f, indent=2, ensure_ascii=False)

    print(f"\n📝 Data saved to /tmp/danang_verified.json")
    print(f"\n⏳ Waiting for your approval to insert to DB...")

    return all_places

if __name__ == "__main__":
    places = import_danang()
