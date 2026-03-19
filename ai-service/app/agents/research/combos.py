"""
Combos research agent.
"""

from app.prompts.research import COMBOS_PROMPT
from app.agents.research.base import _make_research_node, _run_with_citations, ResearchAgentState

combos_app = _make_research_node("combos", COMBOS_PROMPT, "Combos")


def run_combos_agent(state: ResearchAgentState) -> dict:
    return {"research": {"combos": _run_with_citations(combos_app, state)}}
