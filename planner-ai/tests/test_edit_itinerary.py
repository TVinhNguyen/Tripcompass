"""
tests/test_edit_itinerary.py — edit_itinerary tool op normalisation.

The tool never touches the DB; it validates + normalises the ops the agent
proposes so the frontend can preview + apply them. These tests pin the
validation contract (drop malformed ops, require fields, clamp categories).
"""
import json

from app.tools.edit_itinerary import _normalise_op, edit_itinerary


def test_add_requires_title_and_day():
    assert _normalise_op({"op": "add", "title": "Cà phê", "day_number": 1}) == {
        "op": "add", "title": "Cà phê", "day_number": 1, "category": "ACTIVITY",
    }
    # Missing day_number / title → dropped.
    assert _normalise_op({"op": "add", "title": "Cà phê"}) is None
    assert _normalise_op({"op": "add", "day_number": 1}) is None


def test_add_keeps_valid_optional_fields_and_clamps_category():
    out = _normalise_op({
        "op": "add", "title": "Bún chả", "day_number": 2,
        "category": "food", "start_time": "08:00:30", "estimated_cost": 50000.0,
        "notes": " ngon ", "bogus": "x",
    })
    assert out == {
        "op": "add", "title": "Bún chả", "day_number": 2,
        "category": "FOOD", "start_time": "08:00", "estimated_cost": 50000,
        "notes": "ngon",
    }
    # Unknown category is dropped → falls back to ACTIVITY.
    assert _normalise_op({"op": "add", "title": "X", "day_number": 1, "category": "WAT"})["category"] == "ACTIVITY"


def test_update_requires_id_and_an_actual_change():
    assert _normalise_op({"op": "update", "activity_id": "a1", "start_time": "09:30"}) == {
        "op": "update", "activity_id": "a1", "start_time": "09:30",
    }
    # No id, or no changed field → dropped.
    assert _normalise_op({"op": "update", "start_time": "09:30"}) is None
    assert _normalise_op({"op": "update", "activity_id": "a1"}) is None


def test_delete_requires_id():
    assert _normalise_op({"op": "delete", "activity_id": "a1"}) == {"op": "delete", "activity_id": "a1"}
    assert _normalise_op({"op": "delete"}) is None


def test_unknown_op_dropped():
    assert _normalise_op({"op": "frobnicate", "activity_id": "a1"}) is None
    assert _normalise_op("not a dict") is None


async def test_tool_returns_only_valid_ops():
    raw = [
        {"op": "add", "title": "Cà phê", "day_number": 1},
        {"op": "update", "activity_id": "a1"},          # no change → dropped
        {"op": "delete", "activity_id": "a2"},
        {"op": "bogus"},                                 # dropped
    ]
    result = json.loads(await edit_itinerary.ainvoke({"ops": raw}))
    assert result["success"] is True
    assert [o["op"] for o in result["ops"]] == ["add", "delete"]
