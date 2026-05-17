from app.services.normalize import (
    ascii_fold,
    extract_required_places,
    normalize_destination,
    normalize_preferences,
    normalize_required_places,
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


# ── extract_required_places ──────────────────────────────────────────────────


def test_extract_required_places_colon_marker_vietnamese():
    out = extract_required_places("Cho tôi lịch trình Đà Nẵng, phải có: Cầu Vàng, Bà Nà")
    assert out == ["Cầu Vàng", "Bà Nà"]


def test_extract_required_places_no_false_positive_for_bare_phai_co():
    # Regression: marker used to be "phai co " (no colon) which matched any
    # sentence containing "phải có" and produced garbage required_places.
    out = extract_required_places("Bà Nà phải có thời gian sáng đẹp")
    assert out == []


def test_extract_required_places_va_and_separator():
    out = extract_required_places("phải có: Dragon Bridge và APEC Park và Cao Dai Temple")
    assert out == ["Dragon Bridge", "APEC Park", "Cao Dai Temple"]


def test_extract_required_places_english_marker_stops_at_sentence():
    out = extract_required_places("Tôi muốn đi Đà Nẵng. Must include: Bana, Hoi An. Còn lại tuỳ bạn")
    assert out == ["Bana", "Hoi An"]


def test_extract_required_places_empty_or_no_marker():
    assert extract_required_places("") == []
    assert extract_required_places(None) == []
    assert extract_required_places("Cho tôi 3 ngày Đà Nẵng nhẹ nhàng") == []


def test_normalize_required_places_dedup_case_and_diacritic():
    out = normalize_required_places(["Bà Nà", "ba na", "BÀ NÀ", "Cầu Vàng"])
    assert out == ["Bà Nà", "Cầu Vàng"]
