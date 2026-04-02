"""
scripts/seed_knowledge_base.py

Seed the TripCompass knowledge base with attractions and food venues
for all 34 Vietnamese destinations using Tavily search + LLM extraction.

Usage (from ai-service directory):
    python scripts/seed_knowledge_base.py
    python scripts/seed_knowledge_base.py --dest "Nha Trang"   # single destination
    python scripts/seed_knowledge_base.py --skip-existing       # skip if DB already has data
    python scripts/seed_knowledge_base.py --dry-run             # print extracted data, don't POST
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx

# ── Bootstrap: ensure ai-service root is on sys.path ──────────────────────────
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config.settings import llm, console
from app.config.constants import DESTINATION_LIST, MIN_BUDGET_VND, MAX_ATTRACTION_VND, MAX_MEAL_VND
from langchain_tavily import TavilySearch

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
LOOKUP_URL = f"{BACKEND_URL}/api/v1/knowledge-base/lookup"

# Search tool — 5 results per query for better coverage
tavily = TavilySearch(max_results=5, name="seed_search")

DELAY_BETWEEN_DESTINATIONS = 3   # seconds — avoid Tavily rate limits
MIN_ATTRACTIONS = int(os.environ.get("DB_MIN_ATTRACTIONS", "5"))
MIN_FOOD = int(os.environ.get("DB_MIN_FOOD", "8"))


# ── Prompts ────────────────────────────────────────────────────────────────────

ATTRACTION_EXTRACT_PROMPT = """
You are a travel data extractor. Given the search results below about tourist attractions in {destination}, Vietnam,
extract a JSON array of attraction objects.

Rules:
- Extract ONLY real, named tourist attractions (temples, beaches, museums, nature spots, etc.)
- Each object MUST have: name (Vietnamese or English), address, description
- Include price_vnd (integer, entry fee in VND). Set is_free=true and price_vnd=0 if free entry.
- price_vnd must be between 0 and 1,000,000. Set to 0 if unknown.
- hours: opening hours string (e.g. "7:00 - 17:00") or null
- full_day: true only if the place requires a full day (island trips, theme parks, remote waterfalls)
- source_url: the URL from the search result where this info was found, or null
- area: rough area within the city (e.g. "center", "north", "island", "outskirts") or null

Output ONLY valid JSON array, no markdown, no explanation:
[
  {{
    "name": "...",
    "name_en": "...",
    "address": "...",
    "area": null,
    "price_vnd": 0,
    "is_free": true,
    "hours": null,
    "full_day": false,
    "description": "...",
    "source_url": null
  }}
]

Search results for attractions in {destination}:
{search_results}
"""

FOOD_EXTRACT_PROMPT = """
You are a travel data extractor. Given the search results below about restaurants and food in {destination}, Vietnam,
extract a JSON array of food venue objects.

Rules:
- Extract ONLY real, named restaurants, street food stalls, or food markets
- Each object MUST have: name, address, specialty (local dish or cuisine type)
- price_min and price_max: price per person in VND (integers). Max 200,000 VND per person.
  Set to null if completely unknown.
- meal_types: array from ["breakfast", "lunch", "dinner"] — which meals are served
- hours: opening hours string or null
- rating: float 1.0-5.0 or null
- source_url: URL from search result or null
- area: rough area within the city or null

Output ONLY valid JSON array, no markdown, no explanation:
[
  {{
    "name": "...",
    "address": "...",
    "area": null,
    "specialty": "...",
    "price_min": null,
    "price_max": null,
    "meal_types": ["lunch", "dinner"],
    "hours": null,
    "rating": null,
    "source_url": null
  }}
]

Search results for food in {destination}:
{search_results}
"""


COMBO_EXTRACT_PROMPT = """
You are a travel data extractor. Given the search results below about tour packages and combos in {destination}, Vietnam,
extract a JSON array of combo/package objects.

Rules:
- Extract ONLY real, named tour packages or combo deals (e.g. "3 Island Tour", "City + Beach Day")
- Each object MUST have: name, price_per_person (integer VND), includes (array of attraction names)
- provider: tour operator name (e.g. "Klook", "Viator", "local_tour") or null
- benefits: array of extra benefits (e.g. ["transport included", "guide included", "lunch included"])
- duration_days: integer, how many days the combo covers (usually 1)
- requires_overnight: true only if hotel is included
- price_per_person must be between 100,000 and 5,000,000 VND. Skip if unknown.

Output ONLY valid JSON array, no markdown, no explanation:
[
  {{
    "name": "...",
    "provider": null,
    "price_per_person": 500000,
    "includes": ["Attraction A", "Attraction B"],
    "benefits": ["transport included"],
    "duration_days": 1,
    "requires_overnight": false
  }}
]

