"""
Unit tests for Node 4 (Budget) and Node 6 (Validate).
These are code-only nodes — no LLM, no DB, fully testable.

Run: pytest tests/test_nodes.py -v
"""
import pytest
from app.nodes.budget   import node_budget
from app.nodes.validate import node_validate, route_after_validate


# ── Helpers ───────────────────────────────────────────────────────────────────
def make_state(**overrides) -> dict:
    base = {
        "raw_input":       "test",
        "destination_id":  "đà nẵng",
        "destination_name":"Đà Nẵng",
        "num_days":        3,
        "guest_count":     2,
        "budget_vnd":      10_000_000,
        "preferences":     [],
        "need_hotel":      True,
        "need_flight":     False,
        "retrieved_data":  {},
        "violations":      [],
        "retry_count":     0,
        "warnings":        [],
        "errors":          [],
    }
    base.update(overrides)
    return base


def make_slot(place_id, name, price, start="09:00", end="11:00",
              slot_type="morning_activity") -> dict:
    return {
        "place_id":   place_id,
        "place_name": name,
        "price_vnd":  price,
        "start":      start,
        "end":        end,
        "slot_type":  slot_type,
    }


def make_schedule(*days_slots) -> dict:
    """days_slots: list of slot lists, one per day."""
    days = []
    for i, slots in enumerate(days_slots, 1):
        days.append({"day_num": i, "day_type": "standard", "slots": slots})
    return {"days": days}


def load_fallback_schedule(monkeypatch):
    """Import schedule fallback without requiring runtime LLM/langchain config."""
    helpers = load_schedule_helpers(monkeypatch)
    from app.nodes.schedule import _fallback_schedule
    return _fallback_schedule


def load_schedule_helpers(monkeypatch):
    """Import the schedule node's pure helpers without runtime deps.

    Returns a SimpleNamespace exposing _parse_hours, _hms, _fits, _slot_bucket.
    """
    import sys
    import types as _types
    import app

    messages_mod = _types.ModuleType("langchain_core.messages")
    messages_mod.SystemMessage = object
    messages_mod.HumanMessage = object
    monkeypatch.setitem(sys.modules, "langchain_core.messages", messages_mod)

    fake_config = _types.SimpleNamespace(TOOL_TIMEOUT=5, llm=None, SCHEDULE_LLM_TIMEOUT=90)
    monkeypatch.setattr(app, "config", fake_config, raising=False)
    monkeypatch.setitem(sys.modules, "app.config", fake_config)

    from app.nodes import schedule as sch
    return _types.SimpleNamespace(
        parse_hours=sch._parse_hours,
        hms=sch._hms,
        fits=sch._fits,
        slot_bucket=sch._slot_bucket,
    )


# ── Node 4: Budget ────────────────────────────────────────────────────────────
class TestNodeBudget:

    def test_standard_tier_10m_2people_3days(self):
        state = make_state(budget_vnd=10_000_000, num_days=3, guest_count=2)
        result = node_budget(state)
        assert result["budget_tier"] == "standard"  # ~1.67M/person/day
        assert result["attr_budget"] > 0
        assert result["food_budget"] > 0
        assert result["attr_budget"] + result["food_budget"] <= 10_000_000

    def test_budget_tier_low_budget(self):
        # 3M / 3 days / 2 people = 500k/person/day → budget tier
        state = make_state(budget_vnd=3_000_000, num_days=3, guest_count=2)
        result = node_budget(state)
        assert result["budget_tier"] == "budget"

    def test_survival_tier_extreme_low(self):
        # 500k / 3 days / 2 people = 83k/person/day < 50% of min_daily
        state = make_state(budget_vnd=500_000, num_days=3, guest_count=2)
        result = node_budget(state)
        assert result["budget_tier"] == "survival"
        # Survival should have a warning
        assert any("budget" in w.lower() or "⚠️" in w for w in result["warnings"])

    def test_premium_tier(self):
        # 30M / 3 days / 2 people = 5M/person/day → premium
        state = make_state(budget_vnd=30_000_000, num_days=3, guest_count=2)
        result = node_budget(state)
        assert result["budget_tier"] == "premium"

    def test_zero_budget_defaults_to_standard(self):
        state = make_state(budget_vnd=0)
        result = node_budget(state)
        assert result["budget_tier"] == "standard"

    def test_attr_food_sum_within_budget(self):
        state = make_state(budget_vnd=10_000_000)
        result = node_budget(state)
        # attr + food should not exceed budget
        assert result["attr_budget"] + result["food_budget"] <= 10_000_000

    def test_hotel_from_serpapi_results(self):
        state = make_state(
            budget_vnd=10_000_000,
            retrieved_data={
                "hotels": [
                    {"price_per_night_vnd": 600_000},
                    {"price_per_night_vnd": 900_000},
                ]
            }
        )
        result = node_budget(state)
        # Should use cheapest hotel from SerpAPI
        assert result["hotel_budget_per_night"] == 600_000


