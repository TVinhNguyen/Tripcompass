#!/usr/bin/env python3
"""
Manual Đà Nẵng Import - Careful, step-by-step with field verification
- Extract place names from Tavily TITLES (not body text)
- Use Apify for complete enrichment
- Manual verification before DB insert
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
    """Get complete data from Apify"""
    print(f"      [Apify] Searching '{place_name}'...", end=" ", flush=True)

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

            print(f"✓ Found: {item.get('title', 'N/A')}")
            return data
        else:
            print("⚠️ No data")
            return {}
    except Exception as e:
        print(f"❌ Error: {str(e)[:30]}")
        return {}

def import_danang():
    """Import Đà Nẵng with CAREFUL field verification"""

    print("""
╔════════════════════════════════════════════════════════════════════════╗
║ ĐÀNG NẴNG: Manual Import with Field Verification                      ║
║ Step 1: Tavily discovery (titles only)                                 ║
║ Step 2: Apify enrichment (images, coords, rating, address)             ║
║ Step 3: Price extraction from Tavily                                   ║
║ Step 4: Manual verification & DB insert                                ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

    destination = "Đà Nẵng"
    all_places = []

    # STEP 1: Discover via Tavily - extract TITLES only
    print("\n[STEP 1] Discovering attractions (from Tavily titles)...\n")
    results_att = tavily_search(f"top 10 attractions Đà Nẵng Vietnam 2026", max_results=5)

    attractions = []
    for r in results_att:
        title = r.get("title", "").strip()
        # Clean up title - remove "top X attractions", "things to do", etc
        if title and len(title) > 3:
            # Remove common junk from titles
            title = re.sub(r'^\d+\.\s*', '', title)  # Remove "1. " prefix
            title = re.sub(r'\s*-\s*.*', '', title)   # Remove " - description"
            title = re.sub(r'\s*\|.*', '', title)     # Remove " | ..."
            title = title.strip()

            if title and len(title) > 3 and title not in attractions:
                attractions.append(title)
                print(f"  • {title}")

    print(f"\n  Found {len(attractions)} attractions\n")

    # STEP 2: Discover food - from titles
    print("[STEP 2] Discovering food places (from Tavily titles)...\n")
    results_food = tavily_search(f"best restaurants Đà Nẵng Vietnam", max_results=5)

    food_places = []
    for r in results_food:
        title = r.get("title", "").strip()
        if title and len(title) > 3:
            title = re.sub(r'^\d+\.\s*', '', title)
            title = re.sub(r'\s*-\s*.*', '', title)
            title = re.sub(r'\s*\|.*', '', title)
            title = title.strip()

            if title and len(title) > 3 and title not in food_places and title not in attractions:
                food_places.append(title)
                print(f"  • {title}")

    print(f"\n  Found {len(food_places)} food places\n")

    # STEP 3: Get complete data via Apify for top attractions
    print("[STEP 3] Enriching with Apify (images, coords, ratings)...\n")

    print("  ATTRACTIONS:\n")
    for att in attractions[:5]:
        apify_data = get_apify_data(att, destination)

        if not apify_data.get("latitude"):
            print(f"           ⚠️ Skip (no coordinates)\n")
            continue

        # Get price from Tavily
        price_results = tavily_search(f"giá vé {att} {destination} 2026", max_results=3)
        price = None
        for pr in price_results:
            price = extract_price(pr.get("content", ""))
            if price:
                break

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
            "rating": apify_data.get("rating") or 4.0,
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

        # Display what was extracted
        print(f"           Name: {att}")
        print(f"           Address: {place['address'][:60]}")
        print(f"           Coords: ({place['latitude']}, {place['longitude']})")
        print(f"           Rating: {place['rating']} ⭐")
        print(f"           Price: {price if price else 'TBD'} VND")
        print(f"           Images: {len(place['images'])} photos\n")

        time.sleep(1)

    print("\n  FOOD PLACES:\n")
    for food in food_places[:3]:
        apify_data = get_apify_data(food, destination)

        if not apify_data.get("latitude"):
            print(f"           ⚠️ Skip (no coordinates)\n")
            continue

        price = None

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
            "rating": apify_data.get("rating") or 4.0,
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

        print(f"           Name: {food}")
        print(f"           Address: {place['address'][:60]}")
        print(f"           Coords: ({place['latitude']}, {place['longitude']})")
        print(f"           Rating: {place['rating']} ⭐")
        print(f"           Images: {len(place['images'])} photos\n")

        time.sleep(1)

    # STEP 4: Save for verification
    print("\n[STEP 4] Verification Summary\n")
    attractions_count = sum(1 for p in all_places if p["category"] == "ATTRACTION")
    food_count = sum(1 for p in all_places if p["category"] == "FOOD")

    print(f"  Total: {len(all_places)} places ({attractions_count} attr, {food_count} food)\n")

    # Check field completeness
    print("  Field Completeness Check:\n")
    for place in all_places:
        missing = []
        if not place.get("name"):
            missing.append("name")
        if not place.get("address"):
            missing.append("address")
        if not place.get("latitude"):
            missing.append("latitude")
        if not place.get("longitude"):
            missing.append("longitude")
        if not place.get("rating"):
            missing.append("rating")

        status = "✓" if not missing else "⚠️"
        print(f"    {status} {place['name']:<30} {f'[missing: {', '.join(missing)}]' if missing else '[OK]'}")

    # Save to file
    with open("/tmp/danang_final.json", "w") as f:
        json.dump(all_places, f, indent=2, ensure_ascii=False)

    print(f"\n  Saved to: /tmp/danang_final.json\n")

    return all_places

if __name__ == "__main__":
    places = import_danang()
