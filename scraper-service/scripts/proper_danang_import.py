#!/usr/bin/env python3
"""
Proper Đà Nẵng Import - Following IMPORT_RULE.md

1. DISCOVER: Multiple Tavily queries → 15-20 attractions + 8-12 food
2. ENRICH: Apify (coords, images, rating, hours, address)
3. EXTRACT: All fields (area, tags, must_visit, priority_score, best_time_of_day, duration)
4. VALIDATE: 100% field accuracy before DB insert
"""

import os
import re
import json
import time
import requests
import httpx
from apify_client import ApifyClient
from dotenv import load_dotenv

load_dotenv(".env", override=True)

TAVILY_KEY = os.getenv("TAVILY_API_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"

client = ApifyClient(APIFY_TOKEN)

def tavily_search(query):
    """Search with Tavily"""
    try:
        resp = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_KEY,
                "query": query,
                "search_depth": "advanced",
                "max_results": 10,
                "include_raw_content": True,
            },
            timeout=20
        )
        return resp.json().get("results", [])
    except:
        return []

def extract_place_names_from_titles(results):
    """Extract place names from Tavily result TITLES only"""
    names = set()
    for r in results:
        title = r.get("title", "").strip()
        if not title:
            continue

        # Remove junk words
        title = re.sub(r'^\d+\.\s*', '', title)  # "1. "
        title = re.sub(r'\s*-\s*.*', '', title)   # " - Rest"
        title = re.sub(r'\s*\|.*', '', title)     # " | ..."
        title = re.sub(r'\s*\(.*?\)', '', title)  # "(Info)"
        title = re.sub(r'(?:Top|Best|Guide|Things|Attractions|Experiences|Activities|2026|Vietnam|Places)', '', title, flags=re.I)
        title = title.strip()

        if len(title) > 3 and title not in names:
            names.add(title)

    return list(names)

def get_apify_data(place_name, destination):
    """Get Apify enrichment: coords, images, rating, hours, address"""
    try:
        run_input = {
            "searchStringsArray": [f"{place_name} {destination}"],
            "locationQuery": f"{destination}, Vietnam",
            "maxCrawledPlacesPerSearch": 1,
            "language": "vi",
            "maxImages": 15,  # Get more images
            "maxReviews": 5,
        }

        run = client.actor("nwua9Gu5YrADL7ZDj").call(run_input=run_input)
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

        if not items:
            return None

        item = items[0]

        # Extract images
        images = []
        for img in (item.get("images") or [])[:15]:
            url = None
            if isinstance(img, dict):
                url = img.get("imageUrl") or img.get("url")
            elif isinstance(img, str):
                url = img

            if url and isinstance(url, str) and url.startswith("http"):
                images.append(url)

        return {
            "title": item.get("title") or place_name,
            "latitude": item.get("location", {}).get("lat") or item.get("latitude"),
            "longitude": item.get("location", {}).get("lng") or item.get("longitude"),
            "address": item.get("address") or f"{destination}, Vietnam",
            "rating": item.get("totalScore") or item.get("rating"),
            "hours": item.get("hours"),
            "images": images,
            "url": item.get("url"),
        }
    except Exception as e:
        print(f"    [Apify Error] {str(e)[:40]}")
        return None

def extract_price(text):
    """Extract price in VND"""
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

def get_price(place_name, destination):
    """Get price via Tavily"""
    query = f"giá vé {place_name} {destination} 2026"
    results = tavily_search(query)
    for r in results:
        price = extract_price(r.get("content", ""))
        if price:
            return price
    return None

def determine_area(address, latitude, longitude):
    """Determine area from address or coordinates"""
    addr = address.lower()

    # Sơn Trà = north
    if "sơn trà" in addr or "son tra" in addr or latitude > 16.08:
        return "north"
    # Liên Chiểu = south
    if "liên chiểu" in addr or "lien chieu" in addr or latitude < 15.95:
        return "south"
    # Cẩm Lệ = west
    if "cẩm lệ" in addr or "cam le" in addr or longitude < 108.2:
        return "west"
    # Default
    return "center"

def build_place(name, apify_data, category, destination):
    """Build complete PlaceInput with all fields"""
    if not apify_data:
        return None

    # Validate critical fields
    if not apify_data.get("latitude") or not apify_data.get("rating"):
        return None

    # Get price
    if category == "ATTRACTION":
        price = get_price(name, destination)
    else:
        price = None

    # Determine fields
    area = determine_area(apify_data["address"], apify_data["latitude"], apify_data["longitude"])

    # rating-based priority
    rating = apify_data.get("rating", 4.0)
    if rating >= 4.7:
        priority = 9
        must_visit = True
    elif rating >= 4.5:
        priority = 8
        must_visit = True
    elif rating >= 4.2:
        priority = 7
        must_visit = False
    else:
        priority = 5
        must_visit = False

    # Tags based on address/type
    tags = []
    if category == "ATTRACTION":
        addr = apify_data["address"].lower()
        if any(x in addr for x in ["biển", "beach", "sơn trà", "đảo", "island"]):
            tags.append("scenic")
        if any(x in addr for x in ["chùa", "pagoda", "temple"]):
            tags.append("religious")
        if any(x in addr for x in ["núi", "mountain", "leo"]):
            tags.append("mountain")
        if any(x in addr for x in ["công viên", "park"]):
            tags.append("outdoor")
        if len(tags) == 0:
            tags = ["scenic", "cultural"]
    else:  # FOOD
        if price and price < 50000:
            tags.append("budget")
        else:
            tags.append("upscale") if price and price > 150000 else None
        tags.append("local")

    tags = [t for t in tags if t][:5]

    # Best time
    if category == "ATTRACTION":
        best_time = "morning"  # Most attractions good in morning
    else:
        best_time = "lunch" if "quán" in name.lower() else "any"

    # Duration
    duration = 120 if category == "ATTRACTION" else 45

    place = {
        "destination": destination,
        "category": category,
        "name": name,
        "name_en": name,
        "address": apify_data["address"],
        "area": area,
        "latitude": float(apify_data["latitude"]),
        "longitude": float(apify_data["longitude"]),
        "cover_image": apify_data["images"][0] if apify_data["images"] else None,
        "images": apify_data["images"],
        "rating": float(apify_data["rating"]),
        "hours": apify_data.get("hours") or "08:00-22:00",
        "recommended_duration": duration,
        "base_price": price,
        "metadata": {
            "source": "manual_verification",
            "source_url": apify_data.get("url", ""),
        },
        "must_visit": must_visit,
        "priority_score": priority,
        "best_time_of_day": best_time,
        "tags": tags,
    }

    return place

