"""
tools/get_food_venues.py — Query FOOD venues from DB.
"""
import json
from typing import Optional

from langchain_core.tools import tool

from app.data_sources.food import fetch_food_venues
from app.services.tool_cache import cached_tool


@tool
@cached_tool()
async def get_food_venues(
    destination: str,
    area: Optional[str] = None,
    tags: Optional[list[str]] = None,
    limit: int = 20,
) -> str:
    """Lấy nhà hàng / quán ăn (FOOD) từ database.
    Trả về: tên, giá trung bình, giờ mở cửa, rating, khu vực.
    destination phải là tên lowercase tiếng Việt có dấu."""
    data = await fetch_food_venues(
        destination=destination,
        area=area,
        tags=tags,
        limit=limit,
    )
    return json.dumps(data, ensure_ascii=False)
