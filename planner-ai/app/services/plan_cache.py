"""
services/plan_cache.py — Travel plan caching with granular invalidation.
"""
import hashlib
import json
from typing import Any

from app.services.redis import get_redis
from app.services.normalize import (
    extract_required_places,
    normalize_destination,
    normalize_preferences,
    normalize_required_places,
)
from app import config

CACHE_KEY_VERSION = "v2"
PLAN_CACHE_PREFIX = f"plan:{CACHE_KEY_VERSION}:"


def _get(request: Any, name: str, default: Any = None) -> Any:
    return getattr(request, name, default)


def _hash_payload(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def destination_cache_scope(destination: str) -> str:
    """Stable destination scope used for granular cache invalidation."""
    normalized = normalize_destination(destination)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def build_plan_cache_key(request: Any) -> str:
    """Build a collision-resistant key from all plan-affecting request fields."""
    destination = normalize_destination(request.destination)
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
        "preferences": normalize_preferences(getattr(request, "preferences", None)),
        # raw_input is excluded from the key directly (free-text, hurts hit rate),
        # but it semantically affects the plan via extract_required_places().
        # Merge both sources here so two requests with identical structured
        # fields but different raw_input ("phải có: Cầu Vàng" vs "phải có:
        # Chợ Hàn") produce distinct cache keys. Sorted for order-stability.
        "required_places": sorted(normalize_required_places([
            *(getattr(request, "required_places", []) or []),
            *extract_required_places(getattr(request, "raw_input", None)),
        ])),
        "need_hotel": getattr(request, "need_hotel", True),
        "need_flight": getattr(request, "need_flight", False),
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
    return await _scan_and_delete(f"{PLAN_CACHE_PREFIX}*")


async def flush_plans_by_destination(destination: str) -> int:
    """Delete plan cache keys for a specific destination."""
    return await _scan_and_delete(f"plan:{CACHE_KEY_VERSION}:{destination_cache_scope(destination)}:*")


async def delete_plan_cache_key(key: str) -> int:
    """Delete one plan cache key. Refuse non-plan keys for safety."""
    if not key.startswith(PLAN_CACHE_PREFIX):
        return 0
    client = await get_redis()
    return await client.delete(key)


def _format_bytes(n: int) -> str:
    unit = 1024
    if n < unit:
        return f"{n} B"
    value = float(n)
    for suffix in ["KB", "MB", "GB", "TB"]:
        value /= unit
        if value < unit:
            return f"{value:.1f} {suffix}"
    return f"{value:.1f} PB"


def _ttl_score(ttl_seconds: int) -> float:
    if ttl_seconds <= 0 or config.CACHE_TTL <= 0:
        return 0.0
    return min(1.0, ttl_seconds / config.CACHE_TTL)


def _field(payload: dict[str, Any], name: str) -> str:
    value = payload.get(name)
    return value.strip() if isinstance(value, str) else ""


def _nested_field(payload: dict[str, Any], parent: str, child: str) -> str:
    value = payload.get(parent)
    if isinstance(value, dict):
        return _field(value, child)
    return ""


def _describe_plan_entry(key: str, raw: str | None) -> str:
    if raw:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {}
        if isinstance(payload, dict):
            destination = (
                _field(payload, "destination")
                or _nested_field(payload, "plan", "destination")
                or _nested_field(payload, "final_plan", "destination")
            )
            if destination:
                return f"planner-ai plan: {destination}"

    short_key = key[-18:] if len(key) > 18 else key
    return f"planner-ai cache {short_key}"


async def list_plan_cache(limit: int = 100) -> dict[str, Any]:
    """Return read-only stats for plan cache entries."""
    client = await get_redis()
    entries: list[dict[str, Any]] = []
    total_entries = 0
    total_bytes = 0
    ttl_total = 0
    ttl_count = 0
    cursor = 0

    while True:
        cursor, keys = await client.scan(cursor, match=f"{PLAN_CACHE_PREFIX}*", count=100)
        for key in keys:
            total_entries += 1

            size = await client.strlen(key)
            total_bytes += size

            ttl_seconds = await client.ttl(key)
            if ttl_seconds > 0:
                ttl_total += ttl_seconds
                ttl_count += 1

            if len(entries) < limit:
                raw = await client.get(key)
                entries.append({
                    "id": key,
                    "key": key,
                    "query": _describe_plan_entry(key, raw),
                    "source": "planner-ai",
                    "hits": 0,
                    "last_used": "Không theo dõi",
                    "size": _format_bytes(size),
                    "size_bytes": size,
                    "score": _ttl_score(ttl_seconds),
                    "ttl_seconds": ttl_seconds,
                })

        if cursor == 0:
            break

    return {
        "stats": {
            "hit_rate": 0,
            "total_entries": total_entries,
            "total_bytes": total_bytes,
            "tokens_saved": 0,
            "avg_response_ms": 0,
            "avg_ttl_seconds": ttl_total // ttl_count if ttl_count else 0,
        },
        "queries": entries,
    }