# ── Node 6: Validate ──────────────────────────────────────────────────────────
class TestNodeValidate:

    VALID_PLACE = {
        "id": "place-1",
        "name": "Ngũ Hành Sơn",
        "hours": "07:00-17:30",
        "latitude": 16.0,
        "longitude": 108.0,
        "base_price": 40_000,
    }
    VALID_PLACE_2 = {
        "id": "place-2",
        "name": "Phố cổ Hội An",
        "hours": "08:00-22:00",
        "latitude": 15.8794,
        "longitude": 108.3350,
        "base_price": 120_000,
    }
    VALID_FOOD = {
        "id": "food-1",
        "name": "Mỳ Quảng 1A",
        "hours": "06:00-22:00",
        "base_price": 50_000,
    }

    def _state_with_schedule(self, schedule, attr_budget=1_000_000, extra=None):
        extra = extra or {}
        state = make_state(
            draft_schedule=schedule,
            num_days=extra.get("num_days", len(schedule.get("days", [])) or 3),
            attr_budget=attr_budget,
            retrieved_data={
                "places": [self.VALID_PLACE, self.VALID_PLACE_2],
                "food":   [self.VALID_FOOD],
            },
        )
        state.update(extra)
        return state

    def test_valid_schedule_passes(self):
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 40_000, "09:00", "11:00"),
            make_slot("food-1",  "Mỳ Quảng 1A",  50_000, "12:00", "13:00", "lunch"),
        ])
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        assert result["validation_passed"] is True
        assert result["violations"] == []

    def test_hallucinated_place_detected(self):
        schedule = make_schedule([
            make_slot("fake-id-xyz", "Bịa Đặt Island", 500_000),
        ])
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        assert not result["validation_passed"]
        types = [v["type"] for v in result["violations"]]
        assert "HALLUCINATED_PLACE" in types

    def test_over_budget_detected(self):
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 900_000),
        ])
        state = self._state_with_schedule(schedule, attr_budget=500_000)
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "OVER_BUDGET" in types

    def test_duplicate_place_across_days(self):
        schedule = make_schedule(
            [make_slot("place-1", "Ngũ Hành Sơn", 40_000, "09:00", "11:00")],
            [make_slot("place-1", "Ngũ Hành Sơn", 40_000, "09:00", "11:00")],
        )
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "DUPLICATE_PLACE" in types

    def test_closed_hours_detected(self):
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 40_000,
                      start="19:00", end="21:00"),  # closes 17:30
        ])
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "CLOSED_HOURS" in types

    def test_slot_end_exceeds_closing_detected(self):
        """Slot starts inside hours but ends after close → should also fail."""
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 40_000,
                      start="16:00", end="19:00"),  # starts OK, ends after 17:30
        ])
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "CLOSED_HOURS" in types, (
            "Slot ending after closing time should trigger CLOSED_HOURS"
        )

    def test_slot_fully_within_hours_passes(self):
        """Slot entirely within opening hours must NOT trigger CLOSED_HOURS."""
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 40_000,
                      start="09:00", end="11:00"),  # well within 07:00-17:30
        ])
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "CLOSED_HOURS" not in types

    def test_overnight_hours_pass(self):
        night_place = {
            "id": "night-1",
            "name": "Chợ đêm",
            "hours": "18:00-02:00",
            "latitude": 16.0,
            "longitude": 108.0,
            "base_price": 0,
        }
        schedule = make_schedule([
            make_slot("night-1", "Chợ đêm", 0, start="21:00", end="23:00", slot_type="evening_activity"),
        ])
        state = self._state_with_schedule(
            schedule,
            extra={"retrieved_data": {"places": [night_place], "food": []}},
        )
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "CLOSED_HOURS" not in types

    def test_overnight_hours_daytime_gap_detected(self):
        night_place = {
            "id": "night-1",
            "name": "Chợ đêm",
            "hours": "18:00-02:00",
            "latitude": 16.0,
            "longitude": 108.0,
            "base_price": 0,
        }
        schedule = make_schedule([
            make_slot("night-1", "Chợ đêm", 0, start="10:00", end="11:00", slot_type="morning_activity"),
        ])
        state = self._state_with_schedule(
            schedule,
            extra={"retrieved_data": {"places": [night_place], "food": []}},
        )
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "CLOSED_HOURS" in types

    def test_cross_midnight_slot_rejected(self):
        night_place = {
            "id": "night-1",
            "name": "Chợ đêm",
            "hours": "18:00-02:00",
            "latitude": 16.0,
            "longitude": 108.0,
            "base_price": 0,
        }
        schedule = make_schedule([
            make_slot("night-1", "Chợ đêm", 0, start="23:00", end="01:00", slot_type="evening_activity"),
        ])
        state = self._state_with_schedule(
            schedule,
            extra={"retrieved_data": {"places": [night_place], "food": []}},
        )
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "INVALID_TIME_RANGE" in types


    def test_time_overlap_detected(self):
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 40_000, "09:00", "11:00"),
            make_slot("food-1",  "Mỳ Quảng 1A",  50_000, "10:30", "12:00", "lunch"),
        ])
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "TIME_OVERLAP" in types

    def test_retry_counter_increments(self):
        schedule = make_schedule([
            make_slot("fake-xyz", "Bịa Đặt", 999_999),
        ])
        state = self._state_with_schedule(schedule)
        state["retry_count"] = 1
        result = node_validate(state)
        assert result["retry_count"] == 2

    def test_food_slots_not_counted_in_attr_budget(self):
        """Food slots should NOT count toward attraction budget check."""
        schedule = make_schedule([
            make_slot("food-1", "Mỳ Quảng 1A", 900_000, "12:00", "13:00", "lunch"),
        ])
        state = self._state_with_schedule(schedule, attr_budget=100_000)
        result = node_validate(state)
        # Food slot → should NOT trigger OVER_BUDGET
        types = [v["type"] for v in result["violations"]]
        assert "OVER_BUDGET" not in types

    def test_insufficient_travel_time_detected(self):
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 40_000, "09:00", "10:00"),
            make_slot("place-2", "Phố cổ Hội An", 120_000, "10:15", "11:15"),
        ])
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "INSUFFICIENT_TRAVEL_TIME" in types

    def test_sufficient_travel_time_passes(self):
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 40_000, "09:00", "10:00"),
            make_slot("place-2", "Phố cổ Hội An", 120_000, "12:00", "13:00"),
        ])
        state = self._state_with_schedule(schedule)
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "INSUFFICIENT_TRAVEL_TIME" not in types

    def test_missing_coordinates_skip_travel_time_check(self):
        no_coords = dict(self.VALID_PLACE_2)
        no_coords.pop("latitude")
        no_coords.pop("longitude")
        schedule = make_schedule([
            make_slot("place-1", "Ngũ Hành Sơn", 40_000, "09:00", "10:00"),
            make_slot("place-2", "Phố cổ Hội An", 120_000, "10:15", "11:15"),
        ])
        state = self._state_with_schedule(
            schedule,
            extra={"retrieved_data": {"places": [self.VALID_PLACE, no_coords], "food": []}},
        )
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "INSUFFICIENT_TRAVEL_TIME" not in types

    def test_empty_schedule_detected(self):
        state = self._state_with_schedule({"days": []}, extra={"num_days": 3})
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "INCOMPLETE_SCHEDULE" in types

    def test_wrong_day_count_detected(self):
        schedule = make_schedule([make_slot("place-1", "Ngũ Hành Sơn", 40_000)])
        state = self._state_with_schedule(schedule, extra={"num_days": 3})
        result = node_validate(state)
        types = [v["type"] for v in result["violations"]]
        assert "INCOMPLETE_SCHEDULE" in types


