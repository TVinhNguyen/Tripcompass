"""
LangGraph pipeline assembly for scraper-service.

Flow:
  START → dispatch_research → [attractions_agent || food_agent || combos_agent] (parallel Send)
       → collect_research → extract_node → validate_node → fill_gaps_node
       → enrich_node → post_node → END
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from langgraph.graph import StateGraph, END
from langgraph.types import Send

from app.pipeline.state import ScraperState
from app.config.settings import console
from loguru import logger


def dispatch_research(state: ScraperState) -> list[Send]:
    """Fan-out: send parallel research tasks to 3 agent nodes."""
    dest = state["destination"]
    year = state["year"]
    cf = state.get("category_filter")
    sends = []

    if not cf or cf == "ATTRACTION":
        sends.append(Send("attractions_agent", {"destination": dest, "year": year}))
    if not cf or cf == "FOOD":
        sends.append(Send("food_agent", {"destination": dest, "year": year}))
    # combos always
    sends.append(Send("combos_agent", {"destination": dest, "year": year}))

    console.print(f"[bold cyan]  Dispatching {len(sends)} research agents in parallel…[/bold cyan]")
    return sends


def attractions_agent_node(sub_state: dict) -> dict:
    from app.agents.research.attractions import research_attractions
    dest = sub_state["destination"]
    year = sub_state["year"]
    text = research_attractions(dest, year)
    return {"research": {"attractions": text}}


def food_agent_node(sub_state: dict) -> dict:
    from app.agents.research.food import research_food
    dest = sub_state["destination"]
    year = sub_state["year"]
    text = research_food(dest, year)
    return {"research": {"food": text}}


def combos_agent_node(sub_state: dict) -> dict:
    from app.agents.research.combos import research_combos
    dest = sub_state["destination"]
    year = sub_state["year"]
    text = research_combos(dest, year)
    return {"research": {"combos": text}}


def extract_node(state: ScraperState) -> dict:
    from app.agents.extractor import extract_places, extract_combos
    console.print("[cyan]  Extracting with LLM…[/cyan]")
    research = state.get("research", {})
    dest = state["destination"]
    cf = state.get("category_filter")

    attr_text = research.get("attractions", "")
    food_text = research.get("food", "")
    combo_text = research.get("combos", "")

    places = extract_places(dest, attr_text, food_text)
    combos = extract_combos(dest, combo_text)

    if cf:
        places = [p for p in places if p.category == cf]

    return {"places": places, "combos": combos}


def validate_node(state: ScraperState) -> dict:
    from app.services.validate import validate_and_split
    console.print("[cyan]  Validating places…[/cyan]")
    places = state.get("places", [])
    complete, incomplete = validate_and_split(places)
    return {"complete": complete, "incomplete": incomplete}


def fill_gaps_node(state: ScraperState) -> dict:
    from app.services.fill_gaps import fill_gaps
    incomplete = state.get("incomplete", [])
    complete = list(state.get("complete", []))
    if not incomplete:
        return {"complete": complete}
    console.print(f"[cyan]  Filling gaps for {len(incomplete)} places…[/cyan]")
    dest = state["destination"]
    newly_complete, still_bad = fill_gaps(incomplete, dest)
    # Merge: still_bad also gets inserted (may be incomplete but insert anyway)
    complete.extend(newly_complete)
    complete.extend(still_bad)
    return {"complete": complete}


def enrich_node(state: ScraperState) -> dict:
    from app.services.enrich import enrich_places
    places = state.get("complete", [])
    dest = state["destination"]
    no_apify = state.get("no_apify", False)
    no_serpapi = state.get("no_serpapi", False)
    console.print("[cyan]  Enriching (Apify → SerpAPI fallback)…[/cyan]")
    enriched = enrich_places(places, dest, no_apify=no_apify, no_serpapi=no_serpapi)
    return {"enriched": enriched}


def post_node(state: ScraperState) -> dict:
    from app.services.post import post_to_backend
    enriched = state.get("enriched", [])
    combos = state.get("combos", [])
    dest = state["destination"]
    dry_run = state.get("dry_run", False)

    if not enriched:
        logger.warning("No places to post for {}", dest)
        console.print("[yellow]  No places to post — skipping[/yellow]")
        return {"success": False, "error": "no_places"}

    ok = post_to_backend(dest, enriched, combos, dry_run=dry_run)
    return {"success": ok, "error": None if ok else "post_failed"}


def build_graph() -> StateGraph:
    g = StateGraph(ScraperState)

    # Research fan-out nodes
    g.add_node("attractions_agent", attractions_agent_node)
    g.add_node("food_agent", food_agent_node)
    g.add_node("combos_agent", combos_agent_node)

    # Pipeline nodes
    g.add_node("extract_node", extract_node)
    g.add_node("validate_node", validate_node)
    g.add_node("fill_gaps_node", fill_gaps_node)
    g.add_node("enrich_node", enrich_node)
    g.add_node("post_node", post_node)

    # Edges
    g.set_conditional_entry_point(dispatch_research)

    # All parallel agents converge to extract
    g.add_edge("attractions_agent", "extract_node")
    g.add_edge("food_agent", "extract_node")
    g.add_edge("combos_agent", "extract_node")

    g.add_edge("extract_node", "validate_node")
    g.add_edge("validate_node", "fill_gaps_node")
    g.add_edge("fill_gaps_node", "enrich_node")
    g.add_edge("enrich_node", "post_node")
    g.add_edge("post_node", END)

    return g.compile()
