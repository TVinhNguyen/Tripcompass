"""
routes/chat.py — POST /chat/stream (primary) and POST /chat/debug-stream (admin diagnostic).

POST /chat (non-stream) was removed in Pha 2 refactor — no caller existed.
"""
import json
import uuid
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage

from app.agent import get_chat_agent
from app.schemas import ChatRequest, StreamChatRequest
from app.services.chat_history import (
    load_history, save_history, history_to_lc_messages,
    build_user_message, build_assistant_message,
)
from app.streaming import stream_chat_response
from app.routes.cache import require_cache_admin
from loguru import logger

router = APIRouter(tags=["chat"])


def _compact_itinerary_context(context: dict) -> dict:
    """Keep only fields useful for chat about the current itinerary."""
    root_keys = (
        "id", "title", "destination", "destination_id", "start_date", "end_date",
        "num_days", "guest_count", "budget", "budget_vnd", "budget_tier", "status",
    )
    compact = {
        key: context[key]
        for key in root_keys
        if key in context and context[key] not in (None, "", [])
    }

    activities = context.get("activities")
    if isinstance(activities, list) and activities:
        grouped: dict[int, list[dict]] = {}
        for activity in sorted(
            (item for item in activities if isinstance(item, dict)),
            key=lambda item: (item.get("day_number") or 0, item.get("order_index") or 0),
        ):
            day_num = activity.get("day_number") or 0
            slot = {
                key: value
                for key, value in {
                    "order": activity.get("order_index"),
                    "title": activity.get("title"),
                    "category": activity.get("category"),
                    "start": activity.get("start_time"),
                    "end": activity.get("end_time"),
                    "price_vnd": activity.get("estimated_cost"),
                    "notes": activity.get("notes"),
                    "place_name": activity.get("place_name"),
                    "location": activity.get("location"),
                    "area": activity.get("area"),
                }.items()
                if value not in (None, "", [])
            }
            if slot:
                grouped.setdefault(day_num, []).append(slot)

        if grouped:
            compact["days"] = [
                {"day_num": day_num, "slots": slots[:12]}
                for day_num, slots in sorted(grouped.items())[:14]
            ]

    plan = context.get("plan") or context.get("final_plan") or context
    days = plan.get("days") if isinstance(plan, dict) else None
    if "days" not in compact and isinstance(days, list):
        compact["days"] = []
        for day in days[:7]:
            if not isinstance(day, dict):
                continue
            day_data = {
                key: day[key]
                for key in ("day_num", "day_type", "date_str", "day_highlight")
                if key in day and day[key] not in (None, "", [])
            }
            slots = []
            for slot in (day.get("slots", []) or [])[:8]:
                if not isinstance(slot, dict):
                    continue
                slots.append({
                    key: slot[key]
                    for key in ("start", "end", "slot_type", "place_name", "price_vnd")
                    if key in slot and slot[key] not in (None, "", [])
                })
            if slots:
                day_data["slots"] = slots
            compact["days"].append(day_data)

    warnings = context.get("warnings")
    if not warnings and isinstance(plan, dict):
        warnings = plan.get("warnings")
    if isinstance(warnings, list) and warnings:
        compact["warnings"] = warnings[:5]

    return compact or {"summary": "itinerary_context provided but no compact fields matched"}


def _itinerary_context_message(context: dict | None) -> str | None:
    if not context:
        return None
    compact = _compact_itinerary_context(context)
    return (
        "DỮ LIỆU LỊCH TRÌNH HIỆN TẠI CỦA USER:\n"
        f"{json.dumps(compact, ensure_ascii=False, separators=(',', ':'))}\n\n"
        "Hãy dùng dữ liệu này làm nguồn chính khi user hỏi về lịch trình đang chỉnh sửa. "
        "Nếu user yêu cầu tối ưu, thêm, xoá hoặc sắp xếp lại, hãy đưa ra đề xuất cụ thể "
        "theo ngày/giờ/hoạt động; đừng nói rằng bạn đã sửa DB vì chat này chỉ có quyền tư vấn."
    )


@router.post("/chat/stream")
async def chat_stream(req: StreamChatRequest):
    """Token-by-token streaming via Server-Sent Events.

    Frontend listens with EventSource or fetch+ReadableStream.
    Events: tool_start | token | done | error
    """
    session_id = req.session_id or str(uuid.uuid4())

    history  = await load_history(session_id)
    messages = history_to_lc_messages(history)
    context_msg = _itinerary_context_message(req.itinerary_context)
    if context_msg:
        messages.append(HumanMessage(content=context_msg))
    messages.append(HumanMessage(content=req.message))

    async def _generate():
        full_text  = ""
        tools_used = []
        plan_data  = None

        async for chunk in stream_chat_response(get_chat_agent(), messages, session_id):
            if '"type": "done"' in chunk or '"type":"done"' in chunk:
                try:
                    payload    = json.loads(chunk.removeprefix("data: ").strip())
                    full_text  = payload.get("full_text", "")
                    tools_used = payload.get("tool_calls", [])
                    plan_data  = payload.get("plan")
                except Exception:
                    pass
            yield chunk

        await save_history(session_id, history + [
            build_user_message(req.message),
            build_assistant_message(full_text, tool_calls=tools_used, has_plan=bool(plan_data)),
        ])
        logger.info(f"[/chat/stream] session={session_id[:8]}… tools={tools_used}")

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Diagnostic: bypass agent, stream raw from LLM ─────────────────────────────
@router.post("/chat/debug-stream", dependencies=[Depends(require_cache_admin)])
async def chat_debug_stream(req: ChatRequest):
    """Stream the user message directly through the LLM with no agent / tools.

    Gated by X-Admin-Token header (reuses require_cache_admin dependency).

    Use this to isolate where latency comes from:
      - If THIS endpoint streams token-by-token in <1s → pipe (Caddy/backend/SSE)
        is fine; the slowness is the agent + tools layer.
      - If THIS endpoint also batches / takes 10+s → the LLM provider is the
        bottleneck (it doesn't actually honor stream=true, or the model is slow).
    """
    from app.config import get_llm

    async def _gen():
        import time as _t
        from langchain_core.messages import HumanMessage as _HM
        from app.streaming.helpers import _content_to_text

        started = _t.monotonic()
        first_token_at = None
        count = 0
        async for chunk in get_llm().astream([_HM(content=req.message)]):
            content = _content_to_text(getattr(chunk, "content", "") or "")
            if not content:
                continue
            count += 1
            if first_token_at is None:
                first_token_at = _t.monotonic() - started
                logger.info(f"[debug-stream] first token at +{first_token_at:.2f}s")
            yield f"data: {json.dumps({'type': 'token', 'content': content}, ensure_ascii=False)}\n\n"
        total = _t.monotonic() - started
        logger.info(f"[debug-stream] done — tokens={count} first={first_token_at} total={total:.2f}s")
        yield f"data: {json.dumps({'type': 'done', 'tokens': count, 'first_token_s': first_token_at, 'total_s': total})}\n\n"

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
