"""
Planner agent — generates a single optimal travel itinerary.
"""

import re
import json
from datetime import datetime, timedelta
from langchain_core.messages import AIMessage, SystemMessage

from app.config.settings import llm, console, TODAY
from app.models.state import TravelPipelineState
from app.prompts.planner import PLANNER_SYSTEM


def planner_agent(state: TravelPipelineState) -> dict:
    console.print("\n[bold magenta]━━━ PLANNER AGENT ━━━[/bold magenta]")
    trip     = state["trip"]
    research = state["research"]

    missing = [d for d in ["attractions", "food", "hotels"] if not research.get(d)]
    if missing:
        return {
            "messages": [AIMessage(content=f"⚠ Thieu: {missing}")],
            "planning_done": False,
        }

    num_days   = trip.get("num_days", 4)
    try:
        dep_dt    = datetime.strptime(trip["departure_date"], "%Y-%m-%d")
        day_lines = []
        for i in range(num_days):
            d   = dep_dt + timedelta(days=i)
            lbl = "(check-in)" if i == 0 else ("(check-out)" if i == num_days - 1 else "")
            day_lines.append(f"  - Ngay {i+1}: {d.strftime('%A, %d/%m/%Y')} {lbl}")
        day_list  = "\n".join(day_lines)
        last_date = (dep_dt + timedelta(days=num_days-1)).strftime("%d/%m/%Y")
    except (ValueError, KeyError):
        day_list  = f"  {num_days} ngay"
        last_date = trip.get("return_date", "")

    response = llm.invoke([SystemMessage(content=PLANNER_SYSTEM.format(
        today=TODAY,
        trip_json=json.dumps(trip, ensure_ascii=False, indent=2),
        destination_context=trip.get("destination_context", ""),
        budget_vnd=trip.get("budget_vnd", 0),
        attractions=research.get("attractions", ""),
        food=research.get("food", ""),
        hotels=research.get("hotels", ""),
        transport=research.get("transport", ""),
        combos=research.get("combos", ""),
        num_days=num_days,
        day_list=day_list,
        last_date=last_date,
        origin=trip.get("origin", ""),
        destination=trip.get("destination", ""),
    ))])

    itinerary  = response.content
    days_found = len(re.findall(r'###\s*Ngay\s*\d+', itinerary, re.IGNORECASE))
    if days_found < num_days - 1:
        console.print(f"[yellow]  ⚠ {days_found}/{num_days} ngay — giu nguyen[/yellow]")
    else:
        console.print(f"[green]  ✓ {days_found} ngay day du[/green]")

    return {
        "plan_proposals":     [itinerary],
        "planning_done":      True,
        "user_selected_plan": 0,
    }
