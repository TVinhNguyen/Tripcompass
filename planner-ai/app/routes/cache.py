"""
routes/cache.py — Admin endpoints for flushing Redis working memory.

Manages two cache categories:
  - Sessions: chat history (chat:*) + session metadata (session:meta:*) in Redis.
    These are planner-ai's own working memory, NOT Go/Postgres user sessions.
  - Plans: cached plan results keyed by destination + parameters.
"""
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app import config
from app.services.plan_cache import (
    PLAN_CACHE_PREFIX,
    delete_plan_cache_key,
    flush_all_plans,
    flush_plans_by_destination,
    list_plan_cache,
)
from app.services.session_manager import flush_all_sessions


# Known placeholder values that must never gate a real admin endpoint (F2).
_WEAK_TOKENS = {"change-me", "changeme", "secret", "admin", "token", "test"}


def require_cache_admin(x_admin_token: str | None = Header(default=None)) -> None:
    token = config.CACHE_ADMIN_TOKEN.strip()
    if not token or token.lower() in _WEAK_TOKENS or len(token) < 16:
        # Treat a missing OR weak/default token as "not configured" so the admin
        # surface stays closed until a strong random token is set.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CACHE_ADMIN_TOKEN is not configured with a strong value.",
        )
    if not x_admin_token or not secrets.compare_digest(x_admin_token, token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid admin token.")


router = APIRouter(prefix="/cache", tags=["cache"], dependencies=[Depends(require_cache_admin)])


@router.get("/stats")
async def cache_stats():
    """Return read-only plan cache stats for the admin dashboard."""
    return await list_plan_cache()


@router.delete("/key")
async def delete_cache_key(key: str = Query(..., min_length=1)):
    """Delete one plan cache key."""
    if not key.startswith(PLAN_CACHE_PREFIX):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only plan cache keys can be deleted.")
    deleted = await delete_plan_cache_key(key)
    return {"deleted": deleted, "key": key}


@router.delete("")
async def flush_all():
    """Flush ALL Redis working memory: chat history + session metadata + plan caches."""
    sessions = await flush_all_sessions()
    plans    = await flush_all_plans()
    return {"deleted": sessions + plans, "chat_sessions": sessions, "plans": plans}


@router.delete("/plans")
async def flush_plans():
    """Flush plan caches only. Chat sessions untouched."""
    n = await flush_all_plans()
    return {"deleted": n, "message": f"Flushed {n} plan cache keys"}


@router.delete("/plans/{destination}")
async def flush_plans_for_destination(destination: str):
    """Flush plan cache for a specific destination."""
    n = await flush_plans_by_destination(destination)
    return {"deleted": n, "destination": destination}
