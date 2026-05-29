"""
extractor/prose_parser.py — Regex extraction of day / time / place markers.

The agent is instructed to format each plan slot as:

    - **HH:MM-HH:MM** | <buổi> | **<tên địa điểm>** — <mô tả>

with day headers like `## Ngày 1: ...`. Anything outside that pattern is
ignored — the parser never tries to NER-extract free prose because that
would re-introduce the ambiguity we're escaping from.

Tolerated variation in the slot line:
    - hyphen / en-dash / em-dash between times: `13:00-15:00`, `13:00–15:00`
    - missing description: `- **08:00-09:00** | Sáng | **Linh Ứng**`
    - emojis or leading whitespace before the bullet
    - bullet char `-` or `*`
    - "buổi" label in any Vietnamese spelling (with diacritics)

Tolerated variation in the day header:
    - `# Ngày 1`, `## Ngày 1:`, `### Ngày 1: Đến nơi`
    - case-insensitive `ngày`

Returns plain dataclasses so downstream code can iterate without dict typos.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterator


# Day header: matches `# Ngày 1`, `## Ngày 1:`, `### Ngày 2 - Chinh phục Ba Na`.
# We allow optional title after a `:` or `-` separator.
# NOTE: every gap is `[^\S\n]*` (horizontal whitespace only), never `\s*`.
# A bare `\s*` after the day number matches the trailing newline, letting the
# optional `[:\-–—]?` separator eat the next line's bullet and the title group
# swallow the first slot line — silently dropping it. Pinning to horizontal
# whitespace keeps the header match on its own line.
_DAY_RE = re.compile(
    r"^[^\S\n]*#{1,4}[^\S\n]*(?:Ngày|NGÀY|ngày|Day)[^\S\n]*(\d+)[^\S\n]*[:\-–—]?[^\S\n]*(.*?)[^\S\n]*$",
    re.MULTILINE,
)

# Slot line: bullet → bold time range → | buổi | bold place → optional description.
# We deliberately do not require the trailing description.
_SLOT_RE = re.compile(
    r"""
    ^\s*[-*+]\s*                              # bullet
    (?:\W{0,3})?                              # optional emoji prefix
    \*\*\s*
    (?P<start>\d{1,2}:\d{2})                  # HH:MM
    \s*[-–—]\s*
    (?P<end>\d{1,2}:\d{2})
    \s*\*\*
    \s*\|\s*
    (?P<bucket>[^|]+?)                        # buổi label
    \s*\|\s*
    \*\*\s*(?P<place>[^*]+?)\s*\*\*           # bolded place name
    [^\w\n—–:\-]*                             # tolerate ⭐/emoji decoration after the name
    (?:[—–:\-]\s*(?P<note>.+?))?              # optional description
    \s*$
    """,
    re.MULTILINE | re.VERBOSE,
)

# Buổi label → slot_type. The mapping is forgiving: it lowercases + strips
# diacritics before matching so "Sáng sớm" / "sang som" / "SÁNG" all map.
_BUCKET_MAP = {
    "sang som": "morning_activity",
    "sang": "morning_activity",
    "trua": "lunch",
    "chieu": "afternoon_activity",
    "toi": "evening_activity",
    "ca ngay": "full_day_activity",
    "an sang": "breakfast",
    "an trua": "lunch",
    "an toi": "dinner",
    "bua sang": "breakfast",
    "bua trua": "lunch",
    "bua toi": "dinner",
}

# Words in the note that override the bucket → meal slot_type. If the agent
# writes `**12:00-13:30** | Trưa | **Bún Chả Cá** — ăn trưa đặc sản` we treat
# it as `lunch` (FOOD) rather than `afternoon_activity` (ATTRACTION).
_MEAL_HINTS = {
    "breakfast": ("bua sang", "an sang", "diem tam"),
    "lunch":     ("bua trua", "an trua"),
    "dinner":    ("bua toi", "an toi"),
}


def _strip_marker(name: str) -> str:
    """Drop trailing decoration the agent appends to must-visit places.

    The prompt instructs marking must-visit spots with ⭐ (see prompts/agent.py).
    The star may land just after the bold (`**Biển Mỹ Khê** ⭐` — handled by the
    slot regex) or *inside* it (`**Biển Mỹ Khê ⭐**` — captured into `place`).
    We strip only a trailing run of symbol/emoji chars (⭐ is Unicode category
    "So") plus whitespace, so the resolver matches the clean name. Meaningful
    punctuation is kept — "Chợ Hàn (Han Market)" must retain its closing ")",
    and "Bún Chả Cá 109" its digit.
    """
    import unicodedata
    chars = list(name.strip())
    while chars and (
        unicodedata.category(chars[-1]).startswith("S")  # symbols incl. emoji ⭐
        or unicodedata.category(chars[-1]) == "Cf"        # variation selectors
        or chars[-1].isspace()
    ):
        chars.pop()
    return "".join(chars).strip()


def _ascii_fold(text: str) -> str:
    """Strip Vietnamese diacritics for forgiving keyword matching.

    Uses NFD normalisation then drops combining marks. Doesn't touch the
    original text — only used inside the parser for lookup keys.
    """
    import unicodedata
    nfd = unicodedata.normalize("NFD", text or "")
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn").lower().strip()


@dataclass
class ProseSlot:
    """One parsed slot before DB resolution.

    `place_name` is the raw bolded text from the LLM; `slot_type` is the
    coarse classification used by FE rendering (FOOD vs ATTRACTION). The
    fuzzy-resolver fills in `place_id`/coords later.
    """
    start: str           # "HH:MM"
    end: str             # "HH:MM"
    slot_type: str       # "breakfast" | "lunch" | "dinner" | "morning_activity" | ...
    place_name: str
    note: str = ""


@dataclass
class ProseDay:
    """One parsed day before DB resolution."""
    day_num: int
    title: str = ""
    slots: list[ProseSlot] = field(default_factory=list)


def _classify_slot_type(bucket_label: str, note: str) -> str:
    """Decide the slot_type, biasing toward meal slots when context hints at one.

    The bucket label gives the coarse "buổi", but a note like "ăn trưa" should
    upgrade `afternoon_activity` to `lunch` so the FE shows a food card with
    a fork icon instead of a generic attraction marker.
    """
    note_folded = _ascii_fold(note or "")
    for meal, hints in _MEAL_HINTS.items():
        if any(h in note_folded for h in hints):
            return meal

    bucket_folded = _ascii_fold(bucket_label or "")
    # Try exact match first, then prefix match (so "sang som di Linh Ung" still hits).
    if bucket_folded in _BUCKET_MAP:
        return _BUCKET_MAP[bucket_folded]
    for key, mapped in _BUCKET_MAP.items():
        if bucket_folded.startswith(key):
            return mapped
    return "morning_activity"  # safe default — never blocks rendering


def _iter_day_blocks(text: str) -> Iterator[tuple[int, str, str]]:
    """Yield (day_num, title, body_until_next_day_or_end) for each day header."""
    matches = list(_DAY_RE.finditer(text))
    if not matches:
        return
    for idx, match in enumerate(matches):
        day_num = int(match.group(1))
        title = (match.group(2) or "").strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        yield day_num, title, text[start:end]


def parse_prose(text: str) -> list[ProseDay]:
    """Parse the LLM prose into a list of ProseDay.

    Empty list signals "this response doesn't contain a recognisable
    itinerary structure" — the caller falls back to legacy behaviour
    (no plan card, just chat bubble).
    """
    if not text or "Ngày" not in text and "Day " not in text:
        return []

    days: list[ProseDay] = []
    for day_num, title, body in _iter_day_blocks(text):
        slots: list[ProseSlot] = []
        for m in _SLOT_RE.finditer(body):
            place_name = _strip_marker(m.group("place"))
            if not place_name:
                continue
            note = (m.group("note") or "").strip()
            slot_type = _classify_slot_type(m.group("bucket"), note)
            slots.append(
                ProseSlot(
                    start=m.group("start"),
                    end=m.group("end"),
                    slot_type=slot_type,
                    place_name=place_name,
                    note=note,
                )
            )
        if slots:
            days.append(ProseDay(day_num=day_num, title=title, slots=slots))

    days.sort(key=lambda d: d.day_num)
    return days
