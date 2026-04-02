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
from app.agents.research.combos import run_combos_agent
from app.agents.db_lookup import db_lookup_agent
from app.agents.decision_engine import decision_engine
from app.agents.planner import planner_agent
from app.agents.plan_validator import plan_validator
from app.agents.judge import judge_agent
from app.pipeline.runner import dispatch_research_node, dispatch_research, collect_research

pipeline = StateGraph(TravelPipelineState)

for name, fn in [
    ("clarification",              clarification_agent),
    ("abort",                      abort_node),
    ("destination_analyst",        destination_analyst),
    ("db_lookup",                  db_lookup_agent),
    ("dispatch_research",          dispatch_research_node),
    ("attractions_agent",          run_attractions_agent),
    ("food_agent",                 run_food_agent),
    ("combos_agent",               run_combos_agent),
    ("collect_research",           collect_research),
    ("decision_engine",            decision_engine),
    ("planner",                    planner_agent),
    ("plan_validator",             plan_validator),
    ("judge",                      judge_agent),
]:
    pipeline.add_node(name, fn)

pipeline.set_entry_point("clarification")
pipeline.add_conditional_edges(
    "clarification", should_clarify_or_proceed,
    {"clarification": "clarification", "destination_analyst": "destination_analyst", "abort": "abort"},
)
pipeline.add_edge("abort",                      END)
pipeline.add_edge("destination_analyst", "db_lookup")
pipeline.add_edge("db_lookup",                 "dispatch_research")
pipeline.add_conditional_edges("dispatch_research", dispatch_research)
for a in ["attractions_agent", "food_agent", "combos_agent"]:
    pipeline.add_edge(a, "collect_research")
pipeline.add_edge("collect_research", "decision_engine")
pipeline.add_edge("decision_engine",   "planner")
pipeline.add_edge("planner",           "plan_validator")
pipeline.add_edge("plan_validator",    "judge")
pipeline.add_edge("judge",             END)

checkpointer = MemorySaver()
travel_app   = pipeline.compile(checkpointer=checkpointer)
console.print("[green]✓ Pipeline v8 + decision_engine compiled.[/green]")
