"""
streaming.py — SSE streaming for chat agent responses.

Emits Server-Sent Events so the frontend can show "typing" in real-time:
  event: tool_start  → "🔍 Đang tìm địa điểm..."
  event: token       → each LLM token as it's generated
  event: done        → final metadata (session_id, tool_calls, plan)
"""
import json
from typing import AsyncGenerator
from loguru import logger
from langchain_core.messages import AIMessage


async def stream_chat_response(
    agent,
    messages: list,
    session_id: str,
) -> AsyncGenerator[str, None]:
    """Stream agent response as SSE events.

    Yields SSE-formatted strings: "data: {...}\\n\\n"
    """
    tools_used: list[str] = []
    plan_data: dict | None = None
    full_text = ""

    try:
        async for event in agent.astream_events(
            {"messages": messages},
            version="v2",
        ):
            kind = event.get("event", "")
            data = event.get("data", {})

            # ── Tool start: show "searching..." indicator ──────────────
            if kind == "on_tool_start":
                tool_name = event.get("name", "")
                tools_used.append(tool_name)

                # Human-friendly tool labels
                labels = {
                    "get_places":      "🔍 Đang tìm địa điểm...",
                    "get_food_venues": "🍜 Đang tìm quán ăn...",
                    "get_combos":      "🎫 Đang tìm combo tour...",
                    "get_weather":     "🌤️ Đang kiểm tra thời tiết...",
                    "search_hotels":   "🏨 Đang tìm khách sạn...",
                    "search_flights":  "✈️ Đang tìm vé máy bay...",
                    "get_real_prices": "💰 Đang kiểm tra giá vé...",
                    "create_travel_plan": "📋 Đang lên lịch trình...",
                }
                label = labels.get(tool_name, f"⚙️ Đang xử lý {tool_name}...")

                yield _sse({"type": "tool_start", "tool": tool_name, "label": label})

            # ── Tool end: check for plan data ──────────────────────────
            elif kind == "on_tool_end":
                tool_name = event.get("name", "")
                if tool_name == "create_travel_plan":
                    output = data.get("output", "")
                    try:
                        parsed = json.loads(output) if isinstance(output, str) else output
                        if isinstance(parsed, dict) and parsed.get("plan"):
                            plan_data = parsed
                    except (json.JSONDecodeError, TypeError):
                        pass

            # ── LLM token streaming ────────────────────────────────────
            elif kind == "on_chat_model_stream":
                chunk = data.get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    token = chunk.content
                    full_text += token
                    yield _sse({"type": "token", "content": token})

    except Exception as e:
        logger.error(f"[stream] Error: {e}")
        yield _sse({"type": "error", "message": str(e)})

    # ── Final event ────────────────────────────────────────────────────
    yield _sse({
        "type":       "done",
        "session_id": session_id,
        "tool_calls": tools_used,
        "plan":       plan_data,
        "full_text":  full_text,
    })


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
