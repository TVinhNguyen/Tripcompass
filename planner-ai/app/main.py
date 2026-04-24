"""
main.py — FastAPI application entry point.

Endpoints live in app/routes/. This file only handles:
  - App + lifespan setup
  - Router registration
  - /health
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.services.database import get_pool, close_pool
from app.services.redis import get_redis, close_redis, ping_redis
from app.routes.chat     import router as chat_router
from app.routes.plan     import router as plan_router
from app.routes.sessions import router as sessions_router
from app.routes.cache    import router as cache_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_redis()
    yield
    await close_redis()
    await close_pool()


app = FastAPI(
    title="Planner AI",
    description="Conversational travel agent for Vietnam",
    version="2.0.0",
    lifespan=lifespan,
)

app.include_router(chat_router)
app.include_router(plan_router)
app.include_router(sessions_router)
app.include_router(cache_router)


@app.get("/health")
async def health():
    redis_ok = await ping_redis()
    status = "ok" if redis_ok else "degraded"
    return {
        "status": status,
        "service": "planner-ai",
        "version": "2.0.0",
        "redis": "connected" if redis_ok else "disconnected",
    }
