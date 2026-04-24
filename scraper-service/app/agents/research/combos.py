"""
Combo research agent — agentic LangGraph loop for scraping tour/combo packages.
"""
from app.agents.research.base import _make_research_node, _run_with_citations, ResearchAgentState
from app.prompts.research import COMBO_RESEARCH_PROMPT
from app.config.settings import console, TODAY

_graph = _make_research_node(
    domain="tour combo packages",
    prompt_template=COMBO_RESEARCH_PROMPT,
    log_label="[combos]",
)


def research_combos(destination: str, year: int) -> str:
    console.print(f"[cyan]  [combos] Researching {destination}…[/cyan]")
    state: ResearchAgentState = {
        "context": {"destination": destination, "year": year, "today": TODAY},
        "messages": [],
        "result": "",
    }
    return _run_with_citations(_graph, state)
