"""
graph.py — backward-compat re-export. Import from app.agent instead.
"""
from app.agent import get_chat_agent  # noqa: F401

__all__ = ["get_chat_agent"]