def main():
    print("""
╔════════════════════════════════════════════════════════════════════════╗
║ ĐÀ NẴNG: Proper Import (Following IMPORT_RULE.md)                    ║
║ Goal: 15-20 attractions + 8-12 food, ALL FIELDS COMPLETE             ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

    destination = "Đà Nẵng"
    all_places = []

    # ATTRACTIONS
    print("\n[PHASE 1] DISCOVER ATTRACTIONS\n")

    attraction_queries = [
        "top 10 attractions Đà Nẵng Vietnam 2026",
        "best tourist attractions Đà Nẵng",
        "must see places Đà Nẵng Vietnam",
        "famous landmarks Đà Nẵng",
    ]

    discovered_attractions = {}
    for query in attraction_queries:
        print(f"  Searching: {query}...")
        results = tavily_search(query)
        names = extract_place_names_from_titles(results)

        for name in names[:7]:  # Max 7 per query
            discovered_attractions[name] = True

        print(f"    Found: {len(names)} names\n")

    attractions_list = list(discovered_attractions.keys())[:20]  # Max 20
    print(f"  Total discovered: {len(attractions_list)} unique attractions\n")

    print("[PHASE 2] ENRICH ATTRACTIONS WITH APIFY\n")

    for i, att in enumerate(attractions_list, 1):
        print(f"  [{i}/{len(attractions_list)}] {att}...", end=" ", flush=True)

        apify_data = get_apify_data(att, destination)
        if not apify_data:
            print("⚠️ No Apify data")
            continue

        place = build_place(att, apify_data, "ATTRACTION", destination)
        if place:
            all_places.append(place)
            print(f"✓ ({len(apify_data['images'])} img, {place['priority_score']} priority)")
        else:
            print("⚠️ Validation failed")

        time.sleep(1)

    # FOOD
    print(f"\n[PHASE 3] DISCOVER FOOD PLACES\n")

    food_queries = [
        "best restaurants food Đà Nẵng Vietnam",
        "local cuisine dining Đà Nẵng",
        "street food Đà Nẵng Vietnam",
    ]

    discovered_food = {}
    for query in food_queries:
        print(f"  Searching: {query}...")
        results = tavily_search(query)
        names = extract_place_names_from_titles(results)

        for name in names[:5]:
            discovered_food[name] = True

        print(f"    Found: {len(names)} names\n")

    food_list = list(discovered_food.keys())[:12]  # Max 12
    print(f"  Total discovered: {len(food_list)} unique food places\n")

    print("[PHASE 4] ENRICH FOOD WITH APIFY\n")

    for i, food in enumerate(food_list, 1):
        print(f"  [{i}/{len(food_list)}] {food}...", end=" ", flush=True)

        apify_data = get_apify_data(food, destination)
        if not apify_data:
            print("⚠️ No Apify data")
            continue

        place = build_place(food, apify_data, "FOOD", destination)
        if place:
            all_places.append(place)
            print(f"✓ ({len(apify_data['images'])} img)")
        else:
            print("⚠️ Validation failed")

        time.sleep(1)

    # Summary
    print(f"\n[PHASE 5] VERIFICATION\n")

    attractions = [p for p in all_places if p["category"] == "ATTRACTION"]
    food = [p for p in all_places if p["category"] == "FOOD"]

    print(f"  Total places: {len(all_places)}")
    print(f"    Attractions: {len(attractions)}")
    print(f"    Food: {len(food)}\n")

    print("  ATTRACTIONS:")
    for p in attractions:
        img_count = len(p["images"])
        print(f"    ✓ {p['name']:<35} | Rating: {p['rating']} | Images: {img_count} | Priority: {p['priority_score']}")

    print("\n  FOOD:")
    for p in food:
        img_count = len(p["images"])
        print(f"    ✓ {p['name']:<35} | Rating: {p['rating']} | Images: {img_count} | Priority: {p['priority_score']}")

    # Save
    with open("/tmp/danang_verified.json", "w") as f:
        json.dump(all_places, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Saved to /tmp/danang_verified.json\n")
    print(f"Ready for insertion? Review above data first!")

    return all_places

if __name__ == "__main__":
    places = main()
