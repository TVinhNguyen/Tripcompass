"""
SerpAPI Google Hotels integration — real-time hotel price search.
"""

import re
from datetime import datetime

from app.config.settings import SERPAPI_KEY, console
from app.models.serpapi_models import SerpAPIHotelResult
from app.utils.price_utils import _parse_price


def search_hotels_serpapi(
    destination: str,
    check_in:    str,   # YYYY-MM-DD
    check_out:   str,   # YYYY-MM-DD
    adults:      int = 2,
    budget_vnd:  int = 10_000_000,
) -> list[SerpAPIHotelResult]:
    """
    Gọi SerpAPI Google Hotels engine.
    Trả về list khách sạn với giá thực tế.
    Fallback: trả về list rỗng nếu API key thiếu hoặc lỗi.
    """
    if not SERPAPI_KEY:
        console.print("[yellow]  SerpAPI Hotels: no API key — skip[/yellow]")
        return []

    try:
        from serpapi import GoogleSearch
        params = {
            "engine":       "google_hotels",
            "q":            f"hotels in {destination}",
            "check_in_date":  check_in,
            "check_out_date": check_out,
            "adults":         str(adults),
            "currency":       "USD",
            "gl":             "vn",
            "hl":             "vi",
            "api_key":        SERPAPI_KEY,
        }
        results = GoogleSearch(params).get_dict()
        hotels  = results.get("properties", [])

        parsed: list[SerpAPIHotelResult] = []
        for h in hotels[:8]:
            # Extract price — SerpAPI trả về nhiều format
            price_raw = (
                h.get("rate_per_night", {}).get("lowest", "") or
                h.get("price", "") or
                h.get("total_rate", {}).get("lowest", "") or
                ""
            )
            price_per_night = _parse_price(str(price_raw))
            if price_per_night == 0:
                continue

            # Tính total cho stay
            try:
                dep = datetime.strptime(check_in,  "%Y-%m-%d").date()
                ret = datetime.strptime(check_out, "%Y-%m-%d").date()
                nights = max((ret - dep).days, 1)
            except ValueError:
                nights = 1
            total_price = price_per_night * nights

            parsed.append(SerpAPIHotelResult(
                hotel_name      = h.get("name", "Unknown hotel"),
                price_per_night = price_per_night,
                total_price     = total_price,
                rating          = float(h.get("overall_rating", 0) or 0),
                address         = h.get("description", "") or h.get("type", ""),
                source          = "SerpAPI/Google Hotels",
            ))

        # Sắp xếp theo giá tăng dần
        parsed.sort(key=lambda x: x.price_per_night)
        console.print(f"  SerpAPI Hotels: {len(parsed)} results for {destination}")
        return parsed

    except Exception as exc:
        console.print(f"[yellow]  SerpAPI Hotels error: {exc}[/yellow]")
        return []


def _format_serpapi_hotels(hotels: list[SerpAPIHotelResult], budget_vnd: int) -> str:
    """Format hotel results thành text để inject vào research."""
    if not hotels:
        return ""
    lines = ["## SerpAPI Real-Time Hotel Prices\n"]
    for h in hotels[:5]:
        budget_label = "✓ within budget" if h.total_price <= budget_vnd * 0.4 else "⚠ exceeds 40% budget"
        lines.append(
            f"### {h.hotel_name}\n"
            f"- Rate: {h.price_per_night:,} VND/night ({budget_label})\n"
            f"- Total stay: {h.total_price:,} VND\n"
            f"- Rating: {h.rating}/5\n"
            f"- Source: {h.source}\n"
        )
    return "\n".join(lines)
