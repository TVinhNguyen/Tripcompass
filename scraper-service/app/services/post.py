"""
POST places + combos to backend seed endpoint.
"""
from __future__ import annotations

import json
import os

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from loguru import logger

from app.config.settings import console
from app.config.constants import MAX_CHUNK_SIZE
from app.models.place import PlaceInput

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8080").rstrip("/")
SEED_URL = f"{BACKEND_URL}/api/v1/knowledge-base/seed"
LOOKUP_URL = f"{BACKEND_URL}/api/v1/knowledge-base/lookup"

MIN_PLACES = int(os.environ.get("DB_MIN_ATTRACTIONS", "5"))
MIN_FOOD = int(os.environ.get("DB_MIN_FOOD", "8"))


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=3, max=15),
       retry=retry_if_exception_type(Exception), reraise=False)
def _post_chunk(url: str, payload: dict) -> dict | None:
    resp = httpx.post(url, json=payload, timeout=30.0)
    resp.raise_for_status()
    return resp.json()


def db_has_enough(destination: str) -> bool:
    try:
        resp = httpx.get(LOOKUP_URL, params={"destination": destination, "stale_days": "9999"}, timeout=5.0)
        if resp.status_code != 200:
            return False
        data = resp.json()
        places = data.get("places") or []
        n_attr = sum(1 for p in places if p.get("category") == "ATTRACTION")
        n_food = sum(1 for p in places if p.get("category") == "FOOD")
        return n_attr >= MIN_PLACES and n_food >= MIN_FOOD
    except Exception as e:
        logger.warning("Cannot check DB for {}: {}", destination, e)
        return False


def post_to_backend(
    destination: str,
    places: list[PlaceInput],
    combos: list[dict],
    dry_run: bool = False,
) -> bool:
    if not places and not combos:
        console.print("[yellow]  Nothing to post.[/yellow]")
        return False

    n_attr = sum(1 for p in places if p.category == "ATTRACTION")
    n_food = sum(1 for p in places if p.category == "FOOD")
    console.print(f"  Payload: {n_attr} attractions, {n_food} food, {len(combos)} combos")

    if dry_run:
        payload = {
            "destination": destination,
            "places": [p.model_dump() for p in places],
            "combos": combos,
        }
        console.print("[yellow]  DRY RUN — payload preview:[/yellow]")
        console.print(json.dumps(payload, ensure_ascii=False, indent=2)[:3000])
        return True

    total = len(places)
    chunks = [places[i:i + MAX_CHUNK_SIZE] for i in range(0, total, MAX_CHUNK_SIZE)] if total > 0 else [[]]
    success = True

    for idx, chunk in enumerate(chunks):
        payload = {
            "destination": destination,
            "places": [p.model_dump() for p in chunk],
            "combos": combos if idx == 0 else [],
        }
        try:
            result = _post_chunk(SEED_URL, payload)
            if result:
                console.print(
                    f"[green]  ✓ {destination} (chunk {idx+1}): "
                    f"+{result.get('places_created', 0)} created, "
                    f"{result.get('places_updated', 0)} updated, "
                    f"+{result.get('combos_created', 0)} combos[/green]"
                )
        except Exception as e:
            logger.error("POST failed for {} chunk {}: {}", destination, idx + 1, e)
            console.print(f"[red]  ✗ POST failed (chunk {idx+1}): {e}[/red]")
            success = False

    return success
