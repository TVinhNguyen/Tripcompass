"""
Destination analyst agent — researches weather, season, events for the trip destination.

Includes file-based cache keyed by (destination, month_year) to avoid repeated
web searches for the same destination in the same month.  Cache TTL = 7 days.
"""

from __future__ import annotations

import hashlib, json, os, time
from datetime import datetime
from pathlib import Path

from langchain_core.messages import SystemMessage, HumanMessage

from app.config.settings import llm, llm_with_tools, console, TODAY
from app.models.state import TravelPipelineState
from app.prompts.analyst import ANALYST_SYSTEM
from app.services.search_tools import _run_safe_tool_calls

# ── Cache config ─────────────────────────────────────────────────────────────
_CACHE_DIR = Path(os.environ.get("ANALYST_CACHE_DIR", "/tmp/tripcompass_analyst_cache"))
_CACHE_TTL = int(os.environ.get("ANALYST_CACHE_TTL_SECONDS", str(7 * 86400)))  # 7 days


def _cache_key(destination: str, month_year: str) -> str:
    raw = f"{destination.strip().lower()}|{month_year.strip().lower()}"
    return hashlib.md5(raw.encode()).hexdigest()


def _read_cache(key: str) -> str | None:
    path = _CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        if time.time() - data.get("ts", 0) > _CACHE_TTL:
            path.unlink(missing_ok=True)
            return None
        return data.get("context")
    except Exception:
        return None


def _write_cache(key: str, context: str) -> None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (_CACHE_DIR / f"{key}.json").write_text(
            json.dumps({"context": context, "ts": time.time()})
        )
    except Exception:
        pass


# ── Agent node ───────────────────────────────────────────────────────────────

def destination_analyst(state: TravelPipelineState) -> dict:
    console.print("\n[bold blue]━━━ DESTINATION ANALYST ━━━[/bold blue]")
    trip = state["trip"]
    try:
        month_year = datetime.strptime(trip["departure_date"], "%Y-%m-%d").strftime("%B %Y")
    except ValueError:
        month_year = "upcoming"

    # ── Check cache first ────────────────────────────────────────────────
    key    = _cache_key(trip["destination"], month_year)
    cached = _read_cache(key)
    if cached:
        console.print(f"[green]  Cache hit for {trip['destination']} / {month_year}[/green]")
        console.print(f"[dim]  {cached[:200]}...[/dim]")
        updated = dict(state["trip"])
        updated["destination_context"] = cached
        return {"trip": updated}

    # ── Cache miss → web search ──────────────────────────────────────────
    system = ANALYST_SYSTEM.format(
        today=TODAY, destination=trip["destination"], month_year=month_year,
        departure_date=trip["departure_date"], return_date=trip["return_date"],
    )
    seed    = HumanMessage(content=f"Search: {trip['destination']} {month_year} travel tips. Call web_search now.")
    ai_resp = llm_with_tools.invoke([SystemMessage(content=system), seed])

    if hasattr(ai_resp, "tool_calls") and ai_resp.tool_calls:
        tool_msgs = _run_safe_tool_calls(ai_resp.tool_calls)
        final     = llm.invoke([SystemMessage(content=system), seed, ai_resp] + tool_msgs)
        context   = final.content
    else:
        context = ai_resp.content

    _write_cache(key, context)
    console.print(f"[dim]  {context[:200]}...[/dim]")
    updated = dict(state["trip"])
    updated["destination_context"] = context
    return {"trip": updated}
