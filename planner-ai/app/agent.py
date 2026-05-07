"""
agent.py — ReAct agent: build + lazy singleton (merged from graph.py).
"""
from loguru import logger
from langgraph.prebuilt import create_react_agent
from app import config
from app.tools import ALL_TOOLS
from app.prompts.agent import SYSTEM_PROMPT

_agent = None


def get_chat_agent():
    """Return the ReAct agent instance (built once, reused forever)."""
    global _agent
    if _agent is None:
        _agent = create_react_agent(
            model=config.llm,
            tools=ALL_TOOLS,
            prompt=SYSTEM_PROMPT,
        )
        logger.info(f"[agent] Ready — {len(ALL_TOOLS)} tools: {[t.name for t in ALL_TOOLS]}")
    return _agent
