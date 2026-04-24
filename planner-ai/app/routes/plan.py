"""
routes/plan.py — POST /plan endpoint (structured travel planning).
"""
import json
import time
import uuid
from fastapi import APIRouter, HTTPException
from loguru import logger

from app.schemas import PlanRequest, PlanResponse
from app.services.plan_cache import get_cached_plan, cache_plan

router = APIRouter(tags=["plan"])


@router.post("/plan", response_model=PlanResponse)
async def generate_plan(req: PlanRequest):
    t0         = time.time()
    session_id = str(uuid.uuid4())
    cache_key  = f"{req.destination}:{req.num_days}:{req.guest_count}:{req.budget_vnd}:{req.start_date}"

    # Cache hit
    cached = await get_cached_plan(cache_key)
    if cached:
        logger.info(f"[/plan] cache HIT key={cache_key!r}")
        return PlanResponse(
            session_id=session_id, destination=req.destination,
            budget_tier=cached.get("budget_tier", "standard"),
            final_plan=cached.get("plan", {}),
            budget_breakdown=cached.get("budget_breakdown", {}),
            warnings=["Kết quả từ cache."], violations=[],
            validation_passed=True, duration_ms=int((time.time()-t0)*1000), cache_hit=True,
        )

    # Call tool directly
    from app.tools.create_plan import create_travel_plan
    try:
        result_json = await create_travel_plan.ainvoke({
            "destination": req.destination,
            "num_days":    req.num_days,
            "budget_vnd":  req.budget_vnd or 0,
            "guest_count": req.guest_count,
            "start_date":  req.start_date,
            "end_date":    req.end_date,
        })
        result = json.loads(result_json)
    except Exception as e:
        logger.error(f"[/plan] {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if result.get("success") and result.get("plan"):
        await cache_plan(cache_key, result)

    logger.info(f"[/plan] dest={req.destination} {int((time.time()-t0)*1000)}ms")
    return PlanResponse(
        session_id=session_id,
        destination=result.get("destination", req.destination),
        budget_tier=result.get("budget_tier", "standard"),
        final_plan=result.get("plan", {}),
        budget_breakdown=result.get("budget_breakdown", {}),
        warnings=result.get("warnings", []),
        violations=result.get("violations", []),
        validation_passed=result.get("validation_passed", False),
        duration_ms=int((time.time() - t0) * 1000),
        cache_hit=False,
    )
