"""
Tavily search tool wrappers and tool call normalizers.
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
        except Exception:
            args.pop("max_results", None)
    q = args.get("query", "")
    args["query"] = q if isinstance(q, str) else str(q)
    if not args["query"].strip():
        args["query"] = "Vietnam travel information"
    return args


def _run_safe_tool_calls(tool_calls) -> list[ToolMessage]:
    outputs = []
    for call in (tool_calls or []):
        tool_call_id = call.get("id", "tool_call")
        args = _normalize_tavily_args(call.get("args", {}))
        try:
            result  = search_tool.invoke(args)
            content = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
        except Exception:
            try:
                fallback = search_tool.invoke({"query": args.get("query", "Vietnam travel")})
                content  = fallback if isinstance(fallback, str) else json.dumps(fallback, ensure_ascii=False)
            except Exception as exc2:
                content = json.dumps({"error": str(exc2), "query": args.get("query", "")})
        outputs.append(ToolMessage(content=content, tool_call_id=tool_call_id))
    return outputs
