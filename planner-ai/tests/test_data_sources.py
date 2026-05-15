"""
Tests for app/data_sources/* — DB repositories + API clients.

Each module is exercised through monkeypatched dependencies (DB pool, httpx
client) so the tests verify shape contracts without external services.
"""
import sys
import types

import pytest

# Stub external deps before any app.* import.
fake_config = types.SimpleNamespace(
    DB_SCHEMA="schema_travel",
    DATABASE_URL="postgresql://test/test",
    SERPAPI_KEY="",
    WEATHER_API_KEY="",
    ENABLE_HOTEL_SEARCH=False,
    ENABLE_WEATHER=False,
    MAX_SCHEDULE_RETRIES=1,
    TOOL_TIMEOUT=1,
)
sys.modules.setdefault("app.config", fake_config)

asyncpg_mod = types.ModuleType("asyncpg")
asyncpg_mod.Pool = object
asyncpg_mod.create_pool = lambda *a, **kw: None
httpx_mod = types.ModuleType("httpx")
httpx_mod.AsyncClient = object
httpx_mod.TimeoutException = TimeoutError
httpx_mod.ConnectError = ConnectionError
httpx_mod.ReadError = OSError
httpx_mod.HTTPStatusError = RuntimeError
sys.modules.setdefault("asyncpg", asyncpg_mod)
sys.modules.setdefault("httpx", httpx_mod)

from app.data_sources import combos as combos_mod
from app.data_sources import food as food_mod
from app.data_sources import hotels as hotels_mod
from app.data_sources import places as places_mod
from app.data_sources import weather as weather_mod
from app.services import database as db_mod


class FakePool:
    """Minimal asyncpg pool stub. Returns whatever rows the test queues."""

    def __init__(self, rows):
        self.rows = rows
        self.last_query = None
        self.last_params = None

    async def fetch(self, query, *params):
        self.last_query = query
        self.last_params = params
        return self.rows


# ── places ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_places_maps_rows_to_dict(monkeypatch):
    rows = [
        {
            "id": "p1", "name": "Bà Nà", "destination": "da nang",
            "area": "Hai Chau", "address": "addr",
            "latitude": 16.0, "longitude": 108.0,
            "rating": 4.5, "must_visit": True, "priority_score": 90,
            "best_time_of_day": "morning", "tags": ["nature"],
            "open_time": "08:00:00", "close_time": "17:00:00",
            "hours": None, "recommended_duration": 120,
            "base_price": 750_000, "price_updated_at": "2026-04-01",
        },
    ]
    pool = FakePool(rows)

    async def get_pool():
        return pool

    monkeypatch.setattr(places_mod, "get_pool", get_pool)

    result = await places_mod.fetch_places(destination="đà nẵng", tags=["nature"])

    assert result["success"] is True
    assert result["count"] == 1
    p = result["places"][0]
    assert p["id"] == "p1"
    assert p["hours"] == "08:00-17:00"     # derived from open_time/close_time
    assert p["base_price"] == 750_000
    assert p["is_stale"] is False


@pytest.mark.asyncio
async def test_fetch_places_returns_error_on_db_exception(monkeypatch):
    class BoomPool:
        async def fetch(self, *args, **kwargs):
            raise RuntimeError("db down")

    async def get_pool():
        return BoomPool()

    monkeypatch.setattr(places_mod, "get_pool", get_pool)

    result = await places_mod.fetch_places(destination="đà nẵng")

    assert result["success"] is False
    assert "db down" in result["error"]
    assert result["places"] == []


# ── food ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_food_venues_filters_by_tags(monkeypatch):
    rows = [
        {
            "id": "f1", "name": "Bún chả", "destination": "ha noi",
            "area": "", "address": "", "latitude": None, "longitude": None,
            "rating": 4.2, "must_visit": False, "priority_score": 50,
            "best_time_of_day": "lunch", "tags": ["street_food"],
            "open_time": "06:00:00", "close_time": "21:00:00",
            "hours": "06:00-21:00", "recommended_duration": 60,
            "base_price": 80_000,
        },
    ]
    pool = FakePool(rows)

    async def get_pool():
        return pool

    monkeypatch.setattr(food_mod, "get_pool", get_pool)

    result = await food_mod.fetch_food_venues(destination="hà nội", tags=["street_food"])

    assert result["success"] is True
    assert result["food"][0]["hours"] == "06:00-21:00"
    # tags param must be appended to query params (CASE WHEN tags && ...)
    assert ["street_food"] in pool.last_params


# ── combos ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_combos_maps_rows(monkeypatch):
    rows = [
        {
            "id": "c1", "name": "City combo", "destination": "da nang",
            "cover_image": "img.jpg", "provider": "ACME",
            "price_per_person": 1_200_000, "includes": ["transport"],
            "benefits": ["guide"], "duration_days": 2,
            "requires_overnight": True, "book_url": "https://x",
        },
    ]
    pool = FakePool(rows)

    async def get_pool():
        return pool

    monkeypatch.setattr(combos_mod, "get_pool", get_pool)

    result = await combos_mod.fetch_combos(destination="đà nẵng")

    assert result["success"] is True
    assert result["combos"][0]["price_per_person"] == 1_200_000


# ── weather ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_weather_uses_static_when_no_api_key():
    # config.WEATHER_API_KEY is "" via the module-level stub above, so the
    # static climate path is forced.
    result = await weather_mod.fetch_weather(destination="đà nẵng", month=4)

    assert result["success"] is True
    assert result["source"] == "static"
    assert result["temp_c"] == 28
    assert "tip" in result


@pytest.mark.asyncio
async def test_fetch_weather_unknown_destination_falls_back_to_default():
    result = await weather_mod.fetch_weather(destination="unknown-city", month=7)

    assert result["success"] is True
    assert result["source"] == "static"
    # Falls through to neutral default {temp_c: 27, rain_chance: 30, ...}
    assert result["temp_c"] == 27


# ── hotels ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_hotels_returns_disabled_when_serpapi_missing():
    result = await hotels_mod.search_hotels_data(
        destination="Đà Nẵng",
        checkin="2026-05-01",
        checkout="2026-05-03",
        budget_tier="standard",
    )

    # SERPAPI_KEY="" via stub → short-circuit return.
    assert result["success"] is False
    assert result["hotels"] == []
