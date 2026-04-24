"""
LLM extraction agent — converts research text into PlaceInput list.
Supports structured output with raw JSON fallback.
"""
from __future__ import annotations

import json
import re
import os

from langchain_core.messages import HumanMessage, SystemMessage
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from loguru import logger

from app.config.settings import llm, extractor_llm, console
from app.config.constants import MAX_ATTRACTION_VND, MAX_MEAL_VND
from app.models.place import ExtractionResult, PlaceExtraction, PlaceInput
from app.prompts.extraction import ATTRACTION_EXTRACT_PROMPT, FOOD_EXTRACT_PROMPT, COMBO_EXTRACT_PROMPT

_MAX_RETRIES = int(os.environ.get("SCRAPER_LLM_RETRIES", "2"))


def _extract_json(text: str) -> list[dict]:
    """Extract JSON array from raw LLM text."""
    text = text.strip()
    # Strip thinking blocks (Qwen3, DeepSeek-R1)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    # Strip markdown code fences
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    # Find outermost JSON array
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '[' and depth == 0:
            start = i
        if ch in ('[', '{'):
            depth += 1
        elif ch in (']', '}'):
            depth -= 1
            if ch == ']' and depth == 0 and start != -1:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    continue

    # Fallback: collect individual JSON objects
    objects = []
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '{' and depth == 0:
            start = i
        if ch in ('{', '['):
            depth += 1
        elif ch in ('}', ']'):
            depth -= 1
            if ch == '}' and depth == 0 and start != -1:
                objects.append(text[start:i + 1])

    results = []
    for obj in objects:
        try:
            results.append(json.loads(obj))
        except json.JSONDecodeError:
            logger.debug("Skipping malformed JSON object: {}", obj[:100])
    if results:
        return results

    logger.warning("Could not extract JSON from LLM response (first 500 chars): {}", text[:500])
    return []


def _warn_clipped(name: str, field: str, original, clipped) -> None:
    if original is not None and clipped is not None and original != clipped:
        logger.warning("Price clipped for '{}': {} → {} (max limit applied)", name, original, clipped)


def _attraction_to_place(dest: str, item: PlaceExtraction) -> PlaceInput:
    meta: dict = {}
    if item.is_free or item.base_price == 0:
        meta["is_free"] = True
    if item.full_day:
        meta["full_day"] = True
    if item.description:
        meta["description"] = item.description[:300]

    price = item.base_price
    if price is not None:
        clipped = max(0, min(price, MAX_ATTRACTION_VND))
        _warn_clipped(item.name, "base_price", price, clipped)
        price = clipped

    return PlaceInput(
        destination=dest, category="ATTRACTION",
        name=item.name, name_en=item.name_en,
        address=item.address, area=item.area,
        hours=item.hours, base_price=price,
        recommended_duration=item.recommended_duration or 60,
        metadata=meta, source_url=item.source_url,
        tags=item.tags[:5],
        must_visit=item.must_visit,
        priority_score=max(0, min(item.priority_score, 10)),
    )


def _food_to_place(dest: str, item: PlaceExtraction) -> PlaceInput:
    price = item.base_price
    if price is None and item.price_min is not None:
        price = (item.price_min + item.price_max) // 2 if item.price_max else item.price_min
    if price is not None:
        clipped = max(0, min(price, MAX_MEAL_VND))
        _warn_clipped(item.name, "base_price", price, clipped)
        price = clipped

    meta: dict = {}
    if item.specialty:
        meta["specialty"] = item.specialty
    if item.meal_types:
        meta["meal_types"] = item.meal_types
    if item.price_min is not None:
        meta["price_min"] = item.price_min
    if item.price_max is not None:
        meta["price_max"] = item.price_max
    if item.description:
        meta["description"] = item.description[:200]

    return PlaceInput(
        destination=dest, category="FOOD",
        name=item.name, name_en=item.name_en,
        address=item.address, area=item.area,
        hours=item.hours, base_price=price,
        recommended_duration=item.recommended_duration or 45,
        metadata=meta, source_url=item.source_url,
        tags=item.tags[:5],
        must_visit=item.must_visit,
        priority_score=max(0, min(item.priority_score, 10)),
    )


