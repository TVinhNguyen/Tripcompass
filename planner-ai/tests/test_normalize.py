from app.services.normalize import (
    ascii_fold,
    normalize_destination,
    normalize_preferences,
    normalize_time,
    normalize_time_strictness,
    normalize_travel_style,
)


def test_normalize_preferences_matches_existing_behavior():
    assert normalize_preferences([" Food ", "", "beach", "Food"]) == ["beach", "food"]


def test_normalize_destination_collapses_whitespace_and_case():
    assert normalize_destination("  Đà   Nẵng  ") == "đà nẵng"


def test_normalize_travel_style_and_strictness_defaults():
    assert normalize_travel_style("standard") == "balanced"
    assert normalize_travel_style("unknown") == "balanced"
    assert normalize_time_strictness("strict") == "strict"
    assert normalize_time_strictness("unknown") == "balanced"


def test_normalize_time_validates_hh_mm():
    assert normalize_time("7:05") == "07:05"
    assert normalize_time("24:00") is None
    assert normalize_time("bad") is None


def test_ascii_fold_strips_vietnamese_diacritics():
    assert ascii_fold("Đà Nẵng") == "da nang"
