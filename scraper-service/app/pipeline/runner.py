"""
Pipeline runner — invoke the LangGraph scraper graph for a single destination.
"""
from __future__ import annotations

import os
import time
from datetime import datetime

from loguru import logger
from langsmith import traceable

from app.pipeline.graph import build_graph
from app.config.settings import console

_graph = build_graph()
CURRENT_YEAR = datetime.now().year
PIPELINE_RETRIES = max(1, int(os.environ.get("SCRAPER_PIPELINE_RETRIES", "3")))
PIPELINE_BACKOFF_SECONDS = max(1, int(os.environ.get("SCRAPER_PIPELINE_BACKOFF_SECONDS", "6")))


def _is_transient_upstream_error(err: Exception) -> bool:
    s = str(err).lower()
    return any(k in s for k in [
        "request rate increased too quickly",
        "rate limit",
        "too many requests",
        "upstream error",
        "code': 502",
        '"code": 502',
    ])


@traceable(name="scrape_destination", run_type="chain")
def run_scraper(
    destination: str,
    category_filter: str | None = None,
    dry_run: bool = False,
    no_serpapi: bool = False,
    no_apify: bool = False,
) -> bool:
    """
    Run the full scraper pipeline for one destination.
    Returns True on success.
    """
    logger.info("━━━ Starting scrape: {} ━━━", destination)
    console.print(f"\n[bold cyan]━━━ {destination} ━━━[/bold cyan]")

    initial_state = {
        "destination": destination,
        "year": CURRENT_YEAR,
        "category_filter": category_filter,
        "dry_run": dry_run,
        "no_serpapi": no_serpapi,
        "no_apify": no_apify,
        "research": {},
        "places": [],
        "combos": [],
        "complete": [],
        "incomplete": [],
        "enriched": [],
        "success": False,
        "error": None,
    }

    last_err: Exception | None = None
    for attempt in range(1, PIPELINE_RETRIES + 1):
        try:
            result = _graph.invoke(initial_state)
            ok = result.get("success", False)
            if ok:
                n = len(result.get("enriched", []))
                logger.success("Completed {}: {} places", destination, n)
            else:
                logger.error("Failed {}: {}", destination, result.get("error"))
            return ok
        except Exception as e:
            last_err = e
            transient = _is_transient_upstream_error(e)
            if transient and attempt < PIPELINE_RETRIES:
                sleep_s = PIPELINE_BACKOFF_SECONDS * attempt
                logger.warning(
                    "Transient upstream error for {} (attempt {}/{}): {}. Retrying in {}s...",
                    destination,
                    attempt,
                    PIPELINE_RETRIES,
                    e,
                    sleep_s,
                )
                console.print(
                    f"[yellow]  Transient upstream error (attempt {attempt}/{PIPELINE_RETRIES}) — retry in {sleep_s}s...[/yellow]"
                )
                time.sleep(sleep_s)
                continue

            logger.error("Pipeline crashed for {}: {}", destination, e, exc_info=True)
            console.print(f"[red]  Pipeline crashed: {e}[/red]")
            return False

    logger.error("Pipeline crashed for {}: {}", destination, last_err)
    console.print(f"[red]  Pipeline crashed: {last_err}[/red]")
    return False
