"""
Tavily search tool wrappers and tool call normalizers.
Copied from ai-service/app/services/search_tools.py — adapted for scraper-service imports.
"""

import json
from langchain_core.messages import AIMessage, ToolMessage

from app.config.settings import search_tool


def _is_malformed_tool_call(msg: AIMessage) -> bool:
    if not isinstance(msg.content, str):
        return False
    c = msg.content.strip()
    return (
        ('"type"' in c and '"function"' in c) or
        ('"name"' in c and '"web_search"' in c) or
        ('"tool"' in c and '"query"' in c)
    ) and not (hasattr(msg, "tool_calls") and msg.tool_calls)


def _normalize_tavily_args(raw_args) -> dict:
    if isinstance(raw_args, str):
        try:
            raw_args = json.loads(raw_args)
        except Exception:
            raw_args = {"query": raw_args}
    if not isinstance(raw_args, dict):
        raw_args = {"query": str(raw_args)}
    args = dict(raw_args)
    for key in ("include_domains", "exclude_domains"):
        v = args.get(key)
        if v is None:
            args.pop(key, None)
        elif isinstance(v, str):
            s = v.strip()
            if s.lower() in {"", "null", "none"}:
                args.pop(key, None)
            else:
                try:
                    parsed = json.loads(s)
                    args[key] = parsed if isinstance(parsed, list) else [s]
                except Exception:
                    args[key] = [x.strip() for x in s.split(",") if x.strip()]
        elif not isinstance(v, list):
            args.pop(key, None)
    if "time_range" in args:
        raw_time_range = args.get("time_range")
        if raw_time_range is None:
            args.pop("time_range", None)
        else:
            v = str(raw_time_range).strip().strip('"').strip("'").lower()
            if v in {"", "null", "none"}:
                args.pop("time_range", None)
            elif v in {"day", "week", "month", "year"}:
                args["time_range"] = v
            else:
                args.pop("time_range", None)
    if "max_results" in args:
        try:
            args["max_results"] = int(args["max_results"])
        except (TypeError, ValueError):
            args.pop("max_results", None)
    return args


def _run_safe_tool_calls(tool_calls: list) -> list[ToolMessage]:
    results = []
    for tc in tool_calls:
        tool_id = tc.get("id", "tool_call_0")
        try:
            raw_args = tc.get("args", {})
            args = _normalize_tavily_args(raw_args)
            output = search_tool.invoke(args)
            if isinstance(output, list):
                content = json.dumps(output, ensure_ascii=False)
            else:
                content = str(output)
        except Exception as e:
            content = f"[search error: {e}]"
        results.append(ToolMessage(content=content, tool_call_id=tool_id))
    return results
