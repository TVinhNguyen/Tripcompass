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

from app.services.tool_state import new_holder


_FOOD_SLOT_TYPES = {"breakfast", "lunch", "dinner", "snack", "brunch"}


def _slot_category(slot_type: str) -> str:
    """Map planner-ai slot_type → FE PlaceCategory."""
    return "FOOD" if (slot_type or "").lower() in _FOOD_SLOT_TYPES else "ATTRACTION"


def _to_generate_response(wrapper: dict) -> dict | None:
    """Transform planner-ai wrapper → frontend GenerateResponse shape.

    Wrapper shape (from create_travel_plan tool):
      {success, destination, num_days, budget_tier, budget_breakdown,
       validation_passed, violations, warnings, plan: {days: [...]}, weather}

    GenerateResponse shape (frontend contract):
      {days: [{day_num, date_str, day_type, primary_area, travel_min, buffer_min,
               slots: [{start, end, slot_type, is_buffer, place?: {id, name, category, ...}}]}],
       budget_recap: {total_budget_vnd, attraction_spent_vnd, food_spent_vnd,
                      remaining_vnd, within_budget},
       budget_tier, violations, slot_template}
    """
    inner = wrapper.get("plan") if isinstance(wrapper, dict) else None
    if not isinstance(inner, dict) or not isinstance(inner.get("days"), list):
        return None

    destination = (wrapper.get("destination") or "").strip() or "Việt Nam"
    breakdown = wrapper.get("budget_breakdown") or {}
    num_days = int(wrapper.get("num_days") or len(inner["days"]) or 1)

    attr_spent = 0
    food_spent = 0
    days_out: list[dict] = []
    for raw_day in inner["days"]:
        if not isinstance(raw_day, dict):
            continue
        slots_out: list[dict] = []
        for raw_slot in raw_day.get("slots", []) or []:
            if not isinstance(raw_slot, dict):
                continue
            slot_type = raw_slot.get("slot_type", "")
            place_id = raw_slot.get("place_id")
            place_name = raw_slot.get("place_name")
            price = int(raw_slot.get("price_vnd") or 0)
            slot_out: dict = {
                "start": raw_slot.get("start", ""),
                "end": raw_slot.get("end", ""),
                "slot_type": slot_type,
                # FIXME: Semantic mismatch. FE uses is_buffer for "travel/buffer time".
                # Here we set it to True for empty slots (e.g. unassigned evening)
                # so that the frontend's savePlanAsItinerary will skip saving them,
                # which achieves the desired behavior but misuses the is_buffer field.
                "is_buffer": not (place_id and place_name),
            }
            notes = raw_slot.get("notes")
            if notes:
                slot_out["notes"] = notes
            if place_id and place_name:
                category = _slot_category(slot_type)
                # Omit lat/lng/cover_image — not available from create_travel_plan.
                # Activity row stores NULL; map can resolve via place_id later.
                slot_out["place"] = {
                    "id": place_id,
                    "name": place_name,
                    "category": category,
                    "base_price": price,
                    "duration_min": 0,
                    "is_must_visit": False,
                    "is_full_day": False,
                    "is_free": price == 0,
                }
                if category == "FOOD":
                    food_spent += price
                else:
                    attr_spent += price
            slots_out.append(slot_out)
        days_out.append({
            "day_num": raw_day.get("day_num", len(days_out) + 1),
            "date_str": raw_day.get("date_str", ""),
            "day_type": raw_day.get("day_type", "standard"),
            "primary_area": destination,
            "travel_min": 0,
            "buffer_min": 0,
            "slots": slots_out,
        })

    user_budget = int(wrapper.get("budget_vnd") or 0)
    hotel_per_night = int(breakdown.get("hotel_budget_per_night") or 0)
    hotel_total = hotel_per_night * max(num_days - 1, 0)

    if user_budget > 0:
        total_budget = user_budget
    else:
        total_budget = int(breakdown.get("attr_budget") or 0) + int(breakdown.get("food_budget") or 0) + hotel_total

    spent = attr_spent + food_spent
    if total_budget < spent and user_budget == 0:
        total_budget = spent

    return {
        "days": days_out,
        "budget_recap": {
            "total_budget_vnd": total_budget,
            "attraction_spent_vnd": attr_spent,
            "food_spent_vnd": food_spent,
            "remaining_vnd": max(total_budget - spent, 0),
            "within_budget": spent <= total_budget,
        },
        "budget_tier": wrapper.get("budget_tier", "standard"),
        "violations": wrapper.get("violations", []),
        "slot_template": "standard",
    }


