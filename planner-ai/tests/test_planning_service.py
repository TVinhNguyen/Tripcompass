"""
Tests for the shared planning service and its route/tool wrappers.

These tests monkeypatch DB/LLM/tool calls so they verify contracts without
requiring external services.
"""
import json
import importlib
import sys
import types

import pytest

fake_config = types.SimpleNamespace(
    CACHE_TTL=3600,
    DATABASE_URL="postgresql://test/test",
    DB_SCHEMA="schema_travel",
    ENABLE_FLIGHT_SEARCH=False,
    ENABLE_HOTEL_SEARCH=False,
    ENABLE_REAL_PRICES=False,
    ENABLE_WEATHER=False,
    LLM_MODEL="test-model",
    LLM_PROVIDER="test",
    MAX_SCHEDULE_RETRIES=1,
    REDIS_URL="redis://test",
    SERPAPI_KEY="",
    TOOL_TIMEOUT=1,
    WEATHER_API_KEY="",
    llm=None,
)
sys.modules.setdefault("app.config", fake_config)

asyncpg_mod = types.ModuleType("asyncpg")
asyncpg_mod.Pool = object
asyncpg_mod.create_pool = lambda *args, **kwargs: None
redis_mod = types.ModuleType("redis")
redis_asyncio_mod = types.ModuleType("redis.asyncio")
redis_asyncio_mod.Redis = object
redis_asyncio_mod.from_url = lambda *args, **kwargs: None
httpx_mod = types.ModuleType("httpx")
httpx_mod.AsyncClient = object
fastapi_mod = types.ModuleType("fastapi")


class FakeAPIRouter:
    def __init__(self, *args, **kwargs):
        pass

    def post(self, *args, **kwargs):
        return lambda func: func


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


fastapi_mod.APIRouter = FakeAPIRouter
fastapi_mod.HTTPException = FakeHTTPException
sys.modules.setdefault("asyncpg", asyncpg_mod)
sys.modules.setdefault("fastapi", fastapi_mod)
sys.modules.setdefault("httpx", httpx_mod)
sys.modules.setdefault("redis", redis_mod)
sys.modules.setdefault("redis.asyncio", redis_asyncio_mod)


class FakeStructuredTool:
    def __init__(self, func):
        self.func = func
        self.name = func.__name__

    async def ainvoke(self, args):
        return await self.func(**args)


tools_mod = types.ModuleType("langchain_core.tools")
tools_mod.tool = lambda func: FakeStructuredTool(func)
messages_mod = types.ModuleType("langchain_core.messages")
messages_mod.SystemMessage = lambda content: types.SimpleNamespace(content=content)
messages_mod.HumanMessage = lambda content: types.SimpleNamespace(content=content)
sys.modules.setdefault("langchain_core", types.ModuleType("langchain_core"))
sys.modules.setdefault("langchain_core.tools", tools_mod)
sys.modules.setdefault("langchain_core.messages", messages_mod)

from app.schemas import PlanRequest
from app.services import planning_service
from app.tools import create_plan
from app.routes import plan as plan_route


class FakeTool:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def ainvoke(self, args):
        self.calls.append(args)
        return json.dumps(self.payload, ensure_ascii=False)


