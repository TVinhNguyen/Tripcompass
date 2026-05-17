"""
tools/create_plan.py — LangChain wrapper for the travel planning service.

The tool always returns the full plan dict as JSON. The streaming layer
(pump.py) reads the plan directly from the on_tool_end event output and
fast-finishes with a deterministic summary — the agent never sees or
re-processes this full payload.
"""
import json
from typing import Optional

from langchain_core.tools import tool

from app.services.planning_service import generate_travel_plan
from app.nodes.resolve import UnresolvedDestinationError


@tool
async def create_travel_plan(
    destination: str,
    num_days: int,
    budget_vnd: int = 0,
    guest_count: int = 2,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    travel_style: Optional[str] = None,
    arrival_time: Optional[str] = None,
    departure_time: Optional[str] = None,
    daily_start_time: Optional[str] = None,
    daily_end_time: Optional[str] = None,
    time_strictness: Optional[str] = "balanced",
    preferences: Optional[list[str]] = None,
    required_places: Optional[list[str]] = None,
    raw_input: Optional[str] = None,
    need_hotel: bool = True,
    need_flight: bool = False,
) -> str:
    """Tạo lịch trình du lịch hoàn chỉnh với chi tiết từng ngày.

    Gọi khi user muốn: lên lịch trình, xếp lịch du lịch, tạo kế hoạch.
    KHÔNG gọi khi user chỉ hỏi thông tin — dùng get_places/get_food_venues.
    """
    try:
        full = await generate_travel_plan(
            destination=destination,
            num_days=num_days,
            budget_vnd=budget_vnd,
            guest_count=guest_count,
            start_date=start_date,
            end_date=end_date,
            travel_style=travel_style,
            arrival_time=arrival_time,
            departure_time=departure_time,
            daily_start_time=daily_start_time,
            daily_end_time=daily_end_time,
            time_strictness=time_strictness,
            preferences=preferences,
            required_places=required_places,
            raw_input=raw_input,
            need_hotel=need_hotel,
            need_flight=need_flight,
            include_enrich=False,
        )
    except UnresolvedDestinationError as e:
        # Surface as a tool result so the agent can ask the user to clarify
        # rather than crashing the chain.
        return json.dumps(
            {"success": False, "error_code": "unresolved_destination", "message": str(e)},
            ensure_ascii=False,
        )

    return json.dumps(full, ensure_ascii=False, default=str)
