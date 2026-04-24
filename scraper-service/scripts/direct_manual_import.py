#!/usr/bin/env python3
"""
Direct manual import: Tavily + Apify + SerpAPI
- Call each API directly
- Extract data manually with detailed logging
- Post to backend immediately
- Verify quality for each place
"""

import os
import re
import json
import time
import requests
import unicodedata
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")

TAVILY_URL = "https://api.tavily.com/search"
APIFY_ACTOR_ID = "nwua9Gu5YrADL7ZDj"
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"

try:
    from apify_client import ApifyClient
    APIFY_OK = True
except:
    APIFY_OK = False

print(f"""
╔══════════════════════════════════════════════════════════════════════╗
║  DIRECT MANUAL IMPORT: Tavily + Apify + SerpAPI                     ║
║  Extract dữ liệu chính xác → Import vào DB                          ║
╚══════════════════════════════════════════════════════════════════════╝
""")

print(f"✓ Tavily API: {'OK' if TAVILY_API_KEY else '❌ MISSING'}")
print(f"✓ Apify Token: {'OK' if APIFY_TOKEN else '❌ MISSING'}")
print(f"✓ SerpAPI Key: {'OK' if SERPAPI_API_KEY else '❌ MISSING'}")
print(f"✓ Backend: {BACKEND_URL}")
print()

# ═══════════════════════════════════════════════════════════════════════

