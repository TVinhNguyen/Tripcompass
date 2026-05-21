"""
config/database.py — Postgres + Redis connection strings and cache knobs.

Loaded after env.py so os.environ already contains .env values.
"""
import os

# Postgres (shared with the Go backend's schema)
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@postgres:5432/tripcompass",
)
DB_SCHEMA = os.environ.get("DB_SCHEMA", "schema_travel")

# Redis (shared with the Go backend)
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")

# Cache TTL applied to /plan generations (cache.py) and tool outputs
# (services/tool_cache.py). Long enough to dedupe within a chat session,
# short enough that DB updates surface quickly.
CACHE_TTL = int(os.environ.get("CACHE_TTL_SECONDS", "3600"))

# Optional shared secret for the admin DELETE /admin/planner/cache route.
# Empty string ⇒ route returns 503 (disabled) until a token is configured.
CACHE_ADMIN_TOKEN = os.environ.get("CACHE_ADMIN_TOKEN", "")
