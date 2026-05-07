"""
tools/search_flights.py — SerpAPI Google Flights.
"""
import json
import httpx
from langchain_core.tools import tool
from loguru import logger
from app import config


@tool
async def search_flights(
    origin: str,
    destination: str,
    date: str,
    passengers: int = 2,
) -> str:
    """Tìm vé máy bay real-time.
    origin/destination: mã sân bay ('HAN', 'SGN', 'DAD'). date: YYYY-MM-DD."""
    if not config.ENABLE_FLIGHT_SEARCH or not config.SERPAPI_KEY:
        return json.dumps({"success": False, "error": "Flight search disabled or no API key", "flights": []})

    try:
        async with httpx.AsyncClient(timeout=config.TOOL_TIMEOUT) as client:
            resp = await client.get("https://serpapi.com/search", params={
                "engine": "google_flights", "departure_id": origin,
                "arrival_id": destination, "outbound_date": date,
                "adults": passengers, "currency": "VND", "hl": "vi",
                "api_key": config.SERPAPI_KEY,
            })
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"[search_flights] Error: {e}")
        return json.dumps({"success": False, "error": str(e), "flights": []})

    best = data.get("best_flights", []) or data.get("other_flights", [])
    flights = [
        {
            "airline":   f.get("flights", [{}])[0].get("airline", ""),
            "price_vnd": f.get("price", 0),
            "duration":  f.get("total_duration", 0),
            "departure": f.get("flights", [{}])[0].get("departure_airport", {}).get("time", ""),
            "arrival":   f.get("flights", [{}])[-1].get("arrival_airport", {}).get("time", ""),
        }
        for f in best[:3]
    ]
    logger.info(f"[search_flights] {origin}→{destination} → {len(flights)} flights")
    return json.dumps({"success": True, "count": len(flights), "flights": flights}, ensure_ascii=False)