def _extract_plan(raw: str) -> dict | None:
    """Parse plan JSON from tool output and transform to GenerateResponse shape.

    create_travel_plan returns:
      {"success": true, "destination": ..., "num_days": ..., "budget_breakdown": ...,
       "plan": {"days": [...]}, ...}

    FE (GenerateResponse) expects:
      {"days": [...], "budget_recap": {...}, "budget_tier": ..., ...}
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
    if isinstance(parsed.get("plan"), dict):
        return _to_generate_response(parsed)

    # Case 2: raw schedule {days: [...]} — wrap with empty metadata then transform
    if isinstance(parsed.get("days"), list):
        return _to_generate_response({"plan": parsed})

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
    stream_dropped = False  # True if upstream LLM closed the connection mid-stream

    # Per-request scratch space. create_travel_plan stashes the full plan dict
    # here so we can ship it to the FE without bloating the agent's context.
    holder = new_holder()

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
                    # Primary path: the tool stashed the full wrapper into the
                    # request holder; transform it into the FE shape.
                    full = holder.get("full_plan") if isinstance(holder, dict) else None
                    if isinstance(full, dict):
                        plan_data = _to_generate_response(full)
                        if plan_data:
                            logger.info("[stream] Plan extracted from tool holder")
                    # Fallback for the (rare) case the tool returned full JSON
                    # in its string output instead of using the holder.
                    if not plan_data:
                        output = data.get("output", "")
                        if isinstance(output, ToolMessage):
                            output = output.content
                        if isinstance(output, dict):
                            output = json.dumps(output, ensure_ascii=False)
                        plan_data = _extract_plan(str(output))
                        if plan_data:
                            logger.info("[stream] Plan extracted from on_tool_end fallback")

            # ── LLM token streaming ────────────────────────────────────
            elif kind == "on_chat_model_stream":
                chunk = data.get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    token = chunk.content
                    full_text += token
                    yield _sse({"type": "token", "content": token})

    except Exception as e:
        # Detect the "peer closed connection" family — free-tier LLM gateways
        # (NVIDIA NIM, OpenRouter free) drop long streams without sending an
        # SSE error. We surface a friendly message and still emit `done` so the
        # FE can display whatever partial plan / partial markdown we have.
        msg = str(e)
        is_stream_drop = any(
            tok in msg.lower()
            for tok in ("peer closed", "incomplete chunked read", "remoteprotocolerror")
        )
        if is_stream_drop:
            stream_dropped = True
            logger.warning(f"[stream] Upstream LLM dropped the stream: {msg}")
            yield _sse({
                "type": "error",
                "message": "Nhà cung cấp LLM ngắt kết nối giữa chừng. Lịch trình (nếu có) vẫn được giữ lại bên dưới.",
            })
        else:
            logger.error(f"[stream] Error: {e}")
            yield _sse({"type": "error", "message": msg})

    # ── Fallback: holder may have populated even if on_tool_end was missed
    # (e.g. the stream was dropped right after the tool finished). ──────────
    if not plan_data and isinstance(holder, dict):
        full = holder.get("full_plan")
        if isinstance(full, dict):
            plan_data = _to_generate_response(full)
            if plan_data:
                logger.info("[stream] Plan recovered from holder after stream drop")

    # ── Fallback: extract plan from full_text if everything else missed it ──
    if not plan_data and "create_travel_plan" in tools_used:
        plan_data = _extract_plan(full_text)
        if plan_data:
            logger.info("[stream] Plan extracted from full_text fallback")

    # ── Clean full_text: strip all JSON, keep only markdown summary ────
    clean_text = _strip_json_objects(full_text)
    if stream_dropped and clean_text:
        clean_text += "\n\n_⚠️ Phần trả lời bị cắt giữa chừng do nhà cung cấp LLM ngắt kết nối — lịch trình đã được giữ lại._"

    # If the LLM returned nothing after create_travel_plan (free-tier
    # providers occasionally drop the second call), synthesise a short
    # Vietnamese summary from plan_data so the user still sees a reply.
    if not clean_text.strip() and plan_data:
        clean_text = _deterministic_summary(plan_data, stream_dropped)

    # ── Final event ────────────────────────────────────────────────────
    yield _sse({
        "type":       "done",
        "session_id": session_id,
        "tool_calls": tools_used,
        "plan":       plan_data,
        "full_text":  clean_text,
    })


_DAY_LABEL = {"arrival": "Đến nơi", "departure": "Trở về", "standard": ""}


def _deterministic_summary(plan: dict, stream_dropped: bool) -> str:
    """Produce a short Vietnamese reply from a GenerateResponse-shaped plan.

    Used as a fallback when the agent's post-tool LLM call returned no text
    (e.g. the upstream provider dropped the connection). The reply is
    intentionally terse: the FE renders the plan card right below it.
    """
    days = plan.get("days") or []
    dest = (days[0].get("primary_area") if days else None) or "chuyến đi"
    num_days = len(days) or "?"

    lines: list[str] = [
        f"Mình đã lên xong lịch trình **{num_days} ngày tại {dest}** cho bạn rồi! 🎉",
        "",
    ]
    for d in days[:7]:
        names = [
            s["place"]["name"]
            for s in (d.get("slots") or [])
            if isinstance(s.get("place"), dict) and s["place"].get("name")
        ]
        if not names:
            continue
        label = _DAY_LABEL.get(d.get("day_type", ""), "")
        prefix = f"**Ngày {d.get('day_num')}**" + (f" — {label}" if label else "")
        lines.append(f"- {prefix}: {' · '.join(names)}")

    recap = plan.get("budget_recap") or {}
    total = recap.get("total_budget_vnd")
    spent = (recap.get("attraction_spent_vnd") or 0) + (recap.get("food_spent_vnd") or 0)
    if total:
        lines += [
            "",
            f"💰 Ngân sách: **{int(spent):,}₫ / {int(total):,}₫**".replace(",", "."),
        ]

    if stream_dropped:
        lines += [
            "",
            "_⚠️ Phần mô tả chi tiết bị cắt do nhà cung cấp LLM ngắt kết nối — bạn vẫn lưu và chỉnh sửa được lịch trình bên dưới._",
        ]
    else:
        lines += [
            "",
            "Bạn muốn mình **điều chỉnh** chỗ nào hay **lưu thành lịch trình** luôn?",
        ]
    return "\n".join(lines)


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