class TestFallbackSchedule:

    def test_fallback_generates_requested_day_counts(self, monkeypatch):
        fallback_schedule = load_fallback_schedule(monkeypatch)
        retrieved = {
            "places": [
                {"id": f"place-{i}", "name": f"Place {i}", "base_price": i * 10_000}
                for i in range(1, 10)
            ],
            "food": [
                {"id": f"food-{i}", "name": f"Food {i}", "base_price": i * 5_000}
                for i in range(1, 12)
            ],
            "hotels": [{"name": "Hotel", "price_per_night_vnd": 800_000}],
        }

        for days in (1, 2, 5):
            draft = fallback_schedule(
                make_state(num_days=days, start_date="2026-05-01", end_date="2026-05-05"),
                retrieved,
            )
            assert len(draft["days"]) == days
            assert draft["days"][0]["date_str"] == "2026-05-01"

    def test_fallback_avoids_duplicate_places_when_data_is_available(self, monkeypatch):
        fallback_schedule = load_fallback_schedule(monkeypatch)
        retrieved = {
            "places": [
                {"id": f"place-{i}", "name": f"Place {i}", "base_price": i * 10_000}
                for i in range(1, 8)
            ],
            "food": [],
            "hotels": [],
        }
        draft = fallback_schedule(make_state(num_days=4, start_date="2026-05-01"), retrieved)
        place_ids = [
            slot["place_id"]
            for day in draft["days"]
            for slot in day["slots"]
            if slot.get("place_id")
        ]
        assert len(place_ids) == len(set(place_ids))

    def test_fallback_uses_user_arrival_and_departure_times(self, monkeypatch):
        fallback_schedule = load_fallback_schedule(monkeypatch)
        retrieved = {
            "places": [
                {"id": f"place-{i}", "name": f"Place {i}", "hours": "07:00-23:00", "base_price": 0}
                for i in range(1, 8)
            ],
            "food": [
                {"id": f"food-{i}", "name": f"Food {i}", "hours": "06:00-23:00", "base_price": 50_000}
                for i in range(1, 8)
            ],
            "hotels": [],
        }
        draft = fallback_schedule(
            make_state(
                num_days=3,
                start_date="2026-05-01",
                end_date="2026-05-03",
                travel_style="relaxed",
                arrival_time="10:00",
                departure_time="18:00",
            ),
            retrieved,
        )

        day1_slots = draft["days"][0]["slots"]
        day3_slots = draft["days"][2]["slots"]
        assert day1_slots[0]["start"] != "15:00"
        assert day1_slots[0]["start"] >= "10:00"
        assert day3_slots[-1]["end"] == "18:00"

    def test_fallback_respects_hours(self, monkeypatch):
        """Regression test for the CLOSED_HOURS bug fixed in e695c88.

        A breakfast-only venue must not land in a lunch slot, and a
        lunch-only buffet must not land in a dinner slot.
        """
        fallback_schedule = load_fallback_schedule(monkeypatch)
        retrieved = {
            "places": [
                {"id": "marble", "name": "Marble Mtns",  "hours": "07:00-17:30", "base_price": 40_000},
                {"id": "lady",   "name": "Lady Buddha",  "hours": "07:00-17:30", "base_price": 0},
                {"id": "beach",  "name": "My Khe Beach", "hours": "00:00-23:59", "base_price": 0},
            ],
            "food": [
                {"id": "bistecca",    "name": "Bistecca",     "hours": "06:00-10:00", "base_price": 1_200_000},
                {"id": "all-seasons", "name": "All Seasons",  "hours": "11:00-14:30", "base_price": 0},
                {"id": "thia",        "name": "Thia Gỗ",      "hours": "10:00-22:00", "base_price": 80_000},
                {"id": "thien-kim",   "name": "Thien Kim",    "hours": "10:00-21:30", "base_price": 0},
            ],
            "hotels": [],
        }
        draft = fallback_schedule(
            make_state(num_days=2, start_date="2026-05-01", end_date="2026-05-02"),
            retrieved,
        )

        # Walk every slot and assert the assigned venue is open during it.
        for day in draft["days"]:
            for slot in day["slots"]:
                pid = slot.get("place_id")
                if not pid:
                    continue
                source = next(
                    (v for v in retrieved["places"] + retrieved["food"] if v["id"] == pid),
                    None,
                )
                assert source is not None
                _o, _c = [int(p) for p in source["hours"].replace(":", "-").split("-") if p][:4:2]
                start_h = int(slot["start"].split(":")[0])
                end_h = int(slot["end"].split(":")[0])
                assert _o <= start_h <= _c, (
                    f"Day {day['day_num']} slot {slot['slot_type']} ({slot['start']}-{slot['end']}) "
                    f"used '{source['name']}' open {source['hours']} — start out of range"
                )
                assert end_h <= _c, (
                    f"Day {day['day_num']} slot {slot['slot_type']} ({slot['start']}-{slot['end']}) "
                    f"used '{source['name']}' open {source['hours']} — end out of range"
                )


