"""
streaming/helpers.py — Low-level SSE formatting and LangChain message utilities.
"""
import json


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _message_content(output) -> str:
    """Best-effort content extraction from LangChain chat end events."""
    if output is None:
        return ""
    message = getattr(output, "message", output)
    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def _has_tool_calls(output) -> bool:
    """True when a chat end event is an agent tool-call turn, not user text."""
    if output is None:
        return False
    message = getattr(output, "message", output)
    tool_calls = getattr(message, "tool_calls", None)
    if tool_calls:
        return True
    if isinstance(message, dict):
        return bool(message.get("tool_calls"))
    return False
