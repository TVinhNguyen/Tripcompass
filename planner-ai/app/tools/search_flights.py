"""
tools/search_flights.py — SerpAPI Google Flights.
"""
import json
from datetime import date
from typing import Optional

import httpx
from langchain_core.tools import tool
from loguru import logger
from app import config
from app.services.http_retry import transient_retry
from app.services.http_safe import redact


def _validate_flight_dates(outbound: str, return_date: Optional[str]) -> Optional[str]:
    """Catch past-date hallucinations before they cost a SerpAPI call."""
    today = date.today()
    try:
        ob = date.fromisoformat(outbound)
    except (TypeError, ValueError):
        return f"Sai định dạng ngày đi, cần YYYY-MM-DD (nhận {outbound!r})."
    if ob < today:
        return f"Ngày đi {outbound} nằm trong quá khứ. Hôm nay là {today.isoformat()}."
    if return_date:
        try:
            rd = date.fromisoformat(return_date)
        except (TypeError, ValueError):
            return f"Sai định dạng ngày về, cần YYYY-MM-DD (nhận {return_date!r})."
        if rd < ob:
            return f"Ngày về {return_date} phải >= ngày đi {outbound}."
    return None


@tool
async def search_flights(
    origin: str,
    destination: str,
    date: str,
    return_date: Optional[str] = None,
    passengers: int = 2,
) -> str:
    """Tìm vé máy bay real-time.
    origin/destination: mã sân bay ('HAN', 'SGN', 'DAD').
    date: YYYY-MM-DD ngày đi.
    return_date: YYYY-MM-DD ngày về — chỉ truyền khi user muốn khứ hồi; bỏ trống = một chiều."""
    if not config.ENABLE_FLIGHT_SEARCH or not config.SERPAPI_KEY:
        return json.dumps({"success": False, "error": "Flight search disabled or no API key", "flights": []})

    err = _validate_flight_dates(date, return_date)
    if err:
        logger.warning(f"[search_flights] rejected: {err}")
        return json.dumps({"success": False, "error": err, "flights": []}, ensure_ascii=False)

    # SerpAPI google_flights yêu cầu type=1 + return_date (khứ hồi) HOẶC type=2 (một chiều).
    # Default type=1 sẽ reject 400 nếu thiếu return_date — bug cũ chính là ở đây.
    params = {
        "engine": "google_flights", "departure_id": origin,
        "arrival_id": destination, "outbound_date": date,
        "adults": passengers, "currency": "VND", "hl": "vi",
        "api_key": config.SERPAPI_KEY,
    }
    if return_date:
        params["type"] = "1"
        params["return_date"] = return_date
    else:
        params["type"] = "2"

    @transient_retry
    async def _fetch() -> dict:
        async with httpx.AsyncClient(timeout=config.TOOL_TIMEOUT) as client:
            resp = await client.get("https://serpapi.com/search", params=params)
            resp.raise_for_status()
            return resp.json()

    try:
        data = await _fetch()
    except httpx.HTTPStatusError as e:
        # Don't echo URL — it carries the SerpAPI key.
        logger.error(f"[search_flights] upstream {e.response.status_code}")
        return json.dumps({"success": False, "error": f"upstream returned {e.response.status_code}", "flights": []})
    except Exception as e:
        logger.error(f"[search_flights] Error: {redact(str(e))}")
        return json.dumps({"success": False, "error": "upstream call failed", "flights": []})

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
