#!/usr/bin/env python3
"""
Tavily-only Import: Fast & Direct
- Call Tavily API directly
- Extract all data from Tavily results
- Post to DB immediately
- Clean, fast, accurate
"""

import os
import re
import json
import time
import requests
import httpx
import unicodedata
from dotenv import load_dotenv

load_dotenv("/home/thahvinh/Desktop/Project_S/tripcompass/scraper-service/.env")

TAVILY_KEY = os.getenv("TAVILY_API_KEY")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"

TAVILY_URL = "https://api.tavily.com/search"

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

def extract_price(text: str):
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
    try:
        resp = requests.post(
            TAVILY_URL,
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
    except Exception as e:
        return []

def extract_places_from_tavily(results: list, destination: str, category: str) -> list:
    """Extract places from Tavily search results"""
    places = []
    seen = set()

    for r in results:
        content = r.get("content", "")
        title = r.get("title", "")
        url = r.get("url", "")

        # Extract place names
        names = re.findall(r'\b([A-ZÀ-ỿ][a-zà-ỿ]{2,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b', content[:500])

        for name in names:
            if len(name) > 3 and name not in seen:
                # Extract price if present
                price = extract_price(content)

                # Extract rating if present
                rating = 4.0
                rating_match = re.search(r'([0-5](?:\.\d)?)\s*(?:⭐|star)', content)
                if rating_match:
                    try:
                        rating = float(rating_match.group(1))
                    except:
                        pass

                place = {
                    "name": name,
                    "destination": destination,
                    "category": category,
                    "price": price,
                    "rating": rating,
                    "address": f"{destination}, Vietnam",
                    "hours": "08:00-22:00",
                    "description": content[:200],
                    "source_url": url,
                }

                places.append(place)
                seen.add(name)

                if len(places) >= 5:  # Limit to 5 per search
                    break

        if len(places) >= 5:
            break

    return places

def build_place_input(place: dict) -> dict:
    """Build PlaceInput for backend"""
    return {
        "destination": place["destination"],
        "category": place["category"],
        "name": place["name"],
        "name_en": place["name"],
        "address": place["address"],
        "area": "center",
        "latitude": 0.0,  # Will be set by backend
        "longitude": 0.0,  # Will be set by backend
        "cover_image": None,
        "images": [],
        "rating": place["rating"],
        "hours": place["hours"],
        "recommended_duration": 120 if place["category"] == "ATTRACTION" else 45,
        "base_price": place["price"],
        "metadata": {
            "source": "tavily",
            "description": place["description"],
            "is_free": place["category"] == "ATTRACTION" and place["price"] is None,
        },
        "source_url": place["source_url"],
        "must_visit": False,
        "priority_score": 5,
        "best_time_of_day": "any",
        "tags": [],
    }

def post_places(destination: str, places: list) -> int:
    """POST to backend"""
    if not places:
        return 0

    payload = {
        "destination": destination,
        "places": places,
        "combos": [],
    }

    try:
        resp = httpx.post(SEED_URL, json=payload, timeout=30)
        result = resp.json()
        return result.get("places_created", 0) + result.get("places_updated", 0)
    except Exception as e:
        print(f"        ❌ POST error: {e}")
        return 0

def main():
    print("""
╔════════════════════════════════════════════════════════════════════════╗
║  TAVILY DIRECT IMPORT: All 34 Destinations                            ║
║  Fast, accurate, no heavy APIs                                        ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

    total_places = 0
    total_posted = 0

    for i, (dest, dest_en) in enumerate(DESTINATIONS, 1):
        print(f"\n[{i:2d}/34] {dest:<20}", end="", flush=True)

        places_for_post = []

        # Attractions
        results_att = tavily_search(f"top attractions things to do {dest} Vietnam 2026")
        attractions = extract_places_from_tavily(results_att, dest, "ATTRACTION")

        for att in attractions:
            place_input = build_place_input(att)
            places_for_post.append(place_input)

        # Food
        results_food = tavily_search(f"best restaurants food local {dest} Vietnam")
        food = extract_places_from_tavily(results_food, dest, "FOOD")

        for f in food:
            place_input = build_place_input(f)
            places_for_post.append(place_input)

        # POST
        if places_for_post:
            created = post_places(dest, places_for_post)
            total_places += len(places_for_post)
            total_posted += created
            print(f" ✓ {len(places_for_post)} places → {created} saved")
        else:
            print(f" ⚠️ No places found")

        time.sleep(2)  # Rate limiting

    print(f"""
╔════════════════════════════════════════════════════════════════════════╗
║ ✅ IMPORT COMPLETE                                                     ║
║ Total places processed: {total_places:<40} ║
║ Total saved to DB: {total_posted:<45} ║
╚════════════════════════════════════════════════════════════════════════╝
    """)

if __name__ == "__main__":
    main()
