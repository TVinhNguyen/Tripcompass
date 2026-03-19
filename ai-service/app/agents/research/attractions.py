"""
Attractions research agent.
"""

from app.prompts.research import ATTRACTIONS_PROMPT
from app.agents.research.base import _make_research_node, _run_with_citations, ResearchAgentState

attractions_app = _make_research_node("attractions", ATTRACTIONS_PROMPT, "Attractions")


def run_attractions_agent(state: ResearchAgentState) -> dict:
    return {"research": {"attractions": _run_with_citations(attractions_app, state)}}
