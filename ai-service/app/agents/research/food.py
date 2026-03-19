"""
Food research agent.
"""

from app.prompts.research import FOOD_PROMPT
from app.agents.research.base import _make_research_node, _run_with_citations, ResearchAgentState

food_app = _make_research_node("food", FOOD_PROMPT, "Food")


def run_food_agent(state: ResearchAgentState) -> dict:
    return {"research": {"food": _run_with_citations(food_app, state)}}
