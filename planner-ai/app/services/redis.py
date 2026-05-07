"""
services/redis.py — Redis connection singleton only.
All session/cache logic lives in chat_history.py, plan_cache.py, session_manager.py.
"""
from loguru import logger
import redis.asyncio as aioredis
from app import config

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(config.REDIS_URL, decode_responses=True)
        logger.info("[redis] Client connected")
    return _redis


async def close_redis() -> None:
    """Close the Redis connection gracefully. Called during app shutdown."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        logger.info("[redis] Client closed")
        _redis = None


async def ping_redis() -> bool:
    """Health check: returns True if Redis is reachable."""
    try:
        client = await get_redis()
        return await client.ping()
    except Exception:
        return False
