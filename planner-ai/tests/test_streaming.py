import pytest
from app.streaming import _to_generate_response

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
