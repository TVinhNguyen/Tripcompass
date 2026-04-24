"""
services/plan_cache.py — Travel plan caching with granular invalidation.
"""
import json
from app.services.redis import get_redis
from app import config


# ── Read / write ──────────────────────────────────────────────────────────────

async def get_cached_plan(key: str) -> dict | None:
    client = await get_redis()
    raw = await client.get(f"plan:{key}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def cache_plan(key: str, data: dict) -> None:
    client = await get_redis()
    await client.setex(
        f"plan:{key}",
        config.CACHE_TTL,
        json.dumps(data, ensure_ascii=False, default=str),
    )


# ── Granular invalidation ─────────────────────────────────────────────────────

async def _scan_and_delete(pattern: str) -> int:
    """Delete keys matching *pattern* using SCAN (non-blocking, production-safe)."""
    client = await get_redis()
    deleted = 0
    cursor = 0
    while True:
        cursor, keys = await client.scan(cursor, match=pattern, count=100)
        if keys:
            deleted += await client.delete(*keys)
        if cursor == 0:
            break
    return deleted


async def flush_all_plans() -> int:
    """Delete all plan cache keys."""
    return await _scan_and_delete("plan:*")


async def flush_plans_by_destination(destination: str) -> int:
    """Delete plan cache keys for a specific destination."""
    return await _scan_and_delete(f"plan:{destination}:*")

