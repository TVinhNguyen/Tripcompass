"""
services/chat_history.py — Chat session memory with rolling LLM-summary.

Two Redis keys per session:
  chat:{sid}          → JSON list of the most recent MAX_RECENT messages
  chat:summary:{sid}  → plain-text rolling summary of everything older

When the session exceeds SUMMARY_THRESHOLD messages, the older portion is
condensed into the summary via a background LLM call. The recent portion is
kept verbatim. On the next load the summary is prepended as a marked
HumanMessage so the LLM has long-term context without paying for every old
turn token-by-token.

This replaces the hard `_smart_trim` cutoff that silently dropped the middle
of long planning conversations.
"""
import asyncio
import json
from datetime import datetime, timezone
from langchain_core.messages import HumanMessage, AIMessage
from loguru import logger

from app.services.redis import get_redis
from app.services.session_manager import register_session

CHAT_HISTORY_TTL    = 259_200   # 72h — users plan trips over multiple days
MAX_RECENT          = 12        # messages kept verbatim
SUMMARY_THRESHOLD   = 16        # trigger background summarisation past this


_SUMMARY_PROMPT = (
    "Tóm tắt cuộc trò chuyện sau giữa user và TripCompass AI thành 1 đoạn "
    "ngắn 5-10 dòng tiếng Việt. GIỮ LẠI:\n"
    "- Destination, ngày đi, số người, ngân sách\n"
    "- Sở thích / yêu cầu cụ thể của user\n"
    "- Các quyết định đã thống nhất, lịch trình đã chốt (nếu có)\n"
    "Bỏ qua chào hỏi, lời cảm ơn, câu hỏi nhỏ không ảnh hưởng kế hoạch.\n\n"
    "CUỘC TRÒ CHUYỆN:\n{conversation}\n\nTÓM TẮT:"
)

# Strong-ref store so background summarisation tasks aren't garbage-collected
# mid-flight (Python's asyncio only holds weak refs to tasks).
_pending_summaries: set[asyncio.Task] = set()


# ── Public API ────────────────────────────────────────────────────────────────

async def load_history(session_id: str) -> list[dict]:
    """Return recent history with rolling summary prepended (if any)."""
    client = await get_redis()
    raw = await client.get(f"chat:{session_id}")
    try:
        history = json.loads(raw) if raw else []
    except json.JSONDecodeError:
        history = []

    summary = await client.get(f"chat:summary:{session_id}")
    if summary:
        history = [{
            "role":      "summary",
            "content":   summary,
            "timestamp": _now_iso(),
        }] + history
    return history


async def save_history(
    session_id: str,
    history: list[dict],
    *,
    destination: str | None = None,
) -> None:
    """Persist chat history. If over threshold, fire background summarisation.

    The recent slice is written synchronously so the next request sees it
    immediately. Summarisation runs in the background — the request that
    triggered it doesn't pay the latency cost; the *next* request benefits.
    """
    # Drop any synthetic "summary" rows the route may have re-injected so we
    # never persist them as part of the message list.
    history = [m for m in history if m.get("role") != "summary"]

    client = await get_redis()

    if len(history) > SUMMARY_THRESHOLD:
        to_summarise = history[:-MAX_RECENT]
        recent = history[-MAX_RECENT:]
        existing_summary = await client.get(f"chat:summary:{session_id}")

        await client.setex(
            f"chat:{session_id}",
            CHAT_HISTORY_TTL,
            json.dumps(recent, ensure_ascii=False),
        )

        task = asyncio.create_task(
            _summarise_async(session_id, to_summarise, existing_summary)
        )
        _pending_summaries.add(task)
        task.add_done_callback(_pending_summaries.discard)
    else:
        await client.setex(
            f"chat:{session_id}",
            CHAT_HISTORY_TTL,
            json.dumps(history, ensure_ascii=False),
        )
        # Touch summary TTL if it exists so it doesn't expire while the user
        # is still actively chatting below the threshold.
        if await client.exists(f"chat:summary:{session_id}"):
            await client.expire(f"chat:summary:{session_id}", CHAT_HISTORY_TTL)

    await register_session(session_id, len(history), destination)


def build_user_message(content: str) -> dict:
    return {"role": "user", "content": content, "timestamp": _now_iso()}


def build_assistant_message(
    content: str,
    tool_calls: list[str] | None = None,
    has_plan: bool = False,
) -> dict:
    msg: dict = {"role": "assistant", "content": content, "timestamp": _now_iso()}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    if has_plan:
        msg["has_plan"] = True
    return msg


def history_to_lc_messages(history: list[dict]) -> list:
    """Convert stored dicts → LangChain message objects.

    `summary` rows are inlined as a HumanMessage with an explicit marker so
    the LLM treats them as background context, not as the user's latest turn.
    Legacy `system` separator rows (from the old smart_trim era) are dropped.
    """
    msgs = []
    for m in history:
        role = m.get("role")
        content = m.get("content", "")
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            msgs.append(AIMessage(content=content))
        elif role == "summary":
            msgs.append(HumanMessage(
                content=f"[TÓM TẮT CUỘC TRÒ CHUYỆN TRƯỚC ĐÓ]\n{content}"
            ))
        # `system` rows from legacy data are intentionally skipped.
    return msgs


# ── Private helpers ───────────────────────────────────────────────────────────

async def _summarise_async(
    session_id: str,
    messages: list[dict],
    existing_summary: str | None,
) -> None:
    """Background rolling summarisation. Failures log and exit — never raise."""
    try:
        from app.config import get_llm
        from app.streaming.helpers import _content_to_text

        lines: list[str] = []
        if existing_summary:
            lines.append(f"[Tóm tắt trước đó]\n{existing_summary}\n")
        for m in messages:
            role = (m.get("role") or "user").upper()
            content = m.get("content", "")
            if not content:
                continue
            lines.append(f"{role}: {content}")
        conversation = "\n".join(lines)
        if not conversation.strip():
            return

        prompt = _SUMMARY_PROMPT.format(conversation=conversation)
        response = await get_llm().ainvoke([HumanMessage(content=prompt)])
        summary = _content_to_text(response.content).strip()

        if summary:
            client = await get_redis()
            await client.setex(f"chat:summary:{session_id}", CHAT_HISTORY_TTL, summary)
            logger.info(
                f"[chat-summary] session={session_id[:8]} "
                f"summarised={len(messages)} msgs → {len(summary)} chars"
            )
    except Exception as exc:
        logger.warning(f"[chat-summary] failed for {session_id[:8]}: {exc}")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
