"""
Base research node factory and shared research utilities.
"""

import re
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import AnyMessage, add_messages

from app.config.settings import llm, llm_with_tools, console
from app.models.state import ResearchResults
from app.services.search_tools import _run_safe_tool_calls, _is_malformed_tool_call
from app.utils.text_utils import _sanitize_display, _extract_source_urls


class ResearchAgentState(TypedDict):
    context:  dict
    messages: Annotated[list[AnyMessage], add_messages]
    research: ResearchResults


def _make_research_node(domain: str, prompt_template: str, log_label: str):
    def agent_node(state: ResearchAgentState) -> dict:
        ctx    = state["context"]
        system = prompt_template.format(**ctx)
        existing = list(state.get("messages", []))
        if not any(isinstance(m, HumanMessage) for m in existing):
            existing = [HumanMessage(
                content=f"Research {domain} for this trip. Call web_search now — do NOT output JSON."
            )] + existing
        return {"messages": [llm_with_tools.invoke([SystemMessage(content=system)] + existing)]}

    def fix_tools_node(state: ResearchAgentState) -> dict:
        import json
        last  = state["messages"][-1]
        query = None
        try:
            parsed = json.loads(last.content.strip())
            items  = parsed if isinstance(parsed, list) else [parsed]
            query  = items[0].get("parameters", items[0].get("input", {})).get("query", "")
        except Exception:
            pass
        fix  = f"Call web_search for: '{query}'. Use the tool directly." if query else \
               f"Call web_search to research {domain}. Do NOT output JSON."
        ctx  = state["context"]
        clean = [m for m in state["messages"][:-1]
                 if not isinstance(m, AIMessage) or (hasattr(m, "tool_calls") and m.tool_calls)]
        clean.append(HumanMessage(content=fix))
        return {"messages": [llm_with_tools.invoke([SystemMessage(content=prompt_template.format(**ctx))] + clean)]}

    def tools_node(state: ResearchAgentState) -> dict:
        last = state["messages"][-1]
        return {"messages": _run_safe_tool_calls(getattr(last, "tool_calls", []))}

    def router(state: ResearchAgentState) -> str:
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            console.print(f"  [cyan]{log_label}[/cyan] → '{last.tool_calls[0].get('args',{}).get('query','')}'")
            return "tools"
        if isinstance(last, AIMessage) and _is_malformed_tool_call(last):
            return "fix_tools"
        return END

    g = StateGraph(ResearchAgentState)
    g.add_node("agent",     agent_node)
    g.add_node("tools",     tools_node)
    g.add_node("fix_tools", fix_tools_node)
    g.set_entry_point("agent")
    g.add_conditional_edges("agent", router, {"tools": "tools", "fix_tools": "fix_tools", END: END})
    g.add_edge("tools",     "agent")
    g.add_edge("fix_tools", "agent")
    return g.compile()


def _run_with_citations(app, state: ResearchAgentState) -> str:
    result      = app.invoke(state)
    content     = result["messages"][-1].content
    source_urls = _extract_source_urls(result["messages"])
    if source_urls:
        parts = [
            f"[[{i}] {_sanitize_display(re.sub(r'^https?://(www\\.)?', '', u).split('/')[0])}]({u})"
            for i, u in enumerate(source_urls, 1)
        ]
        content += "\n\n**Nguon:** " + " ".join(parts)
    return content
