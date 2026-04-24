"""
Gap-filling — targeted Tavily search for each missing field.
"""
from __future__ import annotations

import os
import re
import time

from langchain_tavily import TavilySearch
from langchain_core.messages import HumanMessage, SystemMessage
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from loguru import logger

from app.config.settings import llm, console
from app.config.constants import MAX_GAP_FILLS
from app.models.place import PlaceInput
from app.prompts.extraction import GAP_FILL_PROMPT, GAP_FILL_INSTRUCTIONS

_tavily = TavilySearch(max_results=3, name="gap_fill_search")
_DELAY = float(os.environ.get("SCRAPER_SEARCH_DELAY", "1.0"))


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10),
       retry=retry_if_exception_type(Exception), reraise=False)
def _search_targeted(name: str, destination: str, field: str) -> str:
    queries: dict[str, list[str]] = {
        "base_price": [
            f"giá vé {name} {destination} 2026 VND",
            f"{name} {destination} admission price 2026",
        ],
        "address": [
            f"địa chỉ {name} {destination}",
            f"address {name} {destination} Vietnam",
        ],
        "hours": [
            f"giờ mở cửa {name} {destination}",
            f"opening hours {name} {destination}",
        ],
    }
    qs = queries.get(field, [f"{name} {destination} {field}"])
    parts = []
    for q in qs:
        try:
            results = _tavily.invoke({"query": q})
            if isinstance(results, list):
                parts.extend(
                    f"URL: {r.get('url','')}\n{r.get('content','')}"
                    for r in results if isinstance(r, dict)
                )
            else:
                parts.append(str(results))
        except Exception as e:
            logger.debug("Search error: {}", e)
        time.sleep(_DELAY)
    return "\n\n---\n\n".join(parts)


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=6),
       retry=retry_if_exception_type(Exception), reraise=False)
def _extract_value(text: str, field: str, name: str, destination: str) -> str | None:
    if not text.strip():
        return None
    prompt = GAP_FILL_PROMPT.format(
        field=field, name=name, destination=destination,
        field_instruction=GAP_FILL_INSTRUCTIONS.get(field, f"Extract {field}"),
        search_results=text[:3000],
    )
    try:
        resp = llm.invoke([
            SystemMessage(content="You are a precise data extractor. Return ONLY the requested value."),
            HumanMessage(content=prompt),
        ])
        value = resp.content.strip()
        return None if value.upper() == "NOT_FOUND" or not value else value
    except Exception:
        raise


def _apply_value(place: PlaceInput, field: str, value: str) -> bool:
    try:
        if field == "base_price":
            digits = re.sub(r"[^\d]", "", value)
            if digits:
                price = int(digits)
                if 0 <= price <= 2_000_000:
                    place.base_price = price
                    if price == 0:
                        place.metadata["is_free"] = True
                    return True
        elif field == "address":
            if len(value) > 5:
                place.address = value
                return True
        elif field == "hours":
            if len(value) > 3:
                place.hours = value
                return True
    except Exception as e:
        logger.debug("Failed to apply {}={} for {}: {}", field, value, place.name, e)
    return False


def fill_gaps(
    incomplete: list[PlaceInput],
    destination: str,
) -> tuple[list[PlaceInput], list[PlaceInput]]:
    """
    Fill missing fields via targeted Tavily search + LLM micro-extraction.
    Returns (newly_complete, still_incomplete).
    """
    call_count = 0
    newly_complete: list[PlaceInput] = []
    still_incomplete: list[PlaceInput] = []

    priority_order = sorted(incomplete, key=lambda p: (p.category != "ATTRACTION", p.name))

    for place in priority_order:
        missing = place.missing_fields()
        if not missing:
            newly_complete.append(place)
            continue

        if call_count >= MAX_GAP_FILLS:
            logger.warning("Gap-fill limit ({}) reached — inserting as-is", MAX_GAP_FILLS)
            console.print(f"[yellow]  Gap-fill limit reached — inserting remaining as-is[/yellow]")
            still_incomplete.append(place)
            continue

        for field in missing:
            if call_count >= MAX_GAP_FILLS:
                break
            logger.info("Gap-fill: {} — {}", place.name, field)
            console.print(f"  [cyan]Gap-fill: {place.name} — {field}[/cyan]")

            search_text = _search_targeted(place.name, destination, field)
            call_count += 1

            value = _extract_value(search_text, field, place.name, destination)
            if value and _apply_value(place, field, value):
                console.print(f"    [green]✓ {field} = {value[:60]}[/green]")
            else:
                console.print(f"    [yellow]✗ Not found[/yellow]")

        remaining = place.missing_fields()
        if not remaining:
            newly_complete.append(place)
        else:
            still_incomplete.append(place)

    console.print(
        f"  Gap-fill done: {call_count} searches, "
        f"[green]{len(newly_complete)} fixed[/green], "
        f"[yellow]{len(still_incomplete)} still incomplete[/yellow]"
    )
    return newly_complete, still_incomplete
