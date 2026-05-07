"""
streaming.py — SSE streaming for chat agent responses.

Emits Server-Sent Events so the frontend can show "typing" in real-time:
  event: tool_start  → "🔍 Đang tìm địa điểm..."
  event: token       → each LLM token as it's generated
  event: done        → final metadata (session_id, tool_calls, plan)

Plan shape contract (done.plan):
  FE expects GenerateResponse: { days: DayPlan[], budget_recap: ..., ... }
  We UNWRAP any wrapper (planning_service returns {success, plan: {...}})
  so done.plan always has `days` at top-level.
"""
import json
from typing import AsyncGenerator
from loguru import logger
from langchain_core.messages import AIMessage, ToolMessage


def _extract_plan(raw: str) -> dict | None:
    """Parse plan JSON from tool output and unwrap to GenerateResponse shape.

    planning_service returns:
      {"success": true, "plan": {"days": [...]}, "budget_tier": ..., ...}

    FE (GenerateResponse) expects:
      {"days": [...], "budget_recap": {...}, ...}

    This function always returns the inner plan dict (with `days` at top-level),
    or None if parsing fails.
    """
    if not raw:
        return None
    clean = raw.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        parsed = json.loads(clean)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(parsed, dict):
        return None

    # Case 1: planning_service wrapper {success, plan: {days: [...]}, ...}
    inner = parsed.get("plan")
    if isinstance(inner, dict) and isinstance(inner.get("days"), list):
        return inner

    # Case 2: raw schedule {days: [...]}
    if isinstance(parsed.get("days"), list):
        return parsed

    return None


def _strip_json_objects(text: str) -> str:
    """Remove all JSON blocks from text, keeping only the markdown summary.

    LLM output pattern: [```json {...}```] [{...}]* [markdown summary]
    Strategy: walk the text, skip fenced blocks and balanced {…} objects,
    keep everything else. If JSON is malformed (partial strip from earlier),
    fall back to finding the markdown boundary heuristically.
    """
    result = []
    i = 0
    n = len(text)

    while i < n:
        # Skip ```...``` fenced blocks
        if text[i:i+3] == '```':
            end_fence = text.find('```', i + 3)
            if end_fence != -1:
                i = end_fence + 3
                continue
            # No closing fence — skip to end
            break

        # Skip balanced top-level JSON objects
        if text[i] == '{':
            depth = 1
            j = i + 1
            in_str = False
            esc = False
            while j < n and depth > 0:
                c = text[j]
                if esc:
                    esc = False
                elif c == '\\' and in_str:
                    esc = True
                elif c == '"':
                    in_str = not in_str
                elif not in_str:
                    if c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                j += 1
            if depth == 0:
                i = j  # skip entire object
                continue
            else:
                # Unclosed brace — malformed JSON fragment.
                # Heuristic: skip forward to first markdown-looking line.
                break

        result.append(text[i])
        i += 1

    cleaned = ''.join(result).strip()

    # If cleaned is mostly empty but text has content, use heuristic fallback:
    # find the first line that starts with markdown formatting (**, #, -, 🎉, etc.)
    if len(cleaned) < 50 and len(text) > 200:
        import re
        md_match = re.search(
            r'^(?:Mình đã|##? |[\*\-] |\*\*|🎉|📅|💰|📌|Đây là)',
            text,
            re.MULTILINE,
        )
        if md_match:
            cleaned = text[md_match.start():].strip()

    return cleaned



async def stream_chat_response(
    agent,
    messages: list,
    session_id: str,
) -> AsyncGenerator[str, None]:
    """Stream agent response as SSE events.

    Yields SSE-formatted strings: "data: {...}\\n\\n"

    JSON suppression note:
      The agent prompt instructs the LLM not to dump raw JSON. If the LLM
      complies, no JSON tokens appear in the stream. We do NOT attempt
      real-time token suppression (fragile with 1-3 char tokens). Instead,
      _strip_json_objects cleans full_text in the done event as a safety net.
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
                    # LangGraph v2: output can be str, dict, or ToolMessage
                    output = data.get("output", "")
                    if isinstance(output, ToolMessage):
                        output = output.content
                    if isinstance(output, dict):
                        output = json.dumps(output, ensure_ascii=False)
                    plan_data = _extract_plan(str(output))
                    if plan_data:
                        logger.info("[stream] Plan extracted from on_tool_end")

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

    # ── Fallback: extract plan from full_text if on_tool_end missed it ──
    if not plan_data and "create_travel_plan" in tools_used:
        plan_data = _extract_plan(full_text)
        if plan_data:
            logger.info("[stream] Plan extracted from full_text fallback")

    # ── Clean full_text: strip all JSON, keep only markdown summary ────
    clean_text = _strip_json_objects(full_text)

    # ── Final event ────────────────────────────────────────────────────
    yield _sse({
        "type":       "done",
        "session_id": session_id,
        "tool_calls": tools_used,
        "plan":       plan_data,
        "full_text":  clean_text,
    })


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
