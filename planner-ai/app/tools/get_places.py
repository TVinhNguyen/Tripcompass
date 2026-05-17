"""
tools/get_places.py — Query ATTRACTION places from DB.
"""
import json
from typing import Optional

from langchain_core.tools import tool

from app.data_sources.places import fetch_places
from app.services.tool_cache import cached_tool


@tool
@cached_tool()
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
    data = await fetch_places(
        destination=destination,
        area=area,
        tags=tags,
        must_visit_only=must_visit_only,
        limit=limit,
    )
    return json.dumps(data, ensure_ascii=False)
