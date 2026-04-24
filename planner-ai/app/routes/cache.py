"""
routes/cache.py — Cache management endpoints.
"""
from fastapi import APIRouter

from app.services.plan_cache import flush_all_plans, flush_plans_by_destination
from app.services.session_manager import flush_all_sessions

router = APIRouter(prefix="/cache", tags=["cache"])


@router.delete("")
async def flush_all():
    """Flush ALL caches: sessions + plans."""
    sessions = await flush_all_sessions()
    plans    = await flush_all_plans()
    return {"deleted": sessions + plans, "sessions": sessions, "plans": plans}


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
