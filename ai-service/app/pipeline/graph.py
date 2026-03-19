"""
LangGraph pipeline assembly — registers all nodes, edges, and compiles the graph.
"""

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from app.config.settings import console
from app.models.state import TravelPipelineState
from app.agents.clarification import clarification_agent, should_clarify_or_proceed, abort_node
from app.agents.destination_analyst import destination_analyst
from app.agents.research.attractions import run_attractions_agent
from app.agents.research.food import run_food_agent
from app.agents.research.hotels import run_hotels_agent
from app.agents.research.combos import run_combos_agent
from app.agents.research.transport import run_transport_agent
from app.agents.budget_validator import budget_validator
from app.agents.planner import planner_agent
from app.agents.judge import judge_agent
from app.pipeline.runner import dispatch_research_node, dispatch_research, collect_research

pipeline = StateGraph(TravelPipelineState)

for name, fn in [
    ("clarification",       clarification_agent),
    ("abort",               abort_node),
    ("destination_analyst", destination_analyst),
    ("dispatch_research",   dispatch_research_node),
    ("attractions_agent",   run_attractions_agent),
    ("food_agent",          run_food_agent),
    ("hotels_agent",        run_hotels_agent),
    ("combos_agent",        run_combos_agent),
    ("transport_agent",     run_transport_agent),
    ("collect_research",    collect_research),
    ("budget_validator",    budget_validator),
    ("planner",             planner_agent),
    ("judge",               judge_agent),
]:
    pipeline.add_node(name, fn)

pipeline.set_entry_point("clarification")
pipeline.add_conditional_edges(
    "clarification", should_clarify_or_proceed,
    {"clarification": "clarification", "destination_analyst": "destination_analyst", "abort": "abort"},
)
pipeline.add_edge("abort",               END)
pipeline.add_edge("destination_analyst", "dispatch_research")
pipeline.add_conditional_edges("dispatch_research", dispatch_research)
for a in ["attractions_agent", "food_agent", "hotels_agent", "combos_agent", "transport_agent"]:
    pipeline.add_edge(a, "collect_research")
pipeline.add_edge("collect_research", "budget_validator")
pipeline.add_edge("budget_validator",  "planner")
pipeline.add_edge("planner",           "judge")
pipeline.add_edge("judge",             END)

checkpointer = MemorySaver()
travel_app   = pipeline.compile(checkpointer=checkpointer)
console.print("[green]✓ Pipeline v7 + SerpAPI compiled.[/green]")
