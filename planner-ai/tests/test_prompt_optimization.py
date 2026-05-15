import json
import sys
import types

import pytest

import app

messages_mod = types.ModuleType("langchain_core.messages")
messages_mod.SystemMessage = lambda content: types.SimpleNamespace(content=content)
messages_mod.HumanMessage = lambda content: types.SimpleNamespace(content=content)
messages_mod.AIMessage = lambda content: types.SimpleNamespace(content=content)
sys.modules["langchain_core"] = types.ModuleType("langchain_core")
sys.modules["langchain_core.messages"] = messages_mod

fake_config = types.SimpleNamespace(
    llm=None,
    SCHEDULE_LLM_TIMEOUT=1,
    USE_STRUCTURED_SCHEDULE=False,
    ENRICH_LLM_TIMEOUT=1,
)
sys.modules["app.config"] = fake_config
setattr(app, "config", fake_config)

fastapi_mod = types.ModuleType("fastapi")
fastapi_mod.APIRouter = lambda *args, **kwargs: types.SimpleNamespace(
    post=lambda *a, **kw: (lambda func: func)
)
fastapi_mod.Depends = lambda dependency: dependency
responses_mod = types.ModuleType("fastapi.responses")
responses_mod.StreamingResponse = object
sys.modules["fastapi"] = fastapi_mod
sys.modules["fastapi.responses"] = responses_mod

agent_mod = types.ModuleType("app.agent")
agent_mod.get_chat_agent = lambda: None
sys.modules["app.agent"] = agent_mod

history_mod = types.ModuleType("app.services.chat_history")
history_mod.load_history = lambda *args, **kwargs: []
history_mod.save_history = lambda *args, **kwargs: None
history_mod.history_to_lc_messages = lambda history: []
history_mod.build_user_message = lambda content: {"role": "user", "content": content}
history_mod.build_assistant_message = lambda content, **kwargs: {"role": "assistant", "content": content}
sys.modules["app.services.chat_history"] = history_mod

cache_mod = types.ModuleType("app.routes.cache")
cache_mod.require_cache_admin = lambda: None
sys.modules["app.routes.cache"] = cache_mod

from app.nodes import enrich as enrich_mod
from app.nodes import schedule as schedule_mod
from app.prompts.agent import SYSTEM_PROMPT
from app.prompts.enrich import ENRICH_SYSTEM_PROMPT
from app.prompts.schedule import SCHEDULE_SYSTEM_PROMPT
from app.routes.chat import _compact_itinerary_context


def test_prompt_budgets_stay_compact():
    assert len(SYSTEM_PROMPT) < 3_000
    assert len(SCHEDULE_SYSTEM_PROMPT) < 3_000
    assert len(ENRICH_SYSTEM_PROMPT) < 1_200


def test_itinerary_context_is_slimmed_for_chat():
    context = {
        "id": "it-1",
        "destination": "Đà Nẵng",
        "large_unused_blob": "x" * 5_000,
        "final_plan": {
            "days": [
                {
                    "day_num": 1,
                    "date_str": "2026-06-01",
                    "slots": [
                        {
                            "start": "09:00",
                            "end": "11:00",
                            "slot_type": "morning_activity",
                            "place_name": "Ngũ Hành Sơn",
                            "price_vnd": 40_000,
                            "description": "x" * 1_000,
                            "place_id": "hidden-from-chat-context",
                        }
                    ],
                }
            ],
        },
    }

    compact = _compact_itinerary_context(context)
    rendered = json.dumps(compact, ensure_ascii=False, separators=(",", ":"))

    assert "large_unused_blob" not in rendered
    assert "hidden-from-chat-context" not in rendered
    assert "description" not in rendered
    assert "Ngũ Hành Sơn" in rendered
    assert len(rendered) < 500


def test_enrichment_patch_merges_without_changing_critical_fields():
    original = {
        "days": [
            {
                "day_num": 1,
                "slots": [
                    {
                        "start": "09:00",
                        "end": "11:00",
                        "slot_type": "morning_activity",
                        "place_id": "p1",
                        "place_name": "Ngũ Hành Sơn",
                        "price_vnd": 40_000,
                    }
                ],
            }
        ]
    }
    patch = {
        "trip_summary": "Chuyến đi gọn và vừa sức.",
        "days": [
            {
                "day_num": 1,
                "day_highlight": "Ngày khám phá phía nam Đà Nẵng.",
                "slots": [
                    {"index": 0, "description": "Núi đá cẩm thạch nhiều hang động.", "tip": "Đi sáng sớm."}
                ],
            }
        ],
    }

    warnings = []
    enriched = enrich_mod._apply_enrichment_patch(original, patch, warnings)
    enriched = enrich_mod._guard_enrichment(original, enriched, warnings)

    slot = enriched["days"][0]["slots"][0]
    assert slot["start"] == "09:00"
    assert slot["place_id"] == "p1"
    assert slot["price_vnd"] == 40_000
    assert slot["description"] == "Núi đá cẩm thạch nhiều hang động."
    assert slot["tip"] == "Đi sáng sớm."
    assert enriched["trip_summary"] == "Chuyến đi gọn và vừa sức."


@pytest.mark.asyncio
async def test_schedule_prompt_uses_compact_trimmed_context(monkeypatch):
    captured = {}

    class FakeLLM:
        async def ainvoke(self, messages):
            captured["human"] = messages[1].content
            return types.SimpleNamespace(content='{"days":[]}')

    monkeypatch.setattr(schedule_mod.config, "llm", FakeLLM(), raising=False)
    monkeypatch.setattr(schedule_mod.config, "SCHEDULE_LLM_TIMEOUT", 1, raising=False)
    monkeypatch.setattr(schedule_mod.config, "USE_STRUCTURED_SCHEDULE", False, raising=False)

    state = {
        "destination_name": "Đà Nẵng",
        "num_days": 3,
        "guest_count": 2,
        "budget_tier": "standard",
        "retrieved_data": {
            "places": [
                {
                    "id": f"p{i}",
                    "name": f"Place {i}",
                    "hours": "08:00-17:00",
                    "base_price": 10_000,
                    "duration_min": 90,
                    "must_visit": i < 5,
                    "best_time_of_day": "morning",
                    "latitude": 16.0,
                    "longitude": 108.0,
                    "area": "center",
                    "address": "should-not-be-sent",
                }
                for i in range(30)
            ],
            "food": [
                {
                    "id": f"f{i}",
                    "name": f"Food {i}",
                    "hours": "07:00-22:00",
                    "base_price": 80_000,
                    "area": "center",
                    "tags": ["local"],
                }
                for i in range(20)
            ],
            "combos": [
                {
                    "name": "Combo",
                    "price_per_person": 500_000,
                    "duration_days": 1,
                    "requires_overnight": False,
                    "includes": ["ticket"],
                    "cover_image": "should-not-be-sent",
                    "book_url": "should-not-be-sent",
                }
            ],
        },
    }

    await schedule_mod.node_schedule(state)
    prompt = captured["human"]

    assert "\n  \"" not in prompt
    assert "should-not-be-sent" not in prompt
    assert prompt.count('"id":"p') == 15
    assert prompt.count('"id":"f') == 9