class DirectImporter:
    def __init__(self, destination: str, destination_en: str):
        self.destination = destination
        self.destination_en = destination_en
        self.places = []

    def log(self, level: str, msg: str):
        """Detailed logging"""
        symbols = {"INFO": "ℹ️", "OK": "✓", "WARN": "⚠️", "ERR": "❌"}
        print(f"  {symbols.get(level, '•')} {msg}")

    def normalize(self, text: str) -> str:
        """Normalize for matching"""
        text = unicodedata.normalize("NFD", text.lower().strip())
        text = "".join(c for c in text if unicodedata.category(c) != "Mn")
        return re.sub(r"\s+", " ", text)

    def tavily_search(self, query: str) -> list:
        """Call Tavily API"""
        try:
            payload = {
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": "advanced",
                "max_results": 5,
                "include_raw_content": True,
            }
            resp = requests.post(TAVILY_URL, json=payload, timeout=15)
            resp.raise_for_status()
            return resp.json().get("results", [])
        except Exception as e:
            self.log("ERR", f"Tavily error: {e}")
            return []

    def extract_places_from_tavily(self, results: list) -> list:
        """Extract place names and descriptions from Tavily results"""
        places = []
        for r in results:
            content = r.get("content", "")[:500]
            # Extract place names (heuristic)
            names = re.findall(r'\b([A-ZÀ-ỿ][a-zà-ỿ]{2,}(?:\s+[A-ZÀ-ỿ][a-zà-ỿ]+)*)\b', content)

            for name in names[:3]:
                if len(name) > 3 and name not in [p["name"] for p in places]:
                    places.append({
                        "name": name,
                        "description": content[:200],
                        "source_url": r.get("url", ""),
                    })

        return places[:5]  # Top 5 places

    def extract_price(self, text: str) -> Optional[int]:
        """Extract price in VND from text"""
        patterns = [
            (r'(\d+(?:\.\d+)*)\s*(?:đ|VND|₫|vnd)', 1),
            (r'(\d+)\s*(?:k|K)(?:đ|đ)?', 1000),
            (r'(\d+000)', 1),
        ]

        for pattern, multiplier in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                for m in matches:
                    clean = str(m).replace(".", "").replace(",", "")
                    if clean.isdigit():
                        price = int(clean) * multiplier
                        if 10000 <= price <= 100_000_000:
                            return price
        return None

    def tavily_get_price(self, place_name: str) -> Optional[int]:
        """Get specific price via Tavily"""
        query = f"giá vé {place_name} {self.destination} 2026"
        results = self.tavily_search(query)

        for r in results:
            content = r.get("content", "")
            price = self.extract_price(content)
            if price:
                self.log("OK", f"Price for '{place_name}': {price:,} VND")
                return price

        return None

    def apify_scrape(self, search_terms: list) -> dict:
        """Call Apify Google Maps Actor"""
        if not APIFY_OK:
            self.log("WARN", "Apify client not available")
            return {}

        self.log("INFO", f"Apify: searching {len(search_terms)} places...")

        try:
            client = ApifyClient(APIFY_TOKEN)
            run_input = {
                "searchStringsArray": search_terms,
                "locationQuery": f"{self.destination}, Vietnam",
                "maxCrawledPlacesPerSearch": 3,
                "language": "vi",
                "maxImages": 10,
                "maxReviews": 5,
                "skipClosedPlaces": False,
                "scrapeSocialMediaProfiles": {
                    "facebooks": False, "instagrams": False,
                    "youtubes": False, "tiktoks": False
                },
                "scrapeContacts": False,
                "scrapeReviewsPersonalData": False,
                "includeWebResults": False,
            }

            run = client.actor(APIFY_ACTOR_ID).call(run_input=run_input)
            items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

            self.log("OK", f"Apify returned {len(items)} items")

            lookup = {}
            for item in items:
                name = item.get("title") or item.get("name") or ""
                if name:
                    key = self.normalize(name)
                    if key not in lookup:
                        lookup[key] = item

            return lookup
        except Exception as e:
            self.log("ERR", f"Apify error: {e}")
            return {}

    def extract_from_apify(self, item: dict) -> dict:
        """Extract data from Apify item"""
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

        # Images
        images_raw = item.get("images") or []
        urls = []
        for img in images_raw[:10]:
            if isinstance(img, dict):
                url = img.get("imageUrl") or img.get("url")
            else:
                url = str(img) if isinstance(img, str) else None

            if url and isinstance(url, str) and url.startswith("http"):
                urls.append(url)

        if urls:
            result["images"] = urls
            result["cover_image"] = urls[0]

        # Hours
        hours_raw = item.get("openingHours")
        if hours_raw and isinstance(hours_raw, list):
            for line in hours_raw:
                if isinstance(line, str):
                    m = re.search(r'(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})', line)
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

    def build_place_input(self, name: str, category: str, price: Optional[int],
                         apify_data: dict) -> Optional[dict]:
        """Build PlaceInput for backend"""
        # Validate required fields
        if not apify_data.get("latitude") or not apify_data.get("longitude"):
            return None

        return {
            "destination": self.destination,
            "category": category,
            "name": name,
            "name_en": name,  # Try English name
            "address": apify_data.get("address") or f"{self.destination}, Vietnam",
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
                "source": "tavily+apify+manual",
                "is_free": category == "ATTRACTION" and price is None,
            },
            "source_url": apify_data.get("source_url"),
            "must_visit": False,
            "priority_score": 0,
            "best_time_of_day": "any",
            "tags": [],
        }

    def post_to_backend(self, places: list) -> bool:
        """POST places to backend"""
        if not places:
            return False

        payload = {
            "destination": self.destination,
            "places": places,
            "combos": [],
        }

        try:
            resp = requests.post(SEED_URL, json=payload, timeout=30)
            resp.raise_for_status()
            result = resp.json()

            created = result.get("places_created", 0)
            updated = result.get("places_updated", 0)
            self.log("OK", f"Posted: +{created} created, {updated} updated")
            return True
        except Exception as e:
            self.log("ERR", f"POST failed: {e}")
            return False

    def import_destination(self):
        """Full workflow for one destination"""
        print(f"\n{'='*70}")
        print(f"📍 {self.destination} ({self.destination_en})")
        print(f"{'='*70}")

        # Step 1: Tavily - Discover attractions
        print(f"\n[Step 1] Discovering attractions via Tavily...")
        query_att = f"top attractions things to do {self.destination} Vietnam 2026"
        results_att = self.tavily_search(query_att)
        attractions = self.extract_places_from_tavily(results_att)
        self.log("OK", f"Found {len(attractions)} attractions")
        for att in attractions:
            print(f"       • {att['name']}")

        # Step 2: Tavily - Discover food
        print(f"\n[Step 2] Discovering food via Tavily...")
        query_food = f"best restaurants food local cuisine {self.destination} Vietnam"
        results_food = self.tavily_search(query_food)
        food = self.extract_places_from_tavily(results_food)
        self.log("OK", f"Found {len(food)} food places")
        for f in food:
            print(f"       • {f['name']}")

        # Step 3: Apify - Get Google Maps data
        print(f"\n[Step 3] Enriching with Google Maps data via Apify...")
        search_terms = [f"{p['name']} {self.destination}" for p in attractions + food]
        apify_lookup = self.apify_scrape(search_terms)

        # Step 4: Build place inputs
        print(f"\n[Step 4] Building place data...")
        places_to_post = []

        # Process attractions
        for att in attractions:
            name = att["name"].strip()
            apify_key = self.normalize(name)
            apify_data = apify_lookup.get(apify_key, {})

            # Get price
            price = self.tavily_get_price(name)

            place = self.build_place_input(name, "ATTRACTION", price, apify_data)
            if place:
                places_to_post.append(place)
                status = "✓" if apify_data else "⚠️"
                img_count = len(apify_data.get("images", []))
                print(f"       {status} {name} | Images: {img_count} | Price: {price or 'free'}")
            else:
                print(f"       ❌ {name} - missing required data")

        # Process food
        for f in food:
            name = f["name"].strip()
            apify_key = self.normalize(name)
            apify_data = apify_lookup.get(apify_key, {})

            price = self.tavily_get_price(name)

            place = self.build_place_input(name, "FOOD", price, apify_data)
            if place:
                places_to_post.append(place)
                status = "✓" if apify_data else "⚠️"
                img_count = len(apify_data.get("images", []))
                print(f"       {status} {name} | Images: {img_count} | Price: {price or 'TBD'}")
            else:
                print(f"       ❌ {name} - missing required data")

        # Step 5: Post to backend
        print(f"\n[Step 5] Posting to backend...")
        if places_to_post:
            print(f"       Posting {len(places_to_post)} places...")
            if self.post_to_backend(places_to_post):
                print(f"\n✅ {self.destination}: {len(places_to_post)} places imported successfully!")
            else:
                print(f"\n❌ {self.destination}: POST failed")
        else:
            print(f"       ⚠️ No valid places to post")

        return len(places_to_post)

# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # Start with one destination to test
    importer = DirectImporter("Đà Nẵng", "Da Nang")
    importer.import_destination()

    print(f"\n{'='*70}")
    print("✅ Test complete! Check DB to verify data quality.")
    print(f"{'='*70}\n")
