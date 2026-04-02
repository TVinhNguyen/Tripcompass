"""
Meta-controller: dispatch parallel research agents and collect results.
"""

from app.config.settings import console, TODAY
from app.models.state import TravelPipelineState
from langgraph.types import Send


def dispatch_research_node(state: TravelPipelineState) -> dict:
    console.print("\n[bold purple]━━━ META-CONTROLLER ━━━[/bold purple]")
    return {}


def dispatch_research(state: TravelPipelineState) -> list[Send]:
    trip         = state["trip"]
    skip_research = state.get("skip_research", False)
    ctx  = {
        "destination":    trip["destination"],
        "origin":         trip.get("origin", ""),
        "departure_date": trip["departure_date"],
        "return_date":    trip["return_date"],
        "num_people":     trip["num_people"],
        "budget_vnd":     trip["budget_vnd"],
        "travel_style":   trip.get("travel_style", "exploration"),
        "today":          TODAY,
    }

    if skip_research:
        console.print("[cyan]  DB hit — skipping all web research agents[/cyan]")
        return [Send("collect_research", {})]

    return [
        Send("attractions_agent", {"context": ctx, "messages": [], "research": {}}),
        Send("food_agent",        {"context": ctx, "messages": [], "research": {}}),
        Send("combos_agent",      {"context": ctx, "messages": [], "research": {}}),
    ]


def collect_research(state: TravelPipelineState) -> dict:
    console.print("\n[bold]━━━ Research collected ━━━[/bold]")
    r = state.get("research", {})
    for d in ["attractions", "food", "combos"]:
        icon = "[green]✓[/green]" if r.get(d) else "[red]✗[/red]"
        console.print(f"  {d:12}: {icon}")
    return {}
