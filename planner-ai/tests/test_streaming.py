import pytest

from app.streaming import _to_generate_response, _ThinkStripper, _strip_thinking, stream_chat_response


class _FakeAIMessage:
    def __init__(self, content: str):
        self.content = content


# ─── _ThinkStripper ──────────────────────────────────────────────────────────


class TestThinkStripper:
    """Verify the streaming-friendly <think> filter.

    The stripper has two phases:
      1. Initial buffer (default 300 chars / 2 s) — output held until we see
         either <think> or </think>. A lone </think> drops the prefix.
      2. State machine — suppresses tokens between explicit <think>...</think>
         and held-back tail bytes to catch a tag split across chunks.
    """

    def _run(self, stripper, parts):
        out = "".join(stripper.feed(p) for p in parts) + stripper.flush()
        return out

    def test_normal_short_stream_unchanged(self):
        s = _ThinkStripper()
        out = self._run(s, ["Xin ", "chào ", "bạn!"])
        assert out.strip() == "Xin chào bạn!"

    def test_explicit_block_one_shot_stripped(self):
        s = _ThinkStripper()
        out = self._run(s, ["Hello <think>secret plan</think>answer"])
        assert "secret" not in out and "plan" not in out
        assert "Hello" in out and "answer" in out

    def test_explicit_block_split_across_tokens(self):
        s = _ThinkStripper()
        out = self._run(s, ["Hel", "lo <th", "ink>my plan</thi", "nk>final"])
        assert "plan" not in out
        assert "Hello" in out and "final" in out

    def test_lone_close_inside_initial_buffer_drops_prefix(self):
        s = _ThinkStripper()
        out = self._run(s, [
            "Để tư v", "ấn... reasoning ", "stuff</thi", "nk> Đà Nẵng đẹp lắm",
        ])
        assert "reasoning" not in out
        assert "Đà Nẵng" in out

    def test_lone_close_past_initial_buffer_still_drops_prefix(self):
        # Once the buffer flushes, leaked bytes already left; the state
        # machine still drops what hasn't been flushed yet. With a single
        # large token the whole prefix lands in pending and a later </think>
        # cleans it out before anything is emitted.
        s = _ThinkStripper()
        out = self._run(s, ["A" * 400, " stuff </think> final"])
        assert out.strip() == "final"

    def test_budget_exhausted_without_markers_flushes_buffer(self):
        s = _ThinkStripper(initial_buffer_chars=20, initial_buffer_seconds=10)
        out = self._run(s, ["This is a longer message that exceeds 20 chars"])
        assert "This is a longer message" in out

    def test_strip_thinking_regex_handles_blocks_and_lone_close(self):
        explicit = "Hello <think>plan</think>answer"
        assert _strip_thinking(explicit) == "Hello answer"

        lone = "reasoning bytes</think>real answer"
        assert _strip_thinking(lone) == "real answer"


# ─── _to_generate_response (existing tests preserved below) ──────────────────

def test_to_generate_response_full_wrapper():
    wrapper = {
        "destination": "Đà Nẵng",
        "num_days": 2,
        "budget_breakdown": {
            "hotel_budget_per_night": 500000,
            "attr_budget": 1000000,
            "food_budget": 500000
        },
        "plan": {
            "days": [
                {
                    "day_num": 1,
                    "date_str": "2025-01-01",
                    "slots": [
                        {
                            "start": "08:00",
                            "end": "10:00",
                            "slot_type": "breakfast",
                            "place_id": "p1",
                            "place_name": "Bánh mì Phượng",
                            "price_vnd": 50000
                        }
                    ]
                }
            ]
        }
    }
    
    resp = _to_generate_response(wrapper)
    assert resp is not None
    assert len(resp["days"]) == 1
    assert resp["days"][0]["primary_area"] == "Đà Nẵng"
    
    recap = resp["budget_recap"]
    assert recap["food_spent_vnd"] == 50000
    assert recap["attraction_spent_vnd"] == 0
    # total budget = 1000000 + 500000 + (500000 * 1) = 2000000
    assert recap["total_budget_vnd"] == 2000000
    assert recap["remaining_vnd"] == 1950000

def test_to_generate_response_malformed():
    assert _to_generate_response(None) is None
    assert _to_generate_response({}) is None
    assert _to_generate_response({"plan": {}}) is None
    assert _to_generate_response({"plan": {"days": "invalid"}}) is None

