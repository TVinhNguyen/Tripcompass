"""
main.py — FastAPI application entry point.

Endpoints live in app/routes/. This file only handles:
  - App + lifespan setup
  - Router registration
  - /health
"""
import os
import sys
import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.services.database import get_pool, close_pool
from app.services.redis import get_redis, close_redis, ping_redis
from app.routes.chat     import router as chat_router
from app.routes.plan     import router as plan_router
from app.routes.cache    import router as cache_router


_request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


def current_request_id() -> str:
    return _request_id_var.get()


def _configure_logging() -> None:
    """Single sink, JSON output when running in Docker, level from env."""
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    serialize = os.environ.get("LOG_FORMAT", "json").lower() == "json"
    logger.remove()
    logger.add(
        sys.stderr,
        level=level,
        serialize=serialize,
        backtrace=False,
        diagnose=False,
        enqueue=False,
    )


_configure_logging()


def _cors_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    return [o.strip() for o in raw.split(",") if o.strip()]


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Inject the current request_id into every loguru record. Logs include the
# field automatically when the global format references {extra[request_id]}.
logger.configure(
    extra={"request_id": "-"},
    patcher=lambda record: record["extra"].update(request_id=current_request_id()),
)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
    token = _request_id_var.set(rid)
    try:
        response = await call_next(request)
    finally:
        _request_id_var.reset(token)
    response.headers["X-Request-Id"] = rid
    return response

app.include_router(chat_router)
app.include_router(plan_router)
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
