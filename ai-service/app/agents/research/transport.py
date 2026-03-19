"""
Transport research agent — combines SerpAPI real-time flight prices with Tavily search.
"""

from app.config.settings import console
from app.prompts.research import TRANSPORT_PROMPT
from app.agents.research.base import _make_research_node, _run_with_citations, ResearchAgentState
from app.services.serpapi_flights import search_flights_serpapi, _format_serpapi_flights

transport_app = _make_research_node("transport", TRANSPORT_PROMPT, "Transport")


def run_transport_agent(state: ResearchAgentState) -> dict:
    """
    Transport agent: chạy SerpAPI Flights TRƯỚC để lấy giá thực tế,
    sau đó Tavily để tìm transport nội địa và context.
    """
    ctx = state["context"]

    # 1. SerpAPI real-time flight prices
    serpapi_flight_text = ""
    if ctx.get("origin") and ctx.get("destination"):
        outbound_flights, return_flights = search_flights_serpapi(
            origin      = ctx["origin"],
            destination = ctx["destination"],
            outbound    = ctx["departure_date"],
            return_date = ctx["return_date"],
            adults      = ctx["num_people"],
        )
        if outbound_flights or return_flights:
            serpapi_flight_text = _format_serpapi_flights(
                outbound_flights, return_flights,
                ctx["origin"], ctx["destination"], ctx["num_people"]
            ) + "\n\n"
            if outbound_flights and return_flights:
                round_trip_total = outbound_flights[0].price_total + return_flights[0].price_total
                console.print(
                    f"  [green]SerpAPI Flights: cheapest round-trip = "
                    f"{round_trip_total:,} VND for {ctx['num_people']} people[/green]"
                )

    # 2. Tavily cho local transport + backup flight info
    tavily_text = _run_with_citations(transport_app, state)

    combined = serpapi_flight_text + tavily_text
    return {"research": {"transport": combined}}
