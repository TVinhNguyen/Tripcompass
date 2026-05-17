"""
data_sources/places.py — Query ATTRACTION places from DB.
"""
from typing import Optional

from loguru import logger

from app import config
from app.services.database import get_pool
from app.services.normalize import ascii_fold


async def fetch_places(
    destination: str,
    area: Optional[str] = None,
    tags: Optional[list[str]] = None,
    must_visit_only: bool = False,
    limit: int = 30,
) -> dict:
    """Return attraction places for a destination as a Python dict."""
    pool = await get_pool()
    dest_ascii = ascii_fold(destination)

    conditions = [
        """(LOWER(destination) = LOWER($1)
            OR LOWER(destination) = $2
            OR LOWER(destination) ILIKE '%' || $2 || '%')""",
        "category = 'ATTRACTION'",
        "parent_id IS NULL",
    ]
    params: list = [destination, dest_ascii]
    idx = 3

    if must_visit_only:
        conditions.append("must_visit = true")
    if area:
        conditions.append(f"LOWER(area) ILIKE '%' || LOWER(${idx}) || '%'")
        params.append(area)
        idx += 1
    preference_rank = ""
    if tags:
        preference_rank = f"(CASE WHEN tags && ${idx}::text[] THEN 0 ELSE 1 END),"
        params.append(tags)
        idx += 1

    # Token-trimmed projection. Fields excluded and why:
    #   description     — schedule/enrich/Q&A all ignore it (~1.5k tokens / call)
    #   name_en         — agent operates in Vietnamese, never reads name_en
    #   review_count    — only `rating` is used; count adds noise
    #   cover_image     — LLM can't render URLs; FE fetches images directly
    # Fields kept and why:
    #   priority_score  — agent prompt uses it to pick "hidden gem" suggestions
    #   address         — agent prompt surfaces it on Q&A answers
    #   price_updated_at — derives is_stale below, gates get_real_prices fallback
    query = f"""
        SELECT id, name, destination, area, address,
               latitude, longitude, rating,
               must_visit, priority_score, best_time_of_day, tags,
               open_time::text AS open_time, close_time::text AS close_time,
               hours, recommended_duration,
               base_price, price_updated_at, sub_attractions
        FROM {config.DB_SCHEMA}.places
        WHERE {" AND ".join(conditions)}
        ORDER BY {preference_rank} must_visit DESC, priority_score DESC, rating DESC NULLS LAST
        LIMIT ${idx}
    """
    params.append(limit)

    try:
        rows = await pool.fetch(query, *params)
    except Exception as e:
        logger.error(f"[get_places] DB error: {e}")
        return {"success": False, "error": str(e), "places": []}

    places = []
    for r in rows:
        hours = r["hours"]
        if not hours:
            ot, ct = r["open_time"], r["close_time"]
            if ot and ct:
                hours = f"{ot[:5]}-{ct[:5]}"
        places.append({
            "id": str(r["id"]),
            "name": r["name"],
            "destination": r["destination"],
            "area": r["area"] or "",
            "address": r["address"] or "",
            "latitude": float(r["latitude"]) if r["latitude"] else None,
            "longitude": float(r["longitude"]) if r["longitude"] else None,
            "rating": float(r["rating"]) if r["rating"] else 0.0,
            "must_visit": bool(r["must_visit"]),
            "priority_score": int(r["priority_score"]),
            "best_time_of_day": r["best_time_of_day"] or "",
            "tags": list(r["tags"] or []),
            "sub_attractions": list(r["sub_attractions"] or []),
            "hours": hours or "08:00-17:00",
            "duration_min": int(r["recommended_duration"] or 90),
            "base_price": int(r["base_price"] or 0),
            "is_stale": r["price_updated_at"] is None or (r["base_price"] or 0) == 0,
        })

    logger.info(f"[get_places] dest={destination!r} → {len(places)} attractions")
    return {"success": True, "count": len(places), "places": places}
