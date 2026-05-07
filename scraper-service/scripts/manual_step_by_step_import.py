#!/usr/bin/env python3
"""
Manual Step-by-Step Import
- Tavily: discover attractions/food
- Tavily: get prices (specific queries)
- Verify data completeness
- Post to DB
- One destination at a time with detailed output
"""

import os
import re
import json
import time
import requests
import httpx
import unicodedata
from dotenv import load_dotenv

# Load .env fresh
load_dotenv("/home/thahvinh/Desktop/Project_S/tripcompass/scraper-service/.env", override=True)

TAVILY_KEY = os.getenv("TAVILY_API_KEY")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"

TAVILY_URL = "https://api.tavily.com/search"

DESTINATIONS = [
    ("Đà Nẵng", "Da Nang"),
    ("Hà Nội", "Hanoi"),
    ("TP. Hồ Chí Minh", "Ho Chi Minh City"),
    ("Huế", "Hue"),
    ("Hải Phòng", "Hai Phong"),
    ("Cần Thơ", "Can Tho"),
    ("An Giang", "An Giang"),
    ("Bắc Ninh", "Bac Ninh"),
    ("Cao Bằng", "Cao Bang"),
    ("Cà Mau", "Ca Mau"),
]

def tavily_search(query: str, max_results: int = 5) -> list:
    """Call Tavily API"""
    try:
        resp = requests.post(
            TAVILY_URL,
            json={
                "api_key": TAVILY_KEY,
                "query": query,
                "search_depth": "advanced",
                "max_results": max_results,
                "include_raw_content": True,
            },
            timeout=20
        )
        if resp.status_code == 200:
            return resp.json().get("results", [])
        return []
    except Exception as e:
        print(f"      ⚠️ Tavily error: {e}")
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

def extract_places_from_results(results: list, category: str) -> list:
    """Extract place names and data from Tavily results"""
    places = []
    seen_names = set()

    for result in results:
        content = result.get("content", "")
        title = result.get("title", "")
        url = result.get("url", "")

        # Extract place names from content
        names = re.findall(
            r'\b([A-ZÀ-ỿ][a-zà-ỿ]{2,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b',
            content[:800]
        )

        for name in names:
            if len(name) > 3 and name not in seen_names:
                places.append({
                    "name": name,
                    "category": category,
                    "description": content[:250],
                    "source_url": url,
                    "title": title,
                })
                seen_names.add(name)

                if len(places) >= 8:  # Limit to 8 per category
                    break

        if len(places) >= 8:
            break

    return places

def get_price_for_place(place_name: str, destination: str) -> dict:
    """Get specific price for a place"""
    # Try Vietnamese query first
    query = f"giá vé {place_name} {destination} 2026"
    results = tavily_search(query, max_results=3)

    price = None
    for result in results:
        content = result.get("content", "")
        price = extract_price(content)
        if price:
            return {"price": price, "source": result.get("url", ""), "verified": True}

    # Try English query
    query = f"ticket price {place_name} {destination} Vietnam 2026"
    results = tavily_search(query, max_results=2)

    for result in results:
        content = result.get("content", "")
        price = extract_price(content)
        if price:
            return {"price": price, "source": result.get("url", ""), "verified": True}

    return {"price": None, "source": "", "verified": False}

def build_place_input(place: dict, destination: str, price_data: dict) -> dict:
    """Build PlaceInput for backend"""
    return {
        "destination": destination,
        "category": place["category"],
        "name": place["name"],
        "name_en": place["name"],
        "address": f"{destination}, Vietnam",
        "area": "center",
        "latitude": 0.0,
        "longitude": 0.0,
        "cover_image": None,
        "images": [],
        "rating": 4.0,
        "hours": "08:00-22:00",
        "recommended_duration": 120 if place["category"] == "ATTRACTION" else 45,
        "base_price": price_data["price"],
        "metadata": {
            "source": "tavily",
            "description": place["description"],
            "price_verified": price_data["verified"],
            "price_source": price_data["source"],
            "is_free": place["category"] == "ATTRACTION" and price_data["price"] is None,
        },
        "source_url": place["source_url"],
        "must_visit": False,
        "priority_score": 5,
        "best_time_of_day": "any",
        "tags": [],
    }

def post_places_to_backend(destination: str, places: list) -> dict:
    """POST places to backend"""
    if not places:
        return {"created": 0, "updated": 0}

    payload = {
        "destination": destination,
        "places": places,
        "combos": [],
    }

    try:
        resp = httpx.post(SEED_URL, json=payload, timeout=30)
        result = resp.json()
        return {
            "created": result.get("places_created", 0),
            "updated": result.get("places_updated", 0),
        }
    except Exception as e:
        print(f"      ❌ POST error: {e}")
        return {"created": 0, "updated": 0}

def import_destination(destination: str, destination_en: str):
    """Import one destination"""
    print(f"\n{'='*80}")
    print(f"📍 {destination} ({destination_en})")
    print(f"{'='*80}")

    # Discover attractions
    print(f"\n[1] Discovering attractions via Tavily...")
    query_att = f"top attractions things to do {destination} Vietnam 2026"
    results_att = tavily_search(query_att, max_results=5)
    attractions = extract_places_from_results(results_att, "ATTRACTION")
    print(f"    ✓ Found {len(attractions)} attractions:")
    for att in attractions:
        print(f"       • {att['name']}")

    # Discover food
    print(f"\n[2] Discovering food via Tavily...")
    query_food = f"best restaurants food {destination} Vietnam"
    results_food = tavily_search(query_food, max_results=5)
    food = extract_places_from_results(results_food, "FOOD")
    print(f"    ✓ Found {len(food)} food places:")
    for f in food:
        print(f"       • {f['name']}")

    all_places = attractions + food

    # Get prices
    print(f"\n[3] Getting prices for each place...")
    places_with_prices = []

    for place in all_places:
        price_data = get_price_for_place(place["name"], destination)

        place_input = build_place_input(place, destination, price_data)
        places_with_prices.append(place_input)

        status = "✓" if price_data["verified"] else "⚠️"
        price_str = f"{price_data['price']:,} VND" if price_data["price"] else "N/A"
        print(f"    {status} {place['name']:30} → {price_str}")

    # Verify data
    print(f"\n[4] Verifying data completeness...")
    valid_places = []
    for place in places_with_prices:
        # Check required fields
        if place["name"] and place["destination"]:
            valid_places.append(place)
            print(f"    ✓ {place['name']}")
        else:
            print(f"    ❌ {place['name']} - missing fields")

    # Post to backend
    print(f"\n[5] Posting {len(valid_places)} places to backend...")
    result = post_places_to_backend(destination, valid_places)

    print(f"\n✅ RESULT:")
    print(f"    Created: {result['created']}")
    print(f"    Updated: {result['updated']}")

    return result["created"] + result["updated"]

def main():
    print("""
╔════════════════════════════════════════════════════════════════════════╗
║  MANUAL IMPORT: Step-by-Step with Tavily                              ║
║  - Discover places → Get prices → Verify → Post to DB                 ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

    total_imported = 0

    for destination, destination_en in DESTINATIONS:
        try:
            imported = import_destination(destination, destination_en)
            total_imported += imported
            time.sleep(2)  # Rate limiting
        except Exception as e:
            print(f"\n❌ Error importing {destination}: {e}")
            import traceback
            traceback.print_exc()

    print(f"""
╔════════════════════════════════════════════════════════════════════════╗
║ ✅ IMPORT COMPLETE                                                     ║
║ Total places imported: {total_imported:<40} ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

if __name__ == "__main__":
    main()
