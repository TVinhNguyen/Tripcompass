"""
tools/create_plan.py — LangChain wrapper for the travel planning service.

The full plan dict is shipped to the streaming layer via tool_state (so the
SSE `done.plan` event still contains everything the frontend renders), but
the string returned to the agent is a slim summary. Free-tier LLM gateways
were dropping the final markdown stream when the agent's context held the
full 10-15KB plan; the slim summary cuts that to ~1KB.
"""
import json
from typing import Optional

from langchain_core.tools import tool

from app.services.planning_service import generate_travel_plan
from app.services.tool_state import current_holder


def _slim_summary(full: dict) -> dict:
    """Build the compact summary the agent uses to compose its reply."""
    plan_days = (full.get("plan") or {}).get("days") or []
    days_summary = []
    for day in plan_days:
        slots = day.get("slots", []) or []
        names = [s.get("place_name") for s in slots if s.get("place_id") and s.get("place_name")]
        days_summary.append({
            "day_num": day.get("day_num"),
            "day_type": day.get("day_type"),
            "places": names,
        })
    weather = full.get("weather") or {}
    return {
        "success":           full.get("success", True),
        "destination":       full.get("destination"),
        "num_days":          full.get("num_days"),
        "budget_tier":       full.get("budget_tier"),
        "budget_breakdown":  full.get("budget_breakdown", {}),
        "validation_passed": full.get("validation_passed", False),
        "days_summary":      days_summary,
        "violations":        full.get("violations", []),
        "warnings":          full.get("warnings", []),
        "weather_tip":       weather.get("tip", ""),
    }


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
    full = await generate_travel_plan(
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

    # Hand the full plan to the streaming layer via the request-scoped holder.
    # If no holder is bound (e.g. direct unit test invocation), we fall back to
    # returning the full plan as the tool string so behavior stays correct.
    holder = current_holder()
    if holder is not None:
        holder["full_plan"] = full
        return json.dumps(_slim_summary(full), ensure_ascii=False, default=str)
    return json.dumps(full, ensure_ascii=False, default=str)
