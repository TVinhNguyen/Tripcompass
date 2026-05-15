"""
tools/search_hotels.py — SerpAPI Google Hotels.
"""
import json

from langchain_core.tools import tool

from app.data_sources.hotels import search_hotels_data


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
    data = await search_hotels_data(
        destination=destination,
        checkin=checkin,
        checkout=checkout,
        budget_tier=budget_tier,
        guests=guests,
    )
    return json.dumps(data, ensure_ascii=False)
