"""
data_sources/hotels.py — SerpAPI Google Hotels.
"""
from datetime import datetime, timezone

import httpx
from loguru import logger

from app import config

PRICE_RANGES = {
    "survival": (0, 200_000),
    "budget": (150_000, 600_000),
    "standard": (400_000, 2_000_000),
    "premium": (1_500_000, 999_999_999),
}
USD_TO_VND = 25_000


async def search_hotels_data(
    destination: str,
    checkin: str,
    checkout: str,
    budget_tier: str = "standard",
    guests: int = 2,
) -> dict:
    """Return realtime hotel search results as a Python dict."""
    if not config.SERPAPI_KEY:
        return {"success": False, "error": "SERPAPI_KEY not set", "hotels": []}
    if not config.ENABLE_HOTEL_SEARCH:
        return {"success": False, "error": "Hotel search disabled", "hotels": []}

    lo, hi = PRICE_RANGES.get(budget_tier, PRICE_RANGES["standard"])
    from app.services.http_retry import transient_retry

    @transient_retry
    async def _fetch() -> dict:
        async with httpx.AsyncClient(timeout=config.TOOL_TIMEOUT) as client:
            resp = await client.get("https://serpapi.com/search", params={
                "engine": "google_hotels",
                "q": f"hotel {destination}",
                "check_in_date": checkin,
                "check_out_date": checkout,
                "adults": guests,
                "currency": "USD",
                "sort_by": "3" if budget_tier in ("survival", "budget") else "8",
                "api_key": config.SERPAPI_KEY,
            })
            resp.raise_for_status()
            return resp.json()

    try:
        data = await _fetch()
    except Exception as e:
        logger.error(f"[search_hotels] Error: {e}")
        return {"success": False, "error": str(e), "hotels": []}

    hotels = []
    for p in data.get("properties", []):
        price_usd = (
            p.get("total_rate", {}).get("lowest", 0)
            or p.get("rate_per_night", {}).get("lowest", 0)
            or 0
        )
        if isinstance(price_usd, str):
            price_usd = float("".join(c for c in price_usd if c.isdigit() or c == ".") or "0")
        price_vnd = int(price_usd * USD_TO_VND)
        if not (lo <= price_vnd <= hi):
            continue
        hotels.append({
            "name": p.get("name", ""),
            "price_per_night_vnd": price_vnd,
            "rating": p.get("overall_rating", 0),
            "review_count": p.get("reviews", 0),
            "address": p.get("description", ""),
            "amenities": p.get("amenities", [])[:5],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        })
        if len(hotels) >= 5:
            break

    logger.info(f"[search_hotels] dest={destination!r} → {len(hotels)} hotels")
    return {"success": True, "count": len(hotels), "hotels": hotels}
