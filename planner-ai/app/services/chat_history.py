"""
services/chat_history.py — Chat session memory: load, save, smart trim.
"""
import json
from datetime import datetime, timezone
from langchain_core.messages import HumanMessage, AIMessage
from app.services.redis import get_redis
from app.services.session_manager import register_session

CHAT_HISTORY_TTL     = 259_200   # 72h — users plan trips over multiple days
MAX_HISTORY_MESSAGES = 30        # 15 conversation turns


# ── Public API ────────────────────────────────────────────────────────────────

async def load_history(session_id: str) -> list[dict]:
    """Load chat history from Redis. Returns [] if not found or expired."""
    client = await get_redis()
    raw = await client.get(f"chat:{session_id}")
    if not raw:
        return []
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []


async def save_history(
    session_id: str,
    history: list[dict],
    *,
    destination: str | None = None,
) -> None:
    """Persist chat history with TTL. Applies smart trim + updates session metadata."""
    client = await get_redis()
    trimmed = _smart_trim(history)
    await client.setex(
        f"chat:{session_id}",
        CHAT_HISTORY_TTL,
        json.dumps(trimmed, ensure_ascii=False),
    )
    await register_session(session_id, len(trimmed), destination)


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
    """Convert stored dicts → LangChain message objects (role + content only)."""
    msgs = []
    for m in history:
        if m["role"] == "user":
            msgs.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            msgs.append(AIMessage(content=m["content"]))
        # skip system separator rows
    return msgs


# ── Private helpers ───────────────────────────────────────────────────────────

def _smart_trim(history: list[dict], max_messages: int = MAX_HISTORY_MESSAGES) -> list[dict]:
    """Trim history while preserving original user intent (first pair).

    Standard tail-trim loses 'I want Da Nang, 2 people, 3 days'.
    This keeps the first user+assistant pair + a separator + recent messages.
    """
    if len(history) <= max_messages:
        return history
    first_pair = history[:2]
    recent     = history[-(max_messages - 3):]
    separator  = {
        "role": "system",
        "content": "[...cuộc trò chuyện trước đó đã được lược bớt...]",
        "timestamp": _now_iso(),
    }
    return first_pair + [separator] + recent


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