class TestScheduleHelpers:

    def test_parse_hours_normal(self, monkeypatch):
        h = load_schedule_helpers(monkeypatch)
        assert h.parse_hours("08:00-17:30") == (480, 1050)
        assert h.parse_hours("00:00-23:59") == (0, 1439)

    def test_parse_hours_bad_input(self, monkeypatch):
        h = load_schedule_helpers(monkeypatch)
        assert h.parse_hours(None) is None
        assert h.parse_hours("") is None
        assert h.parse_hours("24h") is None
        assert h.parse_hours("nine to five") is None
        assert h.parse_hours("08:00-") is None  # missing close

    def test_fits_same_day_window(self, monkeypatch):
        h = load_schedule_helpers(monkeypatch)
        item = {"hours": "07:00-17:30"}
        assert h.fits(item, "09:00", "10:30") is True
        assert h.fits(item, "06:30", "08:00") is False  # starts before open
        assert h.fits(item, "16:00", "18:00") is False  # ends after close
        assert h.fits(item, "07:00", "17:30") is True   # exact boundary

    def test_fits_overnight_window(self, monkeypatch):
        h = load_schedule_helpers(monkeypatch)
        bar = {"hours": "18:00-02:00"}
        assert h.fits(bar, "19:00", "21:00") is True   # in first segment
        assert h.fits(bar, "00:30", "01:30") is True   # in second segment
        assert h.fits(bar, "10:00", "12:00") is False  # daytime gap
        assert h.fits(bar, "17:00", "19:00") is False  # starts before open

    def test_fits_unknown_hours_returns_true(self, monkeypatch):
        h = load_schedule_helpers(monkeypatch)
        assert h.fits({}, "09:00", "10:00") is True
        assert h.fits({"hours": ""}, "09:00", "10:00") is True
        assert h.fits({"hours": "garbage"}, "09:00", "10:00") is True

    def test_slot_bucket(self, monkeypatch):
        h = load_schedule_helpers(monkeypatch)
        assert h.slot_bucket("07:00") == "morning"
        assert h.slot_bucket("10:59") == "morning"
        assert h.slot_bucket("11:00") == "afternoon"
        assert h.slot_bucket("16:59") == "afternoon"
        assert h.slot_bucket("17:00") == "evening"
        assert h.slot_bucket("20:59") == "evening"
        assert h.slot_bucket("21:00") == "night"
        assert h.slot_bucket("23:30") == "night"

    def test_pick_prefers_best_time_match(self, monkeypatch):
        """When two venues both fit the hours, the one whose
        best_time_of_day matches the slot bucket should win."""
        fallback_schedule = load_fallback_schedule(monkeypatch)
        retrieved = {
            # priority_score ordering is implicit; LLM-style fallback should
            # still prefer best_time match over earlier-in-list non-match.
            "places": [
                # First-in-list but best_time mismatches morning slots.
                {"id": "evening-spot", "name": "Asia Park", "hours": "00:00-23:59",
                 "best_time_of_day": "afternoon", "base_price": 250_000},
                # Better morning match for the 09:00 slot on a standard day.
                {"id": "morning-spot", "name": "Marble Mtns", "hours": "07:00-17:30",
                 "best_time_of_day": "morning", "base_price": 40_000},
            ],
            "food": [],
            "hotels": [],
        }
        # num_days=3 so day 2 is "standard" (has both morning_activity and
        # afternoon_activity). Day 1 is "arrival" (afternoon-only).
        draft = fallback_schedule(
            make_state(num_days=3, start_date="2026-05-01", end_date="2026-05-03"),
            retrieved,
        )
        day2 = draft["days"][1]  # standard day
        morning_slot = next(s for s in day2["slots"] if s["slot_type"] == "morning_activity")
        # morning slot prefers best_time_of_day='morning' tag.
        assert morning_slot["place_id"] == "morning-spot"


