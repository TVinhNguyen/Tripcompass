"""
tools/get_combos.py — Query combo packages from DB.
"""
import json
import unicodedata
from langchain_core.tools import tool
from loguru import logger
from app import config
from app.services.database import get_pool


def _ascii_fold(s: str) -> str:
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()


@tool
async def get_combos(destination: str) -> str:
    """Lấy gói combo tour từ database.
    Trả về: tên, giá/người, bao gồm gì, số ngày.
    destination phải là tên lowercase tiếng Việt có dấu."""
    pool = await get_pool()
    dest_ascii = _ascii_fold(destination)

    try:
        rows = await pool.fetch(
            f"""SELECT id, name, destination, cover_image, provider,
                       price_per_person, includes, benefits,
                       duration_days, requires_overnight, book_url
                FROM {config.DB_SCHEMA}.combos
                WHERE LOWER(destination) = LOWER($1)
                   OR LOWER(destination) = $2
                   OR LOWER(destination) ILIKE '%' || $2 || '%'
                ORDER BY price_per_person ASC NULLS LAST
                LIMIT 10""",
            destination, dest_ascii,
        )
    except Exception as e:
        logger.error(f"[get_combos] DB error: {e}")
        return json.dumps({"success": False, "error": str(e), "combos": []})

    combos = [
        {
            "id":                str(r["id"]),
            "name":              r["name"],
            "destination":       r["destination"],
            "cover_image":       r["cover_image"] or "",
            "provider":          r["provider"] or "",
            "price_per_person":  int(r["price_per_person"] or 0),
            "includes":          list(r["includes"] or []),
            "benefits":          list(r["benefits"] or []),
            "duration_days":     int(r["duration_days"] or 1),
            "requires_overnight": bool(r["requires_overnight"]),
            "book_url":          r["book_url"] or "",
        }
        for r in rows
    ]

    logger.info(f"[get_combos] dest={destination!r} → {len(combos)} combos")
    return json.dumps({"success": True, "count": len(combos), "combos": combos}, ensure_ascii=False)
