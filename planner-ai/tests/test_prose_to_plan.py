"""
tests/test_prose_to_plan.py — Prose itinerary extraction.

Regression coverage for the destination-scoped re-resolution. A prose plan
parsed without an up-front destination must not bind a place to a same-keyword
match in another city: the whole-table fuzzy search ranks "Bán đảo Sơn Trà"
against "Ba Trai Dao" (Đảo Cát Bà, sim .47) above "Son Tra Beach" (Đà Nẵng,
.43), so the symptom was a Đà Nẵng slot showing a Hải Phòng/Cát Bà address.
"""
import importlib

# The package __init__ re-exports the prose_to_plan function, shadowing the
# submodule attribute — fetch the real module object so monkeypatch can swap
# the resolver the module imported.
ptp = importlib.import_module("app.extractor.prose_to_plan")


_PROSE = """\
## Ngày 1: Khám phá Đà Nẵng
- **08:00-09:00** | Sáng | **Cầu Rồng** — biểu tượng thành phố
- **09:30-11:00** | Sáng | **Bán đảo Sơn Trà** — ngắm toàn cảnh
"""

# The two DB rows that collide on "Bán đảo Sơn Trà".
_DANANG_SON_TRA = {
    "id": "danang-son-tra", "name": "Son Tra Beach", "name_en": "Son Tra Beach",
    "category": "ATTRACTION", "destination": "đà nẵng", "base_price": 0,
    "latitude": 16.1, "longitude": 108.25, "cover_image": None,
}
_CATBA_OUTLIER = {
    "id": "catba-ba-trai-dao", "name": "Ba Trai Dao", "name_en": "Ba Trai Dao",
    "category": "ATTRACTION", "destination": "Đảo Cát Bà", "base_price": 0,
    "latitude": 20.74, "longitude": 107.04, "cover_image": None,
}
_DANANG_CAU_RONG = {
    "id": "danang-cau-rong", "name": "Cầu Rồng (Dragon Bridge)", "name_en": "Dragon Bridge",
    "category": "ATTRACTION", "destination": "đà nẵng", "base_price": 0,
    "latitude": 16.06, "longitude": 108.22, "cover_image": None,
}


def _son_tra_slot(plan: dict) -> dict:
    slots = plan["days"][0]["slots"]
    return next(s for s in slots if s["place"]["name"] == "Bán đảo Sơn Trà")


async def test_unscoped_plan_rescopes_outlier_to_modal_destination(monkeypatch):
    """First pass (no scope) lets the Cát Bà outlier win; the modal-destination
    second pass must pull "Bán đảo Sơn Trà" back to the Đà Nẵng row."""
    calls: list = []

    async def fake_resolve(names, destination=None):
        calls.append(destination)
        if destination is None:
            # Whole-table fuzzy search — the same-keyword outlier wins.
            return {"Cầu Rồng": _DANANG_CAU_RONG, "Bán đảo Sơn Trà": _CATBA_OUTLIER}
        # Destination-scoped pass — correct Đà Nẵng match.
        return {"Cầu Rồng": _DANANG_CAU_RONG, "Bán đảo Sơn Trà": _DANANG_SON_TRA}

    monkeypatch.setattr(ptp, "resolve_places", fake_resolve)

    plan = await ptp.prose_to_plan(_PROSE)

    # Two passes: unscoped, then scoped to the plan's modal city.
    assert calls == [None, "đà nẵng"]

    son_tra = _son_tra_slot(plan)
    assert son_tra["place"]["id"] == "danang-son-tra"
    assert son_tra["place"]["lat"] == 16.1
    assert plan["days"][0]["primary_area"] == "đà nẵng"


async def test_unscoped_pass_keeps_outlier_when_scoped_pass_misses(monkeypatch):
    """A legitimate neighbouring-area place the scoped pass can't find must
    fall back to its first-pass match instead of becoming text-only."""

    async def fake_resolve(names, destination=None):
        if destination is None:
            return {"Cầu Rồng": _DANANG_CAU_RONG, "Bán đảo Sơn Trà": _CATBA_OUTLIER}
        # Scoped pass finds Cầu Rồng but not the Sơn Trà name.
        return {"Cầu Rồng": _DANANG_CAU_RONG, "Bán đảo Sơn Trà": None}

    monkeypatch.setattr(ptp, "resolve_places", fake_resolve)

    plan = await ptp.prose_to_plan(_PROSE)

    # Scoped pass returned nothing for the name → keep the first-pass hit.
    assert _son_tra_slot(plan)["place"]["id"] == "catba-ba-trai-dao"


async def test_explicit_scope_skips_corrective_second_pass(monkeypatch):
    """When a destination scope is known up front, there is no corrective
    second pass — the single scoped call is authoritative."""
    calls: list = []

    async def fake_resolve(names, destination=None):
        calls.append(destination)
        return {"Cầu Rồng": _DANANG_CAU_RONG, "Bán đảo Sơn Trà": _DANANG_SON_TRA}

    monkeypatch.setattr(ptp, "resolve_places", fake_resolve)

    plan = await ptp.prose_to_plan(_PROSE, tool_destination="đà nẵng")

    assert calls == ["đà nẵng"]  # exactly one pass
    assert _son_tra_slot(plan)["place"]["id"] == "danang-son-tra"
