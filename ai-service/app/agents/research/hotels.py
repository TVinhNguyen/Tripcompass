"""
Hotels research agent — combines SerpAPI real-time prices with Tavily search.
"""

from app.config.settings import console
from app.prompts.research import HOTELS_PROMPT
from app.agents.research.base import _make_research_node, _run_with_citations, ResearchAgentState
from app.services.serpapi_hotels import search_hotels_serpapi, _format_serpapi_hotels

hotels_app = _make_research_node("hotels", HOTELS_PROMPT, "Hotels")


def run_hotels_agent(state: ResearchAgentState) -> dict:
    """
    Hotels agent: chạy Tavily search TRƯỚC, sau đó gọi SerpAPI để verify/enrich giá thực tế.
    SerpAPI kết quả được prepend vào đầu content để budget validator ưu tiên.
    """
    ctx = state["context"]

    # 1. SerpAPI real-time prices (chạy trước, nhanh và chính xác hơn)
    serpapi_text = ""
    serpapi_hotels = search_hotels_serpapi(
        destination = ctx["destination"],
        check_in    = ctx["departure_date"],
        check_out   = ctx["return_date"],
        adults      = ctx["num_people"],
        budget_vnd  = ctx["budget_vnd"],
    )
    if serpapi_hotels:
        serpapi_text = _format_serpapi_hotels(serpapi_hotels, ctx["budget_vnd"]) + "\n\n"
        console.print(
            f"  [green]SerpAPI Hotels: cheapest = "
            f"{serpapi_hotels[0].hotel_name} @ {serpapi_hotels[0].price_per_night:,} VND/đêm[/green]"
        )

    # 2. Tavily search để lấy thêm reviews, context, địa chỉ
    tavily_text = _run_with_citations(hotels_app, state)

    # Prepend SerpAPI data — budget validator sẽ đọc phần này trước
    combined = serpapi_text + tavily_text
    return {"research": {"hotels": combined}}
