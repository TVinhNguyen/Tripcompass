"""
tools/get_places.py — Query ATTRACTION places from DB.
"""
import unicodedata
from typing import Optional
from langchain_core.tools import tool
from loguru import logger
from app import config
from app.services.database import get_pool


def _ascii_fold(s: str) -> str:
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()


@tool
async def get_places(
    destination: str,
    area: Optional[str] = None,
    tags: Optional[list[str]] = None,
    must_visit_only: bool = False,
    limit: int = 30,
) -> str:
    """Lấy địa điểm tham quan (ATTRACTION) từ database.
    Trả về: tên, giá, giờ mở cửa, rating, tọa độ, tags, best_time_of_day.
    destination phải là tên lowercase tiếng Việt có dấu (ví dụ: 'đà nẵng')."""
    pool = await get_pool()
    dest_ascii = _ascii_fold(destination)

    conditions = [
        """(LOWER(destination) = LOWER($1)
            OR LOWER(destination) = $2
            OR LOWER(destination) ILIKE '%' || $2 || '%')""",
        "category = 'ATTRACTION'",
    ]
    params: list = [destination, dest_ascii]
    idx = 3

    if must_visit_only:
        conditions.append("must_visit = true")
    if area:
        conditions.append(f"LOWER(area) ILIKE '%' || LOWER(${idx}) || '%'")
        params.append(area); idx += 1
    if tags:
        conditions.append(f"tags && ${idx}::text[]")
        params.append(tags); idx += 1

    query = f"""
        SELECT id, name, name_en, destination, area, address,
               latitude, longitude, cover_image, rating, review_count,
               must_visit, priority_score, best_time_of_day, tags,
               open_time::text AS open_time, close_time::text AS close_time,
               hours, recommended_duration, description,
               base_price, price_updated_at
        FROM {config.DB_SCHEMA}.places
        WHERE {" AND ".join(conditions)}
        ORDER BY must_visit DESC, priority_score DESC, rating DESC NULLS LAST
        LIMIT ${idx}
    """
    params.append(limit)

    try:
        rows = await pool.fetch(query, *params)
    except Exception as e:
        logger.error(f"[get_places] DB error: {e}")
        return f'{{"success": false, "error": "{e}", "places": []}}'

    places = []
    for r in rows:
        # open_time/close_time are TEXT from SQL cast (e.g. "08:30:00")
        hours = r["hours"]
        if not hours:
            ot, ct = r["open_time"], r["close_time"]
            if ot and ct:
                hours = f"{ot[:5]}-{ct[:5]}"
        places.append({
            "id":              str(r["id"]),
            "name":            r["name"],
            "name_en":         r["name_en"] or "",
            "destination":     r["destination"],
            "area":            r["area"] or "",
            "address":         r["address"] or "",
            "latitude":        float(r["latitude"]) if r["latitude"] else None,
            "longitude":       float(r["longitude"]) if r["longitude"] else None,
            "image_url":       r["cover_image"] or "",
            "rating":          float(r["rating"]) if r["rating"] else 0.0,
            "review_count":    int(r["review_count"] or 0),
            "must_visit":      bool(r["must_visit"]),
            "priority_score":  int(r["priority_score"]),
            "best_time_of_day": r["best_time_of_day"] or "",
            "tags":            list(r["tags"] or []),
            "hours":           hours or "08:00-17:00",
            "duration_min":    int(r["recommended_duration"] or 90),
            "base_price":      int(r["base_price"] or 0),
            "description":     r["description"] or "",
            "is_stale":        r["price_updated_at"] is None or (r["base_price"] or 0) == 0,
        })

    import json
    logger.info(f"[get_places] dest={destination!r} → {len(places)} attractions")
    return json.dumps({"success": True, "count": len(places), "places": places}, ensure_ascii=False)
