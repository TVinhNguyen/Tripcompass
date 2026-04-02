"""
app/agents/db_lookup.py

DBLookupAgent — queries the backend's knowledge-base API before dispatching web research.

Calls: GET {BACKEND_URL}/api/v1/knowledge-base/lookup?destination=...&stale_days=30

If the backend returns sufficient fresh data:
    → populates state["research"] directly and sets state["skip_research"] = True
    → the pipeline skips the three web-research agents (attractions, food, combos)

If insufficient / stale / backend unreachable:
    → sets state["skip_research"] = False
    → the pipeline runs web research as normal

Output text uses "### Name" markdown-header format so that decision_engine parsers
(_parse_attractions, _parse_food_venues) can consume it unchanged.
"""

from __future__ import annotations

import os

import httpx

from app.config.settings import console

BACKEND_URL    = os.environ.get("BACKEND_URL", "http://localhost:8080").rstrip("/")
STALE_DAYS     = int(os.environ.get("DB_PRICE_STALE_DAYS", "30"))
MIN_ATTRACTIONS = int(os.environ.get("DB_MIN_ATTRACTIONS", "5"))
MIN_FOOD        = int(os.environ.get("DB_MIN_FOOD", "8"))


# ── Format helpers ────────────────────────────────────────────────────────────

def _fmt_attractions(rows: list[dict]) -> str:
    """Convert backend attraction objects → markdown text for decision_engine._parse_attractions."""
    lines: list[str] = []
    for r in rows:
        name = r.get("name") or r.get("name_en") or "Unknown"
        lines.append(f"### {name}")

        if r.get("address"):
            lines.append(f"- Address: {r['address']}")
        if r.get("area"):
            lines.append(f"- Area: {r['area']}")

        if r.get("full_day"):
            lines.append("- Full day: true")

        if r.get("is_free"):
            lines.append("- Admission: Free / Miễn phí")
        elif r.get("price_vnd", 0):
            lines.append(f"- Admission: {r['price_vnd']:,} VND/person")

        if r.get("hours"):
            lines.append(f"- Hours: {r['hours']}")
        if r.get("description"):
            lines.append(f"- {r['description'][:120]}")
        if r.get("source_url"):
            lines.append(f"- Source: {r['source_url']}")
        lines.append("")

    return "\n".join(lines).strip()


def _fmt_food(rows: list[dict]) -> str:
    """Convert backend food_venue objects → markdown text for decision_engine._parse_food_venues."""
    lines: list[str] = []
    for r in rows:
        name = r.get("name") or "Unknown"
        lines.append(f"### {name}")

        if r.get("address"):
            lines.append(f"- Address: {r['address']}")
        if r.get("specialty"):
            lines.append(f"- Specialty: {r['specialty']}")

        p_min = r.get("price_min")
        p_max = r.get("price_max")
        if p_min and p_max:
            lines.append(f"- Price: {p_min:,} – {p_max:,} VND/người")
        elif p_min:
            lines.append(f"- Price: {p_min:,} VND/người")

        if r.get("hours"):
            lines.append(f"- Hours: {r['hours']}")
        if r.get("meal_types"):
            types = r["meal_types"]
            if isinstance(types, list):
                lines.append(f"- Meal types: {', '.join(types)}")
            else:
                lines.append(f"- Meal types: {types}")
        lines.append("")

    return "\n".join(lines).strip()


def _fmt_combos(rows: list[dict]) -> str:
    """Convert backend combo objects → markdown text for budget_validator / decision_engine."""
    if not rows:
        return ""
    lines: list[str] = []
    for r in rows:
        name = r.get("name") or "Unknown combo"
        provider = r.get("provider") or ""
        header = f"### {provider} — {name}".strip("— ") if provider else f"### {name}"
        lines.append(header)

        if r.get("price_per_person"):
            lines.append(f"- Price: {r['price_per_person']:,} VND/person")
        if r.get("includes"):
            inc = r["includes"]
            if isinstance(inc, list):
                lines.append(f"- Includes: {', '.join(inc)}")
            else:
                lines.append(f"- Includes: {inc}")
        if r.get("benefits"):
            ben = r["benefits"]
            if isinstance(ben, list):
                lines.append(f"- Benefits: {', '.join(ben)}")
            else:
                lines.append(f"- Benefits: {ben}")
        if r.get("duration_days"):
            lines.append(f"- Duration: {r['duration_days']} days")
        if r.get("book_url"):
            lines.append(f"- Book: {r['book_url']}")
        lines.append("")

    return "\n".join(lines).strip()


# ── Agent node ────────────────────────────────────────────────────────────────

def db_lookup_agent(state: dict) -> dict:
    """
    LangGraph node: query the backend knowledge-base API for destination data.

    Sets:
        state["skip_research"]  True  → DB hit, skip web research
                                False → DB miss, run web research
        state["research"]       populated only on DB hit
    """
    destination = (state.get("trip") or {}).get("destination", "")
    if not destination:
        console.print("[yellow]  DB Lookup: no destination in state — skipping.[/yellow]")
        return {"skip_research": False}

    console.print(f"[cyan]  DB Lookup: querying backend for '{destination}'…[/cyan]")

    url = f"{BACKEND_URL}/api/v1/knowledge-base/lookup"
    params = {"destination": destination, "stale_days": str(STALE_DAYS)}
    console.print(f"[dim]  → GET {url}?destination={destination}&stale_days={STALE_DAYS}[/dim]")

    try:
        resp = httpx.get(url, params=params, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        console.print(f"[yellow]  DB Lookup: backend call failed ({exc}) — falling back to web research.[/yellow]")
        return {"skip_research": False}

    attractions = data.get("attractions") or []
    food_venues = data.get("food_venues") or []
    combos      = data.get("combos") or []

    n_attr  = len(attractions)
    n_food  = len(food_venues)
    n_combo = len(combos)
    console.print(f"[dim]  ← Response: {n_attr} attractions, {n_food} food, {n_combo} combos[/dim]")

    if n_attr >= MIN_ATTRACTIONS and n_food >= MIN_FOOD:
        console.print(
            f"[green]  DB hit: {n_attr} attractions, {n_food} food venues, "
            f"{n_combo} combos — skipping web research.[/green]"
        )
        return {
            "research": {
                "attractions": _fmt_attractions(attractions),
                "food":        _fmt_food(food_venues),
                "combos":      _fmt_combos(combos),
            },
            "skip_research": True,
        }
    else:
        console.print(
            f"[yellow]  DB miss for '{destination}': "
            f"{n_attr} attractions (need {MIN_ATTRACTIONS}), {n_food} food (need {MIN_FOOD}) "
            f"— running web research.[/yellow]"
        )
        return {"skip_research": False}
