"""
Enrichment service — Apify (primary) → SerpAPI (fallback).
Also does LLM micro-pass for tags + best_time_of_day from reviews.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger

from app.config.settings import SERPAPI_KEY, llm, console
from app.config.constants import SERPAPI_MAX_CALLS, SERPAPI_MAX_IMAGES
from app.models.place import PlaceInput
from app.prompts.extraction import TAGS_EXTRACT_PROMPT

_CACHE_FILE = Path("/tmp/tripcompass_enrich_cache.json")
_SERPAPI_DELAY = float(os.environ.get("SCRAPER_SERPAPI_DELAY", "2.0"))


def _load_cache() -> dict:
    if _CACHE_FILE.exists():
        try:
            return json.loads(_CACHE_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_cache(cache: dict) -> None:
    try:
        _CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2))
    except Exception:
        pass


# ── Apify enrichment ─────────────────────────────────────────────────────────

def _needs_enrichment(place: PlaceInput) -> bool:
    """Return True if the place is missing any data that Apify/SerpAPI can fill."""
    if not place.latitude or not place.longitude:
        return True
    if not place.images:
        return True
    if not place.cover_image:
        return True
    if not place.rating:
        return True
    if not place.best_time_of_day:
        return True
    return False


def _enrich_from_apify(places: list[PlaceInput], destination: str) -> tuple[list[PlaceInput], list[PlaceInput]]:
    """
    Per-place Apify enrichment — only for places that are missing data.
    Returns (enriched_places, still_needs_fallback).
    """
    from app.services.apify import scrape_places, match_place, extract_enrichment

    places_to_enrich = [p for p in places if _needs_enrichment(p)]
    already_complete = [p for p in places if not _needs_enrichment(p)]

    if not places_to_enrich:
        logger.info("All {} places already have complete data — skipping Apify", len(places))
        console.print(f"  [green]Apify: all places complete — skipped[/green]")
        return places, []

    lookup = scrape_places(places_to_enrich, destination)

    if not lookup:
        logger.warning("Apify returned no data for {} — fall back to SerpAPI", destination)
        return already_complete, places_to_enrich

    enriched: list[PlaceInput] = list(already_complete)
    needs_fallback: list[PlaceInput] = []

    for place in places_to_enrich:
        item = match_place(place.name, lookup)
        if item:
            logger.debug("Apify matched: '{}'", place.name)
            data = extract_enrichment(item)
            if data.get("latitude") and not place.latitude:
                place.latitude = data["latitude"]
            if data.get("longitude") and not place.longitude:
                place.longitude = data["longitude"]
            if data.get("rating") and not place.rating:
                place.rating = data["rating"]
            if data.get("images") and not place.images:
                place.images = data["images"]
            if data.get("cover_image") and not place.cover_image:
                place.cover_image = data["cover_image"]

            # LLM micro-pass for best_time_of_day from reviews (tags already filled at extraction)
            reviews_text = data.get("reviews_text", "")
            if reviews_text and not place.best_time_of_day:
                _llm_extract_tags(place, reviews_text, destination)

            enriched.append(place)
        else:
            logger.warning("Apify no match: '{}' (lookup size={})", place.name, len(lookup))
            needs_fallback.append(place)

    logger.info("Apify matched {}/{} places for {}", len(enriched) - len(already_complete), len(places_to_enrich), destination)
    return enriched, needs_fallback


def _llm_extract_tags(place: PlaceInput, reviews_text: str, destination: str) -> None:
    """LLM micro-pass: extract tags + best_time_of_day from reviews."""
    try:
        prompt = TAGS_EXTRACT_PROMPT.format(
            name=place.name,
            destination=destination,
            reviews=reviews_text,
        )
        resp = llm.invoke([
            SystemMessage(content="Return only valid JSON. No markdown, no explanation."),
            HumanMessage(content=prompt),
        ])
        import re
        text = re.sub(r"<think>.*?</think>", "", resp.content, flags=re.DOTALL).strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        data = json.loads(text.strip())
        if not place.tags and isinstance(data.get("tags"), list):
            place.tags = data["tags"][:5]
        if not place.best_time_of_day and data.get("best_time_of_day") in {"morning", "afternoon", "evening", "any"}:
            place.best_time_of_day = data["best_time_of_day"]
    except Exception as e:
        logger.debug("Tags LLM extraction failed for {}: {}", place.name, e)


# ── SerpAPI fallback ──────────────────────────────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=3, max=15),
       retry=retry_if_exception_type(Exception), reraise=False)
def _serpapi_maps(name: str, destination: str) -> dict | None:
    try:
        from serpapi import GoogleSearch
        params = {
            "engine": "google_maps",
            "q": f"{name} {destination} Vietnam",
            "hl": "vi",
            "api_key": SERPAPI_KEY,
        }
        results = GoogleSearch(params).get_dict()
        local = results.get("local_results", [])
        top = local[0] if local else results.get("place_results")
        if not top:
            return None
        coords = top.get("gps_coordinates") or {}
        return {
            "latitude": coords.get("latitude"),
            "longitude": coords.get("longitude"),
            "rating": top.get("rating"),
            "cover_image": top.get("thumbnail"),
        }
    except Exception as e:
        logger.warning("SerpAPI maps error for '{}': {}", name, e)
        raise


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=3, max=15),
       retry=retry_if_exception_type(Exception), reraise=False)
def _serpapi_images(name: str, destination: str) -> list[str]:
    try:
        from serpapi import GoogleSearch
        params = {
            "engine": "google_images",
            "q": f"{name} {destination} Vietnam",
            "hl": "vi",
            "num": SERPAPI_MAX_IMAGES,
            "api_key": SERPAPI_KEY,
        }
        results = GoogleSearch(params).get_dict()
        images_results = results.get("images_results", [])
        return [img["original"] for img in images_results[:SERPAPI_MAX_IMAGES] if img.get("original")]
    except Exception as e:
        logger.warning("SerpAPI images error for '{}': {}", name, e)
        raise


def _enrich_from_serpapi(places: list[PlaceInput], destination: str) -> None:
    """In-place SerpAPI enrichment for places that Apify missed."""
    if not SERPAPI_KEY:
        logger.info("SerpAPI: no API key — skipping")
        console.print("[yellow]  SerpAPI: no API key — skipping[/yellow]")
        return

    cache = _load_cache()
    call_count = 0

    for place in places:
        if not _needs_enrichment(place):
            continue
        if call_count >= SERPAPI_MAX_CALLS:
            console.print(f"[yellow]  SerpAPI limit ({SERPAPI_MAX_CALLS}) reached[/yellow]")
            break

        cache_key = f"maps|{place.name}|{destination}"
        if cache_key in cache:
            data = cache[cache_key]
        else:
            console.print(f"  [dim]SerpAPI maps: {place.name}…[/dim]")
            data = _serpapi_maps(place.name, destination)
            cache[cache_key] = data
            _save_cache(cache)
            call_count += 1
            time.sleep(_SERPAPI_DELAY)

        if data:
            if data.get("latitude") and not place.latitude:
                place.latitude = data["latitude"]
            if data.get("longitude") and not place.longitude:
                place.longitude = data["longitude"]
            if data.get("rating") and not place.rating:
                place.rating = data["rating"]
            if data.get("cover_image") and not place.cover_image:
                place.cover_image = data["cover_image"]

        # Images fallback
        if not place.images:
            img_key = f"images|{place.name}|{destination}"
            if img_key in cache and cache[img_key]:  # only use cache if non-empty
                place.images = cache[img_key]
            else:
                imgs = _serpapi_images(place.name, destination) or []
                if imgs:  # only cache successful results — don't lock out retries on empty
                    cache[img_key] = imgs
                    _save_cache(cache)
                place.images = imgs
                if imgs:
                    place.cover_image = place.cover_image or imgs[0]
                time.sleep(_SERPAPI_DELAY)

    enriched = sum(1 for p in places if p.latitude or p.rating)
    logger.info("SerpAPI enriched {}/{} fallback places ({} calls)", enriched, len(places), call_count)
    console.print(f"  [green]SerpAPI: enriched {enriched}/{len(places)} ({call_count} calls)[/green]")


# ── Main entry point ──────────────────────────────────────────────────────────

def enrich_places(
    places: list[PlaceInput],
    destination: str,
    no_apify: bool = False,
    no_serpapi: bool = False,
) -> list[PlaceInput]:
    """
    Enrich lat/lng, images, rating for all places.
    Strategy: Apify batch → SerpAPI fallback for misses.
    """
    if not places:
        return places

    if no_apify:
        logger.info("--no-apify flag set — skipping Apify, using SerpAPI only")
        if not no_serpapi:
            _enrich_from_serpapi(places, destination)
        return places

    from app.config.settings import APIFY_TOKEN
    if not APIFY_TOKEN:
        logger.info("APIFY_TOKEN not set — falling back to SerpAPI")
        if not no_serpapi:
            _enrich_from_serpapi(places, destination)
        return places

    # Apify primary
    enriched_by_apify, needs_fallback = _enrich_from_apify(places, destination)

    # SerpAPI fallback for unmatched places
    if needs_fallback and not no_serpapi:
        console.print(f"[cyan]  SerpAPI fallback for {len(needs_fallback)} unmatched places…[/cyan]")
        _enrich_from_serpapi(needs_fallback, destination)

    total = len(enriched_by_apify) + len(needs_fallback)
    n_coords = sum(1 for p in places if p.latitude)
    n_images = sum(1 for p in places if p.images)
    console.print(
        f"  [green]Enrichment done: {n_coords}/{total} coords, {n_images}/{total} images[/green]"
    )
    return places
