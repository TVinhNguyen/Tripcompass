"""
db.py — backward-compat re-export.
All new code should import from app.services.database instead.
"""
from app.services.database import get_pool, close_pool

__all__ = ["get_pool", "close_pool"]