Search results for tour combos in {destination}:
{search_results}
"""


# ── Search helpers ─────────────────────────────────────────────────────────────

def _search(query: str) -> str:
    """Run Tavily search and return concatenated text results."""
    try:
        results = tavily.invoke({"query": query})
        if isinstance(results, list):
            parts = []
            for r in results:
                if isinstance(r, dict):
                    parts.append(f"URL: {r.get('url', '')}\n{r.get('content', '')}")
                else:
                    parts.append(str(r))
            return "\n\n---\n\n".join(parts)
        return str(results)
    except Exception as e:
        console.print(f"[yellow]  Search error: {e}[/yellow]")
        return ""


def _search_attractions(destination: str) -> str:
    queries = [
        f"địa điểm du lịch nổi tiếng {destination} Việt Nam 2026 giá vé tham quan",
        f"top tourist attractions {destination} Vietnam 2026 admission price hours",
    ]
    combined = []
    for q in queries:
        result = _search(q)
        if result:
            combined.append(result)
        time.sleep(1)
    return "\n\n===\n\n".join(combined)


def _search_food(destination: str) -> str:
    queries = [
        f"quán ăn ngon {destination} 2026 đặc sản địa phương giá cả",
        f"best restaurants local food {destination} Vietnam 2026 price menu",
    ]
    combined = []
    for q in queries:
        result = _search(q)
        if result:
            combined.append(result)
        time.sleep(1)
    return "\n\n===\n\n".join(combined)


def _search_combos(destination: str) -> str:
    queries = [
        f"combo tour du lịch {destination} 2026 giá trọn gói tiết kiệm",
        f"tour package combo {destination} Vietnam 2026 price includes",
    ]
    combined = []
    for q in queries:
        result = _search(q)
        if result:
            combined.append(result)
        time.sleep(1)
    return "\n\n===\n\n".join(combined)


# ── LLM extraction ─────────────────────────────────────────────────────────────

def _extract_json(text: str) -> list[dict]:
    """Extract JSON array from LLM response, tolerating markdown fences."""
    text = text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    # Find first [ and last ]
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []


def _extract_attractions(destination: str, search_results: str) -> list[dict]:
    prompt = ATTRACTION_EXTRACT_PROMPT.format(
        destination=destination,
        search_results=search_results[:8000],  # token limit
    )
    response = llm.invoke(prompt)
    items = _extract_json(response.content)
    # Validate and sanitize
    valid = []
    seen_names: set[str] = set()
    for item in items:
        name = str(item.get("name", "")).strip()
        if not name or name.lower() in seen_names:
            continue
        seen_names.add(name.lower())
        price = int(item.get("price_vnd", 0) or 0)
        price = max(0, min(price, MAX_ATTRACTION_VND))
        valid.append({
            "name": name,
            "name_en": item.get("name_en") or None,
            "address": item.get("address") or None,
            "area": item.get("area") or None,
            "price_vnd": price,
            "is_free": bool(item.get("is_free", price == 0)),
            "hours": item.get("hours") or None,
            "full_day": bool(item.get("full_day", False)),
            "description": (item.get("description") or "")[:300] or None,
            "source_url": item.get("source_url") or None,
        })
    return valid


def _extract_food_venues(destination: str, search_results: str) -> list[dict]:
    prompt = FOOD_EXTRACT_PROMPT.format(
        destination=destination,
        search_results=search_results[:8000],
    )
    response = llm.invoke(prompt)
    items = _extract_json(response.content)
    valid = []
    seen_names: set[str] = set()
    for item in items:
        name = str(item.get("name", "")).strip()
        if not name or name.lower() in seen_names:
            continue
        seen_names.add(name.lower())
        p_min = item.get("price_min")
        p_max = item.get("price_max")
        if p_min is not None:
            p_min = max(0, min(int(p_min), MAX_MEAL_VND))
        if p_max is not None:
            p_max = max(0, min(int(p_max), MAX_MEAL_VND))
        meal_types = item.get("meal_types") or []
        if isinstance(meal_types, str):
            meal_types = [meal_types]
        meal_types = [m for m in meal_types if m in ("breakfast", "lunch", "dinner")]
        if not meal_types:
            meal_types = ["lunch", "dinner"]
        rating = item.get("rating")
        if rating is not None:
            try:
                rating = float(rating)
                rating = max(1.0, min(5.0, rating))
            except (ValueError, TypeError):
                rating = None
        valid.append({
            "name": name,
            "address": item.get("address") or None,
            "area": item.get("area") or None,
            "specialty": item.get("specialty") or None,
            "price_min": p_min,
            "price_max": p_max,
            "meal_types": meal_types,
            "hours": item.get("hours") or None,
            "rating": rating,
            "source_url": item.get("source_url") or None,
        })
    return valid


def _extract_combos(destination: str, search_results: str) -> list[dict]:
    prompt = COMBO_EXTRACT_PROMPT.format(
        destination=destination,
        search_results=search_results[:8000],
    )
    response = llm.invoke(prompt)
    items = _extract_json(response.content)
    valid = []
    seen_names: set[str] = set()
    for item in items:
        name = str(item.get("name", "")).strip()
        if not name or name.lower() in seen_names:
            continue
        seen_names.add(name.lower())
        price = item.get("price_per_person")
        if not price:
            continue
        try:
            price = int(price)
        except (ValueError, TypeError):
            continue
        if price < 100_000 or price > 5_000_000:
            continue
        includes = item.get("includes") or []
        if isinstance(includes, str):
            includes = [includes]
        benefits = item.get("benefits") or []
        if isinstance(benefits, str):
            benefits = [benefits]
        duration = item.get("duration_days")
        try:
            duration = int(duration) if duration else 1
        except (ValueError, TypeError):
            duration = 1
        valid.append({
            "name": name,
            "provider": item.get("provider") or None,
            "price_per_person": price,
            "includes": includes,
            "benefits": benefits,
            "duration_days": duration,
            "requires_overnight": bool(item.get("requires_overnight", False)),
            "book_url": item.get("book_url") or None,
        })
    return valid


# ── DB check ───────────────────────────────────────────────────────────────────

def _db_has_enough(destination: str) -> bool:
    """Return True if DB already has sufficient data for this destination."""
    try:
        resp = httpx.get(LOOKUP_URL, params={"destination": destination, "stale_days": "9999"}, timeout=5.0)
        if resp.status_code != 200:
            return False
        data = resp.json()
        n_attr = len(data.get("attractions") or [])
        n_food = len(data.get("food_venues") or [])
        return n_attr >= MIN_ATTRACTIONS and n_food >= MIN_FOOD
    except Exception:
        return False


# ── Core seed logic ────────────────────────────────────────────────────────────

def research_destination(destination: str) -> dict[str, Any]:
    """Search + extract attractions, food venues, and combos for one destination."""
    console.print(f"\n[cyan]  Searching attractions for {destination}…[/cyan]")
    attr_text = _search_attractions(destination)

    console.print(f"[cyan]  Searching food venues for {destination}…[/cyan]")
    food_text = _search_food(destination)

    console.print(f"[cyan]  Searching combos/tour packages for {destination}…[/cyan]")
    combo_text = _search_combos(destination)

    console.print(f"[cyan]  Extracting with LLM…[/cyan]")
    attractions = _extract_attractions(destination, attr_text)
    food_venues = _extract_food_venues(destination, food_text)
    combos = _extract_combos(destination, combo_text)

    console.print(
        f"[green]  Extracted: {len(attractions)} attractions, "
        f"{len(food_venues)} food venues, {len(combos)} combos[/green]"
    )
    return {"attractions": attractions, "food_venues": food_venues, "combos": combos}


def seed_destination(destination: str, dry_run: bool = False) -> bool:
    """Research and seed one destination. Returns True on success."""
    data = research_destination(destination)

    n_attr = len(data["attractions"])
    n_food = len(data["food_venues"])

    if n_attr < 3:
        console.print(f"[red]  {destination}: only {n_attr} attractions — skipping (too few)[/red]")
        return False

    if dry_run:
        console.print(f"[yellow]  DRY RUN — would POST {n_attr} attractions, {n_food} food venues[/yellow]")
        console.print(json.dumps(data, ensure_ascii=False, indent=2)[:2000])
        return True

    payload = {"destination": destination, **data}
    try:
        resp = httpx.post(SEED_URL, json=payload, timeout=30.0)
        resp.raise_for_status()
        result = resp.json()
        console.print(
            f"[green]  {destination}: +{result.get('attractions_created',0)} attractions "
            f"(updated {result.get('attractions_updated',0)}), "
            f"+{result.get('food_venues_created',0)} food venues "
            f"(updated {result.get('food_venues_updated',0)})[/green]"
        )
        return True
    except Exception as e:
        console.print(f"[red]  {destination}: POST failed — {e}[/red]")
        return False


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed TripCompass knowledge base")
    parser.add_argument("--dest", help="Seed only this destination", default=None)
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip destinations that already have enough data in DB")
    parser.add_argument("--dry-run", action="store_true",
                        help="Extract data but do not POST to backend")
    args = parser.parse_args()

    targets = [args.dest] if args.dest else DESTINATION_LIST

    console.print(f"\n[bold]Seeding {len(targets)} destination(s)…[/bold]")
    if args.dry_run:
        console.print("[yellow]DRY RUN mode — no data will be written[/yellow]")

    success = 0
    skipped = 0
    failed = 0

    for i, dest in enumerate(targets, 1):
        console.print(f"\n[bold cyan][{i}/{len(targets)}] {dest}[/bold cyan]")

        if args.skip_existing and not args.dry_run and _db_has_enough(dest):
            console.print(f"[dim]  Skipping — DB already has sufficient data.[/dim]")
            skipped += 1
            continue

        ok = seed_destination(dest, dry_run=args.dry_run)
        if ok:
            success += 1
        else:
            failed += 1

        if i < len(targets):
            time.sleep(DELAY_BETWEEN_DESTINATIONS)

    console.print(f"\n[bold]Done! {success} succeeded, {skipped} skipped, {failed} failed.[/bold]")


if __name__ == "__main__":
    main()
