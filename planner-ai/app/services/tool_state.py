"""
services/tool_state.py — Per-request scratch space for tools.

Tools run inside child asyncio tasks spawned by LangGraph, so any state set
on a ContextVar inside the tool is invisible to the parent stream handler.
The workaround: the parent allocates a *mutable* dict, stashes it on a
ContextVar, and child tasks (which inherit the parent's context) write into
the same dict reference. Mutations are visible to the parent on return.

Used so that create_travel_plan can ship a slim summary back to the agent
(keeping its context small and the final markdown stream survivable on
free-tier LLM gateways) while still handing the full plan to the SSE
streaming layer.
"""
from contextvars import ContextVar
from typing import Optional

# The variable holds a mutable dict (or None when nothing initialised it).
_holder_var: ContextVar[Optional[dict]] = ContextVar("planner_tool_holder", default=None)


def new_holder() -> dict:
    """Allocate a fresh holder and bind it to the current context."""
    holder: dict = {}
    _holder_var.set(holder)
    return holder


def current_holder() -> Optional[dict]:
    """Return the holder bound to this request, or None if not initialised."""
    return _holder_var.get()
