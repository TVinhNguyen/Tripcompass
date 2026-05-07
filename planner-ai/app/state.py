"""
state.py — Type alias for the travel plan state dict.

Used by budget, schedule, validate nodes for type hints.
The state is a plain dict (not a TypedDict) for flexibility with LangGraph.
"""
from typing import Any

# Type alias — keeps node signatures readable without coupling to a concrete class
TravelPlanState = dict[str, Any]
