"""
Food research agent — agentic LangGraph loop for scraping food venue data.
"""
from app.agents.research.base import _make_research_node, _run_with_citations, ResearchAgentState
from app.prompts.research import FOOD_RESEARCH_PROMPT
from app.config.settings import console, TODAY

_graph = _make_research_node(
    domain="food venues and restaurants",
    prompt_template=FOOD_RESEARCH_PROMPT,
    log_label="[food]",
)


def research_food(destination: str, year: int) -> str:
    console.print(f"[cyan]  [food] Researching {destination}…[/cyan]")
    state: ResearchAgentState = {
        "context": {"destination": destination, "year": year, "today": TODAY},
        "messages": [],
        "result": "",
    }
    return _run_with_citations(_graph, state)
