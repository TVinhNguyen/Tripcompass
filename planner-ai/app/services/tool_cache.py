"""
services/tool_cache.py — Redis-backed cache for deterministic tool calls.

Applied only to tools that return the same JSON given the same args within a
short window (places / food / combos / weather). NOT applied to time-sensitive
tools (hotels / flights / real prices / create_travel_plan).
"""
import hashlib
import json
from functools import wraps
from typing import Callable

from loguru import logger

from app.services.redis import get_redis

DEFAULT_TTL = 300  # 5 minutes — long enough to dedupe within a chat session,
                   # short enough that DB updates surface quickly.


def cached_tool(ttl: int = DEFAULT_TTL) -> Callable:
    """Cache a tool's JSON-string output in Redis keyed by (tool_name, kwargs).

    Tools wrapped by `@tool` from LangChain are async functions returning a
    JSON string. The cache key is a SHA256 digest of the kwargs so identical
    calls within ``ttl`` seconds skip the underlying DB / HTTP fetch.

    Redis failures are non-fatal: on read error we just call through; on write
    error we still return the fresh result. The cache is a perf optimisation,
    not a correctness boundary.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(**kwargs):
            try:
                payload = (
                    f"{func.__name__}:"
                    + json.dumps(kwargs, sort_keys=True, ensure_ascii=False, default=str)
                )
                digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]
                cache_key = f"toolcache:{func.__name__}:{digest}"
            except Exception as exc:
                logger.warning(f"[tool-cache] key build failed for {func.__name__}: {exc}")
                return await func(**kwargs)

            try:
                client = await get_redis()
                cached = await client.get(cache_key)
                if cached is not None:
                    logger.info(f"[tool-cache] HIT {func.__name__} key={digest}")
                    return cached
            except Exception as exc:
                logger.warning(f"[tool-cache] read failed for {func.__name__}: {exc}")
                return await func(**kwargs)

            result = await func(**kwargs)

            if isinstance(result, str):
                try:
                    await client.setex(cache_key, ttl, result)
                    logger.debug(f"[tool-cache] MISS→stored {func.__name__} key={digest}")
                except Exception as exc:
                    logger.warning(f"[tool-cache] write failed for {func.__name__}: {exc}")
            return result

        return wrapper

    return decorator