# ── Route after validate ───────────────────────────────────────────────────────
class TestRouteAfterValidate:

    @pytest.fixture(autouse=True)
    def patch_config(self, monkeypatch):
        """Inject a minimal config stub so route_after_validate doesn't need dotenv."""
        import types
        stub = types.SimpleNamespace(MAX_SCHEDULE_RETRIES=2)
        import app.nodes.validate as val_mod
        monkeypatch.setattr(val_mod, "_config_stub", stub, raising=False)
        # Patch the import inside route_after_validate
        import sys
        fake_app = types.ModuleType("app")
        fake_app.config = stub  # type: ignore[attr-defined]
        monkeypatch.setitem(sys.modules, "app", fake_app)
        monkeypatch.setitem(sys.modules, "app.config", stub)  # type: ignore[arg-type]

    def test_routes_to_enrich_when_passed(self):
        state = make_state(validation_passed=True, retry_count=0)
        assert route_after_validate(state) == "enrich"

    def test_routes_to_schedule_on_first_failure(self):
        state = make_state(validation_passed=False, retry_count=0)
        assert route_after_validate(state) == "schedule"

    def test_routes_to_enrich_on_max_retries(self):
        # After 2 retries → proceed anyway
        state = make_state(validation_passed=False, retry_count=2)
        assert route_after_validate(state) == "enrich"
