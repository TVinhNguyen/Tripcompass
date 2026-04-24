"""
routes/chat.py — POST /chat and POST /chat/stream endpoints.
"""
import json
import time
import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage

from app.graph import get_chat_agent
from app.schemas import ChatRequest, ChatResponse, StreamChatRequest
from app.services.chat_history import (
    load_history, save_history, history_to_lc_messages,
    build_user_message, build_assistant_message,
)
from app.streaming import stream_chat_response
from loguru import logger

router = APIRouter(tags=["chat"])


def _extract_result(result: dict) -> tuple[str, list[str], dict | None]:
    """Extract (ai_text, tools_used, plan_data) from agent result."""
    ai_text    = ""
    tools_used = []
    plan_data  = None

    for msg in result.get("messages", []):
        if isinstance(msg, AIMessage) and msg.content:
            ai_text = msg.content
        if hasattr(msg, "tool_calls"):
            for tc in (msg.tool_calls or []):
                tools_used.append(tc.get("name", ""))
        if getattr(msg, "name", None) == "create_travel_plan":
            try:
                parsed = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
                if isinstance(parsed, dict) and parsed.get("plan"):
                    plan_data = parsed
            except (json.JSONDecodeError, TypeError):
                pass

    return ai_text, tools_used, plan_data


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    t0         = time.time()
    session_id = req.session_id or str(uuid.uuid4())

    history  = await load_history(session_id)
    messages = history_to_lc_messages(history) + [HumanMessage(content=req.message)]

    try:
        result = await get_chat_agent().ainvoke({"messages": messages})
    except Exception as e:
        logger.error(f"[/chat] {e}")
        raise HTTPException(status_code=500, detail=str(e))

    ai_text, tools_used, plan_data = _extract_result(result)

    await save_history(session_id, history + [
        build_user_message(req.message),
        build_assistant_message(ai_text, tool_calls=tools_used, has_plan=bool(plan_data)),
    ])
    logger.info(f"[/chat] session={session_id[:8]}… tools={tools_used} "
                f"plan={'yes' if plan_data else 'no'} {int((time.time()-t0)*1000)}ms")

    return ChatResponse(
        session_id=session_id,
        response=ai_text,
        plan=plan_data,
        tool_calls=tools_used,
        duration_ms=int((time.time() - t0) * 1000),
    )


@router.post("/chat/stream")
async def chat_stream(req: StreamChatRequest):
    """Token-by-token streaming via Server-Sent Events.

    Frontend listens with EventSource or fetch+ReadableStream.
    Events: tool_start | token | done | error
    """
    session_id = req.session_id or str(uuid.uuid4())

    history  = await load_history(session_id)
    messages = history_to_lc_messages(history) + [HumanMessage(content=req.message)]

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