def test_to_generate_response_malformed_slot():
    wrapper = {
        "plan": {
            "days": [
                {
                    "day_num": 1,
                    "slots": [
                        "not a dict",
                        {"start": "08:00"} # missing other keys
                    ]
                }
            ]
        }
    }
    resp = _to_generate_response(wrapper)
    assert resp is not None
    assert len(resp["days"][0]["slots"]) == 1 # skip non-dict slot
    assert resp["days"][0]["slots"][0]["is_buffer"] is True # missing place_id, place_name

def test_to_generate_response_with_budget_vnd():
    wrapper = {
        "budget_vnd": 5000000,
        "plan": {
            "days": [
                {
                    "day_num": 1,
                    "slots": [
                        {
                            "start": "08:00",
                            "end": "10:00",
                            "slot_type": "attraction",
                            "place_id": "p2",
                            "place_name": "Bà Nà Hills",
                            "price_vnd": 900000
                        }
                    ]
                }
            ]
        }
    }
    
    resp = _to_generate_response(wrapper)
    assert resp is not None
    recap = resp["budget_recap"]
    assert recap["total_budget_vnd"] == 5000000
    assert recap["attraction_spent_vnd"] == 900000
    assert recap["remaining_vnd"] == 4100000

def test_to_generate_response_budget_exceeded():
    wrapper = {
        "budget_breakdown": {
            "attr_budget": 100000,
            "food_budget": 100000
        },
        "plan": {
            "days": [
                {
                    "day_num": 1,
                    "slots": [
                        {
                            "start": "08:00",
                            "end": "10:00",
                            "slot_type": "attraction",
                            "place_id": "p3",
                            "place_name": "Đỉnh Fansipan",
                            "price_vnd": 900000
                        }
                    ]
                }
            ]
        }
    }
    
    resp = _to_generate_response(wrapper)
    assert resp is not None
    recap = resp["budget_recap"]
    # Total budget (200k) < Spent (900k) -> total_budget is updated to Spent
    assert recap["total_budget_vnd"] == 900000
    assert recap["remaining_vnd"] == 0


def _payloads(chunks):
    import json

    out = []
    for chunk in chunks:
        assert chunk.startswith("data: ")
        out.append(json.loads(chunk.removeprefix("data: ").strip()))
    return out


class _EndOnlyAgent:
    async def astream_events(self, *_args, **_kwargs):
        yield {
            "event": "on_chat_model_end",
            "run_id": "r1",
            "data": {"output": _FakeAIMessage(content="Xin chào từ provider buffer.")},
        }


@pytest.mark.asyncio
async def test_stream_chat_response_uses_chat_model_end_when_provider_buffers():
    chunks = [chunk async for chunk in stream_chat_response(_EndOnlyAgent(), [], "s1")]
    events = _payloads(chunks)

    streamed_text = "".join(e.get("content", "") for e in events if e["type"] == "token")
    assert "provider buffer" in streamed_text
    done = events[-1]
    assert done["type"] == "done"
    assert done["full_text"] == "Xin chào từ provider buffer."


class _PlanToolAgent:
    async def astream_events(self, *_args, **_kwargs):
        yield {"event": "on_tool_start", "name": "create_travel_plan", "data": {}}
        yield {
            "event": "on_tool_end",
            "name": "create_travel_plan",
            "data": {
                "output": {
                    "success": True,
                    "destination": "Đà Nẵng",
                    "num_days": 1,
                    "budget_vnd": 1000000,
                    "plan": {
                        "days": [
                            {
                                "day_num": 1,
                                "date_str": "2026-06-01",
                                "slots": [
                                    {
                                        "start": "08:00",
                                        "end": "10:00",
                                        "slot_type": "morning_activity",
                                        "place_id": "p1",
                                        "place_name": "Bà Nà Hills",
                                        "price_vnd": 500000,
                                    }
                                ],
                            }
                        ]
                    },
                }
            },
        }
        raise AssertionError("stream should stop before the final LLM call")


@pytest.mark.asyncio
async def test_stream_chat_response_fast_finishes_after_plan_tool():
    chunks = [chunk async for chunk in stream_chat_response(_PlanToolAgent(), [], "s1")]
    events = _payloads(chunks)

    assert any(e["type"] == "tool_start" and e["tool"] == "create_travel_plan" for e in events)
    done = events[-1]
    assert done["type"] == "done"
    assert done["plan"]["days"][0]["slots"][0]["place"]["name"] == "Bà Nà Hills"
    assert "lịch trình" in done["full_text"].lower()
