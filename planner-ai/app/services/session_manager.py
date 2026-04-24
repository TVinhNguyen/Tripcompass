"""
services/session_manager.py — Session metadata: index, list, delete.
"""
import json
from datetime import datetime, timezone
from app.services.redis import get_redis

SESSION_INDEX_KEY = "sessions:index"
SESSION_TTL       = 259_200  # 72h — mirrors CHAT_HISTORY_TTL
INDEX_TTL         = 345_600  # 96h — buffer beyond session TTL


# ── Registration & metadata ───────────────────────────────────────────────────

async def register_session(
    session_id: str,
    message_count: int,
    destination: str | None = None,
) -> None:
    """Upsert session metadata and add to index."""
    client = await get_redis()
    meta_key = f"session:meta:{session_id}"

    existing_raw = await client.get(meta_key)
    if existing_raw:
        try:
            meta = json.loads(existing_raw)
        except json.JSONDecodeError:
            meta = {}
    else:
        meta = {"created_at": _now_iso()}

    meta["last_active"]   = _now_iso()
    meta["message_count"] = message_count
    if destination:
        meta["destination"] = destination

    await client.setex(meta_key, SESSION_TTL, json.dumps(meta, ensure_ascii=False))
    await client.sadd(SESSION_INDEX_KEY, session_id)
    # Refresh TTL on the index so it doesn't live forever
    await client.expire(SESSION_INDEX_KEY, INDEX_TTL)


async def get_session_meta(session_id: str) -> dict | None:
    client = await get_redis()
    raw = await client.get(f"session:meta:{session_id}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


# ── List & delete ─────────────────────────────────────────────────────────────

async def list_sessions() -> list[dict]:
    """Return all active sessions with their metadata."""
    client = await get_redis()
    session_ids = await client.smembers(SESSION_INDEX_KEY)
    result = []
    for sid in sorted(session_ids):
        meta = await get_session_meta(sid)
        if meta:
            result.append({"session_id": sid, **meta})
        else:
            # Expired — clean up index
            await client.srem(SESSION_INDEX_KEY, sid)
    return result


async def delete_session(session_id: str) -> bool:
    """Delete a session's history + metadata. Returns True if found."""
    client = await get_redis()
    deleted = await client.delete(
        f"chat:{session_id}",
        f"session:meta:{session_id}",
    )
    await client.srem(SESSION_INDEX_KEY, session_id)
    return deleted > 0


async def flush_all_sessions() -> int:
    """Delete all chat + metadata keys using SCAN (non-blocking)."""
    client = await get_redis()
    deleted = 0
    for pattern in ("chat:*", "session:meta:*"):
        cursor = 0
        while True:
            cursor, keys = await client.scan(cursor, match=pattern, count=100)
            if keys:
                deleted += await client.delete(*keys)
            if cursor == 0:
                break
    await client.delete(SESSION_INDEX_KEY)
    return deleted


async def cleanup_stale_sessions() -> int:
    """Remove expired session IDs from the index SET.

    Call periodically (e.g. on /sessions list) to keep the index tidy.
    """
    client = await get_redis()
    session_ids = await client.smembers(SESSION_INDEX_KEY)
    removed = 0
    for sid in session_ids:
        exists = await client.exists(f"session:meta:{sid}")
        if not exists:
            await client.srem(SESSION_INDEX_KEY, sid)
            removed += 1
    return removed


# ── Helper ────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
