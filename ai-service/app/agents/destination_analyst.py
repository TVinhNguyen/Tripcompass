"""
Destination analyst agent — researches weather, season, events for the trip destination.
"""

from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage

from app.config.settings import llm, llm_with_tools, console, TODAY
from app.models.state import TravelPipelineState
from app.prompts.analyst import ANALYST_SYSTEM
from app.services.search_tools import _run_safe_tool_calls


def destination_analyst(state: TravelPipelineState) -> dict:
    console.print("\n[bold blue]━━━ DESTINATION ANALYST ━━━[/bold blue]")
    trip = state["trip"]
    try:
        month_year = datetime.strptime(trip["departure_date"], "%Y-%m-%d").strftime("%B %Y")
    except ValueError:
        month_year = "upcoming"

    system = ANALYST_SYSTEM.format(
        today=TODAY, destination=trip["destination"], month_year=month_year,
        departure_date=trip["departure_date"], return_date=trip["return_date"],
    )
    seed    = HumanMessage(content=f"Search: {trip['destination']} {month_year} travel tips. Call web_search now.")
    ai_resp = llm_with_tools.invoke([SystemMessage(content=system), seed])

    if hasattr(ai_resp, "tool_calls") and ai_resp.tool_calls:
        tool_msgs = _run_safe_tool_calls(ai_resp.tool_calls)
        final     = llm.invoke([SystemMessage(content=system), seed, ai_resp] + tool_msgs)
        context   = final.content
    else:
        context = ai_resp.content

    console.print(f"[dim]  {context[:200]}...[/dim]")
    updated = dict(state["trip"])
    updated["destination_context"] = context
    return {"trip": updated}
