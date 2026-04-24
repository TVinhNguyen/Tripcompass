"""
tools/search_hotels.py — SerpAPI Google Hotels.
"""
import json
import httpx
from datetime import datetime
from langchain_core.tools import tool
from loguru import logger
from app import config

PRICE_RANGES = {
    "survival": (0, 200_000),
    "budget":   (150_000, 600_000),
    "standard": (400_000, 2_000_000),
    "premium":  (1_500_000, 999_999_999),
}
USD_TO_VND = 25_000


@tool
async def search_hotels(
    destination: str,
    checkin: str,
    checkout: str,
    budget_tier: str = "standard",
    guests: int = 2,
) -> str:
    """Tìm khách sạn real-time qua Google Hotels.
    Trả về top 5 khách sạn phù hợp budget.
    destination: tên tiếng Anh ('Da Nang'). checkin/checkout: YYYY-MM-DD."""
    if not config.SERPAPI_KEY:
        return json.dumps({"success": False, "error": "SERPAPI_KEY not set", "hotels": []})
    if not config.ENABLE_HOTEL_SEARCH:
        return json.dumps({"success": False, "error": "Hotel search disabled", "hotels": []})

    lo, hi = PRICE_RANGES.get(budget_tier, PRICE_RANGES["standard"])
    try:
        async with httpx.AsyncClient(timeout=config.TOOL_TIMEOUT) as client:
            resp = await client.get("https://serpapi.com/search", params={
                "engine": "google_hotels", "q": f"hotel {destination}",
                "check_in_date": checkin, "check_out_date": checkout,
                "adults": guests, "currency": "USD",
                "sort_by": "3" if budget_tier in ("survival", "budget") else "8",
                "api_key": config.SERPAPI_KEY,
            })
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"[search_hotels] Error: {e}")
        return json.dumps({"success": False, "error": str(e), "hotels": []})

    hotels = []
    for p in data.get("properties", []):
        price_usd = p.get("total_rate", {}).get("lowest", 0) or p.get("rate_per_night", {}).get("lowest", 0) or 0
        if isinstance(price_usd, str):
            price_usd = float("".join(c for c in price_usd if c.isdigit() or c == ".") or "0")
        price_vnd = int(price_usd * USD_TO_VND)
        if not (lo <= price_vnd <= hi):
            continue
        hotels.append({
            "name": p.get("name", ""), "price_per_night_vnd": price_vnd,
            "rating": p.get("overall_rating", 0), "review_count": p.get("reviews", 0),
            "address": p.get("description", ""), "amenities": p.get("amenities", [])[:5],
            "fetched_at": datetime.utcnow().isoformat(),
        })
        if len(hotels) >= 5:
            break

    logger.info(f"[search_hotels] dest={destination!r} → {len(hotels)} hotels")
    return json.dumps({"success": True, "count": len(hotels), "hotels": hotels}, ensure_ascii=False)
