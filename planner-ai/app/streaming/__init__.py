"""
streaming — SSE streaming package for chat agent responses.

Re-exports the public API so existing imports continue to work:
  from app.streaming import stream_chat_response
  from app.streaming import _to_generate_response, _ThinkStripper, _strip_thinking
"""
from app.streaming.pump import stream_chat_response
from app.streaming.response_shape import _to_generate_response, _extract_plan
from app.streaming.think_stripper import _ThinkStripper, _strip_thinking
from app.streaming.summary import _strip_json_objects, _deterministic_summary
from app.streaming.helpers import _sse, _content_to_text, _message_content, _has_tool_calls

__all__ = [
    "stream_chat_response",
    "_to_generate_response",
    "_extract_plan",
    "_ThinkStripper",
    "_strip_thinking",
    "_strip_json_objects",
    "_deterministic_summary",
    "_sse",
    "_content_to_text",
    "_message_content",
    "_has_tool_calls",
]