@retry(
    stop=stop_after_attempt(_MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception_type(Exception),
    reraise=False,
)
def _invoke_structured(attr_text: str, food_text: str, destination: str) -> ExtractionResult:
    struct_llm = extractor_llm.with_structured_output(ExtractionResult)
    combined = (
        f"Extract attractions AND food venues for {destination} from these search results.\n\n"
        f"ATTRACTIONS:\n{attr_text[:4000]}\n\nFOOD:\n{food_text[:4000]}"
    )
    return struct_llm.invoke([
        SystemMessage(content=(
            "You are a travel data extractor. Extract real named attractions and food venues "
            "with complete information. Do NOT make up prices or addresses.\n\n"
            "For each place, also fill:\n"
            "- recommended_duration: actual visit time in minutes based on the search results "
            "(e.g. Ba Na Hills = 300, beach = 120, museum = 75, pagoda = 60). Do NOT default to 60.\n"
            "- tags: up to 5 descriptive tags. Attractions: scenic, historic, outdoor, family-friendly, "
            "cultural, adventure, religious, beach, mountain, urban, nature. "
            "Food: local, seafood, budget, popular, traditional, street-food, restaurant, breakfast-spot.\n"
            "- must_visit: true if the place appears prominently in multiple sources as a top highlight, "
            "icon, or 'must-see' of the destination. false otherwise.\n"
            "- priority_score: integer 1-10. Base on how frequently and strongly the place is recommended "
            "across sources. 9-10 = iconic landmark, 5-6 = popular but not iconic, 1-3 = niche/little-known."
        )),
        HumanMessage(content=combined),
    ])


def extract_places(destination: str, attr_text: str, food_text: str) -> list[PlaceInput]:
    places: list[PlaceInput] = []
    seen: set[str] = set()

    # Structured output attempt
    try:
        result: ExtractionResult = _invoke_structured(attr_text, food_text, destination)
        for item in result.attractions:
            key = item.name.lower().strip()
            if key and key not in seen and len(item.name) > 2:
                seen.add(key)
                places.append(_attraction_to_place(destination, item))
        for item in result.food_venues:
            key = item.name.lower().strip()
            if key and key not in seen and len(item.name) > 2:
                seen.add(key)
                places.append(_food_to_place(destination, item))
        logger.info("Structured extraction: {} attractions, {} food", len(result.attractions), len(result.food_venues))
        console.print(f"[green]  Structured: {len(result.attractions)} attractions, {len(result.food_venues)} food[/green]")
        return places
    except Exception as e:
        logger.warning("Structured output failed ({}), falling back to raw extraction", e)
        console.print(f"[yellow]  Structured failed ({e}) — raw fallback[/yellow]")

    # Raw fallback
    for prompt_tpl, text, category in [
        (ATTRACTION_EXTRACT_PROMPT, attr_text, "ATTRACTION"),
        (FOOD_EXTRACT_PROMPT, food_text, "FOOD"),
    ]:
        if not text.strip():
            continue
        prompt = prompt_tpl.format(destination=destination, search_results=text[:8000])
        try:
            resp = llm.invoke(prompt)
            items = _extract_json(resp.content)
        except Exception as e2:
            logger.error("Raw extraction failed: {}", e2)
            continue

        for item in items:
            name = str(item.get("name", "")).strip()
            key = name.lower()
            if not name or key in seen or len(name) <= 2:
                continue
            seen.add(key)

            tags_raw = item.get("tags") or []
            if isinstance(tags_raw, str):
                tags_raw = [tags_raw]
            tags_raw = tags_raw[:5]
            priority_raw = item.get("priority_score") or 0
            try:
                priority_raw = max(0, min(int(priority_raw), 10))
            except (TypeError, ValueError):
                priority_raw = 0
            must_visit_raw = bool(item.get("must_visit", False))

            if category == "ATTRACTION":
                price = item.get("base_price") or item.get("price_vnd")
                try:
                    price = max(0, min(int(price or 0), MAX_ATTRACTION_VND)) if price else None
                except (TypeError, ValueError):
                    price = None
                meta: dict = {}
                if item.get("is_free") or price == 0:
                    meta["is_free"] = True
                if item.get("full_day"):
                    meta["full_day"] = True
                if item.get("description"):
                    meta["description"] = str(item["description"])[:300]
                places.append(PlaceInput(
                    destination=destination, category="ATTRACTION",
                    name=name, name_en=item.get("name_en"),
                    address=item.get("address"), area=item.get("area"),
                    hours=item.get("hours"), base_price=price,
                    recommended_duration=item.get("recommended_duration") or 60,
                    metadata=meta, source_url=item.get("source_url"),
                    tags=tags_raw, must_visit=must_visit_raw, priority_score=priority_raw,
                ))
            else:
                p_min = item.get("price_min")
                p_max = item.get("price_max")
                try:
                    p_min = int(p_min) if p_min else None
                    p_max = int(p_max) if p_max else None
                except (TypeError, ValueError):
                    p_min = p_max = None
                base = item.get("base_price")
                if base is None and p_min:
                    base = (p_min + p_max) // 2 if p_max else p_min
                try:
                    base = max(0, min(int(base or 0), MAX_MEAL_VND)) if base else None
                except (TypeError, ValueError):
                    base = None
                meal_types = item.get("meal_types") or ["lunch", "dinner"]
                if isinstance(meal_types, str):
                    meal_types = [meal_types]
                meta = {k: v for k, v in {
                    "specialty": item.get("specialty"),
                    "meal_types": meal_types,
                    "price_min": p_min,
                    "price_max": p_max,
                    "description": (item.get("description") or "")[:200] or None,
                }.items() if v is not None}
                places.append(PlaceInput(
                    destination=destination, category="FOOD",
                    name=name, address=item.get("address"), area=item.get("area"),
                    hours=item.get("hours"), base_price=base,
                    recommended_duration=45, metadata=meta,
                    source_url=item.get("source_url"),
                    tags=tags_raw, must_visit=must_visit_raw, priority_score=priority_raw,
                ))

    logger.info("Raw extraction: {} places total", len(places))
    console.print(f"[green]  Raw extraction: {len(places)} places total[/green]")
    return places


def extract_combos(destination: str, combo_text: str) -> list[dict]:
    if not combo_text.strip():
        return []
    prompt = COMBO_EXTRACT_PROMPT.format(destination=destination, search_results=combo_text[:8000])
    try:
        resp = llm.invoke(prompt)
        items = _extract_json(resp.content)
    except Exception as e:
        logger.warning("Combo extraction failed: {}", e)
        return []

    valid: list[dict] = []
    seen: set[str] = set()
    for item in items:
        name = str(item.get("name", "")).strip()
        if not name or name.lower() in seen:
            continue
        price = item.get("price_per_person")
        try:
            price = int(price)
        except (TypeError, ValueError):
            continue
        if not (100_000 <= price <= 5_000_000):
            continue
        seen.add(name.lower())
        includes = item.get("includes") or []
        benefits = item.get("benefits") or []
        if isinstance(includes, str):
            includes = [includes]
        if isinstance(benefits, str):
            benefits = [benefits]
        valid.append({
            "destination": destination,
            "name": name,
            "provider": item.get("provider"),
            "price_per_person": price,
            "includes": includes,
            "benefits": benefits,
            "duration_days": int(item.get("duration_days") or 1),
            "requires_overnight": bool(item.get("requires_overnight", False)),
            "book_url": item.get("book_url"),
        })

    logger.info("Combos extracted: {}", len(valid))
    console.print(f"[green]  Combos extracted: {len(valid)}[/green]")
    return valid
