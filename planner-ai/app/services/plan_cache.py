"""
services/plan_cache.py — Travel plan caching with granular invalidation.
"""
import hashlib
import json
from typing import Any

from app.services.redis import get_redis
from app import config

CACHE_KEY_VERSION = "v2"


# ── Key building ──────────────────────────────────────────────────────────────

def _normalize_destination(destination: str) -> str:
    return " ".join((destination or "").strip().lower().split())


def _normalize_preferences(preferences: list[str] | None) -> list[str]:
    return sorted({
        str(pref).strip().lower()
        for pref in (preferences or [])
        if str(pref).strip()
    })


def _get(request: Any, name: str, default: Any = None) -> Any:
    return getattr(request, name, default)


def _hash_payload(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def destination_cache_scope(destination: str) -> str:
    """Stable destination scope used for granular cache invalidation."""
    normalized = _normalize_destination(destination)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def build_plan_cache_key(request: Any) -> str:
    """Build a collision-resistant key from all plan-affecting request fields."""
    destination = _normalize_destination(request.destination)
    payload = {
        "version": CACHE_KEY_VERSION,
        "destination": destination,
        "num_days": request.num_days,
        "guest_count": request.guest_count,
        "budget_vnd": request.budget_vnd or 0,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "travel_style": _get(request, "travel_style"),
        "arrival_time": _get(request, "arrival_time"),
        "departure_time": _get(request, "departure_time"),
        "daily_start_time": _get(request, "daily_start_time"),
        "daily_end_time": _get(request, "daily_end_time"),
        "time_strictness": _get(request, "time_strictness", "balanced"),
        "preferences": _normalize_preferences(getattr(request, "preferences", None)),
        "need_hotel": getattr(request, "need_hotel", True),
        "need_flight": getattr(request, "need_flight", False),
        "raw_input": getattr(request, "raw_input", None),
        "llm_provider": config.LLM_PROVIDER,
        "llm_model": config.LLM_MODEL,
        "prompt_version": "schedule-v2-flex-time/enrich-v1",
    }
    return f"{CACHE_KEY_VERSION}:{destination_cache_scope(destination)}:{_hash_payload(payload)}"


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
    return await _scan_and_delete(f"plan:{CACHE_KEY_VERSION}:{destination_cache_scope(destination)}:*")
