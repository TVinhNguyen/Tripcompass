"""
Apify Google Maps scraper — primary source for lat/lng, images, rating.
Actor ID: nwua9Gu5YrADL7ZDj (Google Maps Scraper)
"""
from __future__ import annotations

import unicodedata
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from loguru import logger

from app.config.settings import APIFY_TOKEN, console
from app.config.constants import (
    APIFY_ACTOR_ID,
    APIFY_MAX_PLACES_PER_SEARCH,
    APIFY_MAX_IMAGES,
    APIFY_MAX_REVIEWS,
)


def _normalize(text: str) -> str:
    """Normalize for fuzzy matching — strips diacritics for Vietnamese name comparison."""
    text = unicodedata.normalize("NFD", text.lower().strip())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text)


def _build_run_input(search_term: str, destination: str, limit: int) -> dict:
    return {
        "searchStringsArray": [search_term],
        "locationQuery": f"{destination}, Vietnam",
        "maxCrawledPlacesPerSearch": limit,
        "language": "vi",
        "maxImages": APIFY_MAX_IMAGES,
        "maxReviews": APIFY_MAX_REVIEWS,
        "reviewsSort": "newest",
        "skipClosedPlaces": True,
        "scrapeSocialMediaProfiles": {
            "facebooks": False,
            "instagrams": False,
            "youtubes": False,
            "tiktoks": False,
            "twitters": False,
        },
        "scrapeContacts": False,
        "scrapeReviewsPersonalData": False,
        "includeWebResults": False,
    }


def _scrape_batch(search_terms: list[str], limit_per_term: int) -> list[dict]:
    """Call Apify actor with multiple search terms in one run. Returns flat list of raw items."""
    try:
        from apify_client import ApifyClient
        client = ApifyClient(APIFY_TOKEN)
        run_input = {
            "searchStringsArray": search_terms,
            "maxCrawledPlacesPerSearch": limit_per_term,
            "language": "vi",
            "maxImages": APIFY_MAX_IMAGES,
            "maxReviews": APIFY_MAX_REVIEWS,
            "reviewsSort": "newest",
            "skipClosedPlaces": False,
            "scrapeSocialMediaProfiles": {
                "facebooks": False,
                "instagrams": False,
                "youtubes": False,
                "tiktoks": False,
                "twitters": False,
            },
            "scrapeContacts": False,
            "scrapeReviewsPersonalData": False,
            "includeWebResults": False,
        }
        logger.info("Apify: batch {} search terms (limit={} each)", len(search_terms), limit_per_term)
        run = client.actor(APIFY_ACTOR_ID).call(run_input=run_input)
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        logger.info("Apify: got {} items total", len(items))
        return items
    except Exception as e:
        logger.warning("Apify batch scrape failed: {}", e)
        return []


def scrape_places(places: list, destination: str) -> dict[str, dict]:
    """
    Per-place search: query Google Maps for each specific place name.
    Returns normalized_name → apify_item lookup dict.
    One actor run for all places → efficient credit usage.
    """
    if not APIFY_TOKEN or not places:
        return {}

    search_terms = [f"{p.name} {destination}" for p in places]
    console.print(f"[cyan]  Apify: querying {len(search_terms)} places in {destination}…[/cyan]")

    items = _scrape_batch(search_terms, limit_per_term=3)

    lookup: dict[str, dict] = {}
    for item in items:
        name = item.get("title") or item.get("name") or ""
        if name:
            key = _normalize(name)
            if key not in lookup:
                lookup[key] = item

    console.print(f"  [green]Apify: {len(lookup)} unique places found[/green]")
    return lookup


def match_place(place_name: str, lookup: dict[str, dict]) -> dict | None:
    """
    Fuzzy match place_name against Apify lookup.
    Exact → starts-with → substring → token-overlap match.
    Diacritics are stripped by _normalize() for Vietnamese name matching.
    """
    if not lookup:
        return None
    key = _normalize(place_name)

    # Exact
    if key in lookup:
        return lookup[key]

    # Starts-with
    for k, v in lookup.items():
        if k.startswith(key) or key.startswith(k):
            return v

    # Substring (key appears in any lookup key or vice-versa)
    for k, v in lookup.items():
        if key in k or k in key:
            return v

    # Token overlap — at least 2 words in common (or 1 if single-word name)
    key_tokens = set(key.split())
    min_overlap = 1 if len(key_tokens) <= 1 else 2
    best_score, best_val = 0, None
    for k, v in lookup.items():
        k_tokens = set(k.split())
        overlap = len(key_tokens & k_tokens)
        if overlap >= min_overlap and overlap > best_score:
            best_score = overlap
            best_val = v
    if best_val:
        return best_val

    return None


def extract_enrichment(item: dict) -> dict:
    """
    Extract lat, lng, images, rating, hours, reviews from Apify item.
    Returns partial dict — caller merges into PlaceInput.
    """
    result: dict = {}

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
    for img in images_raw[:APIFY_MAX_IMAGES]:
        if isinstance(img, dict):
            url = img.get("imageUrl") or img.get("url") or img.get("thumbnail") or ""
        else:
            url = str(img)
        if url and url.startswith("http"):
            urls.append(url)
    if urls:
        result["images"] = urls
        result["cover_image"] = urls[0]

    # Hours — overwrite only if Apify has cleaner format
    opening_hours = item.get("openingHours")
    if opening_hours and isinstance(opening_hours, list) and opening_hours:
        result["hours_raw"] = opening_hours  # stored for reference, not directly used

    # Reviews text — for LLM tag extraction
    reviews_raw = item.get("reviews") or []
    review_texts = []
    for r in reviews_raw[:APIFY_MAX_REVIEWS]:
        text = r.get("text") or r.get("textTranslated") or ""
        if text:
            review_texts.append(text[:200])
    if review_texts:
        result["reviews_text"] = "\n".join(review_texts)

    return result
