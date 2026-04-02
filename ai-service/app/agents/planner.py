"""
Planner agent — prose writer that formats the pre-decided itinerary from decision_engine.
LLM's job: write engaging prose, NOT make scheduling decisions.
"""

import re
from langchain_core.messages import AIMessage, SystemMessage

from app.config.settings import llm, console, TODAY
from app.models.state import TravelPipelineState
from app.prompts.planner import PLANNER_SYSTEM_V2
from app.agents.decision_engine import build_planner_brief


def planner_agent(state: TravelPipelineState) -> dict:
    console.print("\n[bold magenta]━━━ PLANNER AGENT (prose writer) ━━━[/bold magenta]")
    trip      = state["trip"]
    research  = state.get("research", {})
    decisions = state.get("decisions", {})

    # Build compact brief from decision_engine output (~2k chars)
    if decisions:
        brief = build_planner_brief(decisions, trip)
        console.print(f"  [cyan]Brief: {len(brief)} chars (was ~20k raw)[/cyan]")
    else:
        # Fallback if decision_engine wasn't run (should not happen in normal flow)
        console.print("  [yellow]⚠ No decisions found — falling back to raw research[/yellow]")
        brief = (
            f"ATTRACTIONS:\n{research.get('attractions','')[:3000]}\n\n"
            f"FOOD:\n{research.get('food','')[:2000]}\n\n"
            f"COMBOS:\n{research.get('combos','')[:1000]}"
        )

    # Hotels + transport still passed raw (decision_engine doesn't handle these)
    hotels_text    = research.get("hotels",    "")[:2000]
    transport_text = research.get("transport", "")[:1000]

    num_days = trip.get("num_days", 4)

    response = llm.invoke([SystemMessage(content=PLANNER_SYSTEM_V2.format(
        today=TODAY,
        destination=trip.get("destination", ""),
        num_days=num_days,
        num_people=trip.get("num_people", 2),
        brief=brief,
        hotels=hotels_text,
        transport=transport_text,
        destination_context=trip.get("destination_context", ""),
    ))])

    itinerary  = response.content
    days_found = len(re.findall(r'###\s*Ngày?\s*\d+', itinerary, re.IGNORECASE))
    if days_found < num_days - 1:
        console.print(f"[yellow]  ⚠ {days_found}/{num_days} ngày — giữ nguyên[/yellow]")
    else:
        console.print(f"[green]  ✓ {days_found} ngày đầy đủ[/green]")

    return {
        "plan_proposals":     [itinerary],
        "planning_done":      True,
        "user_selected_plan": 0,
    }