@pytest.mark.asyncio
async def test_generate_travel_plan_returns_dict_and_passes_preferences(monkeypatch):
    places_tool = FakeTool({
        "places": [
            {"id": "p1", "name": "Museum", "hours": "08:00-17:00", "base_price": 10_000},
        ],
    })
    food_tool = FakeTool({
        "food": [
            {"id": "f1", "name": "Noodles", "hours": "06:00-21:00", "base_price": 50_000},
        ],
    })
    weather_tool = FakeTool({"success": True, "month": 5, "rain_chance": 20})
    combos_tool = FakeTool({
        "combos": [
            {"id": "c1", "name": "City combo", "price_per_person": 300_000},
        ],
    })
    schedule_states = []

    async def resolve_destination(destination):
        return {
            "destination_id": "da nang",
            "destination_name": "Da Nang",
            "resolve_method": "exact",
            "warnings": ["resolve warning"],
        }

    def node_budget(state):
        return {
            "budget_tier": "standard",
            "attr_budget": 1_000_000,
            "food_budget": 500_000,
            "hotel_budget_per_night": 800_000,
            "warnings": state.get("warnings", []),
        }

    async def node_schedule(state):
        schedule_states.append(state)
        return {
            "draft_schedule": {"days": [{"day_num": 1, "slots": []}]},
            "schedule_version": state.get("schedule_version", 0) + 1,
            "violations": [],
            "validation_passed": False,
            "warnings": state.get("warnings", []),
        }

    def node_validate(state):
        return {"validation_passed": True, "violations": []}

    async def node_enrich(state):
        return {
            "final_plan": state["draft_schedule"],
            "warnings": state.get("warnings", []),
        }

    resolve_mod = importlib.import_module("app.nodes.resolve")
    places_mod = importlib.import_module("app.tools.get_places")
    food_mod = importlib.import_module("app.tools.get_food_venues")
    weather_mod = importlib.import_module("app.tools.get_weather")
    combos_mod = importlib.import_module("app.tools.get_combos")
    budget_mod = importlib.import_module("app.nodes.budget")
    schedule_mod = importlib.import_module("app.nodes.schedule")
    validate_mod = importlib.import_module("app.nodes.validate")
    enrich_mod = importlib.import_module("app.nodes.enrich")

    monkeypatch.setattr(resolve_mod, "resolve_destination", resolve_destination)
    monkeypatch.setattr(places_mod, "get_places", places_tool)
    monkeypatch.setattr(food_mod, "get_food_venues", food_tool)
    monkeypatch.setattr(weather_mod, "get_weather", weather_tool)
    monkeypatch.setattr(combos_mod, "get_combos", combos_tool)
    monkeypatch.setattr(budget_mod, "node_budget", node_budget)
    monkeypatch.setattr(schedule_mod, "node_schedule", node_schedule)
    monkeypatch.setattr(validate_mod, "node_validate", node_validate)
    monkeypatch.setattr(enrich_mod, "node_enrich", node_enrich)

    result = await planning_service.generate_travel_plan(
        destination="Da Nang",
        num_days=1,
        budget_vnd=2_000_000,
        guest_count=2,
        start_date="2026-05-01",
        preferences=[" Food ", "culture", "food"],
        need_hotel=False,
    )

    assert result["success"] is True
    assert result["destination"] == "Da Nang"
    assert result["budget_tier"] == "standard"
    assert result["plan"] == {"days": [{"day_num": 1, "slots": []}]}
    assert result["warnings"] == ["resolve warning"]
    assert places_tool.calls[0]["tags"] == ["culture", "food"]
    assert food_tool.calls[0]["tags"] == ["culture", "food"]
    assert weather_tool.calls[0] == {"destination": "Da Nang", "month": 5}
    assert combos_tool.calls[0] == {"destination": "da nang"}
    assert schedule_states[0]["retrieved_data"]["combos"] == [
        {"id": "c1", "name": "City combo", "price_per_person": 300_000},
    ]


@pytest.mark.asyncio
async def test_create_travel_plan_wraps_service_result_as_json(monkeypatch):
    async def fake_generate_travel_plan(**kwargs):
        return {"success": True, "destination": kwargs["destination"], "plan": {"days": []}}

    monkeypatch.setattr(create_plan, "generate_travel_plan", fake_generate_travel_plan)

    raw = await create_plan.create_travel_plan.ainvoke({
        "destination": "Da Nang",
        "num_days": 2,
    })

    assert json.loads(raw) == {
        "success": True,
        "destination": "Da Nang",
        "plan": {"days": []},
    }


@pytest.mark.asyncio
async def test_generate_plan_route_uses_service_and_caches_success(monkeypatch):
    cached_payloads = []
    service_calls = []

    async def get_cached_plan(_key):
        return None

    async def cache_plan(_key, data):
        cached_payloads.append(data)

    async def fake_generate_travel_plan(**kwargs):
        service_calls.append(kwargs)
        return {
            "success": True,
            "destination": "Da Nang",
            "budget_tier": "standard",
            "budget_breakdown": {"attr_budget": 1},
            "validation_passed": True,
            "violations": [],
            "warnings": [],
            "plan": {"days": []},
        }

    monkeypatch.setattr(plan_route, "get_cached_plan", get_cached_plan)
    monkeypatch.setattr(plan_route, "cache_plan", cache_plan)
    monkeypatch.setattr(plan_route, "generate_travel_plan", fake_generate_travel_plan)
    monkeypatch.setattr(
        plan_route,
        "build_plan_cache_key",
        lambda _req: "test-cache-key",
    )

    response = await plan_route.generate_plan(
        PlanRequest(destination="Da Nang", num_days=2, preference_tags=[" Food ", "culture"])
    )

    assert response.destination == "Da Nang"
    assert response.final_plan == {"days": []}
    assert response.cache_hit is False
    assert service_calls[0]["preferences"] == ["culture", "food"]
    assert cached_payloads == [{
        "success": True,
        "destination": "Da Nang",
        "budget_tier": "standard",
        "budget_breakdown": {"attr_budget": 1},
        "validation_passed": True,
        "violations": [],
        "warnings": [],
        "plan": {"days": []},
    }]


def test_plan_request_accepts_preference_tags_alias():
    req = PlanRequest(destination="Da Nang", preference_tags=[" Food ", "culture", "food"])

    assert req.preferences == ["culture", "food"]
