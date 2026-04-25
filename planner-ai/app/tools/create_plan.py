"""
tools/create_plan.py — LangChain wrapper for the travel planning service.
"""
import json
from typing import Optional

from langchain_core.tools import tool

from app.services.planning_service import generate_travel_plan


@tool
async def create_travel_plan(
    destination: str,
    num_days: int,
    budget_vnd: int = 0,
    guest_count: int = 2,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    preferences: Optional[list[str]] = None,
    need_hotel: bool = True,
    need_flight: bool = False,
) -> str:
    """Tạo lịch trình du lịch hoàn chỉnh với chi tiết từng ngày.

    Gọi khi user muốn: lên lịch trình, xếp lịch du lịch, tạo kế hoạch.
    KHÔNG gọi khi user chỉ hỏi thông tin — dùng get_places/get_food_venues.
    """
    result = await generate_travel_plan(
        destination=destination,
        num_days=num_days,
        budget_vnd=budget_vnd,
        guest_count=guest_count,
        start_date=start_date,
        end_date=end_date,
        preferences=preferences,
        need_hotel=need_hotel,
        need_flight=need_flight,
    )
    return json.dumps(result, ensure_ascii=False, default=str)
