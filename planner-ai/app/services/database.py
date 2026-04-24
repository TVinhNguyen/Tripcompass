"""
services/database.py — asyncpg connection pool.
Single pool shared across all requests.
"""
import asyncpg
from loguru import logger
from app import config

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            config.DATABASE_URL,
            min_size=2,
            max_size=10,
        )
        logger.info("[db] Connection pool created")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("[db] Connection pool closed")
