"""
Attraction research agent — agentic LangGraph loop for scraping attraction data.
"""
from app.agents.research.base import _make_research_node, _run_with_citations, ResearchAgentState
from app.prompts.research import ATTRACTION_RESEARCH_PROMPT
from app.config.settings import console, TODAY

_graph = _make_research_node(
    domain="tourist attractions",
    prompt_template=ATTRACTION_RESEARCH_PROMPT,
    log_label="[attractions]",
)


def research_attractions(destination: str, year: int) -> str:
    console.print(f"[cyan]  [attractions] Researching {destination}…[/cyan]")
    state: ResearchAgentState = {
        "context": {"destination": destination, "year": year, "today": TODAY},
        "messages": [],
        "result": "",
    }
    return _run_with_citations(_graph, state)
