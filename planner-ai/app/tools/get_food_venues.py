"""
tools/get_food_venues.py — Query FOOD venues from DB.
"""
import json
from typing import Optional
from langchain_core.tools import tool
from loguru import logger
from app import config
from app.services.database import get_pool
from app.services.text_utils import ascii_fold


@tool
async def get_food_venues(
    destination: str,
    area: Optional[str] = None,
    tags: Optional[list[str]] = None,
    limit: int = 20,
) -> str:
    """Lấy nhà hàng / quán ăn (FOOD) từ database.
    Trả về: tên, giá trung bình, giờ mở cửa, rating, khu vực.
    destination phải là tên lowercase tiếng Việt có dấu."""
    pool = await get_pool()
    dest_ascii = ascii_fold(destination)

    conditions = [
        """(LOWER(destination) = LOWER($1)
            OR LOWER(destination) = $2
            OR LOWER(destination) ILIKE '%' || $2 || '%')""",
        "category = 'FOOD'",
    ]
    params: list = [destination, dest_ascii]
    idx = 3

    if area:
        conditions.append(f"LOWER(area) ILIKE '%' || LOWER(${idx}) || '%'")
        params.append(area); idx += 1
    preference_rank = ""
    if tags:
        preference_rank = f"(CASE WHEN tags && ${idx}::text[] THEN 0 ELSE 1 END),"
        params.append(tags)
        idx += 1

    # Token-trimmed projection. See get_places.py for the rationale on which
    # fields are excluded vs. kept.
    query = f"""
        SELECT id, name, destination, area, address,
               latitude, longitude, rating,
               must_visit, priority_score, best_time_of_day, tags,
               open_time::text AS open_time, close_time::text AS close_time,
               hours, recommended_duration, base_price
        FROM {config.DB_SCHEMA}.places
        WHERE {" AND ".join(conditions)}
        ORDER BY {preference_rank} must_visit DESC, priority_score DESC, rating DESC NULLS LAST
        LIMIT ${idx}
    """
    params.append(limit)

    try:
        rows = await pool.fetch(query, *params)
    except Exception as e:
        logger.error(f"[get_food_venues] DB error: {e}")
        return json.dumps({"success": False, "error": str(e), "food": []})

    food = []
    for r in rows:
        # open_time/close_time are TEXT from SQL cast (e.g. "08:30:00")
        hours = r["hours"]
        if not hours:
            ot, ct = r["open_time"], r["close_time"]
            if ot and ct:
                hours = f"{ot[:5]}-{ct[:5]}"
        food.append({
            "id":              str(r["id"]),
            "name":            r["name"],
            "destination":     r["destination"],
            "area":            r["area"] or "",
            "address":         r["address"] or "",
            "latitude":        float(r["latitude"]) if r["latitude"] else None,
            "longitude":       float(r["longitude"]) if r["longitude"] else None,
            "rating":          float(r["rating"]) if r["rating"] else 0.0,
            "must_visit":      bool(r["must_visit"]),
            "priority_score":  int(r["priority_score"]),
            "best_time_of_day": r["best_time_of_day"] or "",
            "tags":            list(r["tags"] or []),
            "hours":           hours or "07:00-22:00",
            "duration_min":    int(r["recommended_duration"] or 60),
            "base_price":      int(r["base_price"] or 0),
        })

    logger.info(f"[get_food_venues] dest={destination!r} → {len(food)} venues")
    return json.dumps({"success": True, "count": len(food), "food": food}, ensure_ascii=False)
