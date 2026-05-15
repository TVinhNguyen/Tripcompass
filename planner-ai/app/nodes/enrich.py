"""
core/enrich.py — Enrichment node.
Adds natural language descriptions and tips to the validated schedule.
"""
import asyncio
from copy import deepcopy
import json
from langchain_core.messages import SystemMessage, HumanMessage
from loguru import logger
from app import config
from app.prompts.enrich import ENRICH_SYSTEM_PROMPT

_ENRICH_TIMEOUT_S = int(getattr(config, "ENRICH_LLM_TIMEOUT", 30))




async def node_enrich(state: dict) -> dict:
    schedule    = state.get("draft_schedule", {})
    retrieved   = state.get("retrieved_data", {})
    violations  = state.get("violations", [])
    warnings    = list(state.get("warnings", []))

    logger.info(f"[Node 7 Enrich] days={len(schedule.get('days', []))}, "
                f"unresolved_violations={len(violations)}")

    context = {
        "schedule":    schedule,
        "weather":     retrieved.get("weather", {}),
        "budget_tier": state.get("budget_tier", "standard"),
        "attr_budget": state.get("attr_budget", 0),
        "food_budget": state.get("food_budget", 0),
        "preferences": state.get("preferences", []),
        "guest_count": state.get("guest_count", 2),
        "warnings":    warnings,
        "has_unresolved_violations": len(violations) > 0,
    }

    messages = [
        SystemMessage(content=ENRICH_SYSTEM_PROMPT),
        HumanMessage(content=(
            "Thêm mô tả và tips cho lịch trình:\n"
            + json.dumps(context, ensure_ascii=False, separators=(",", ":"))
        )),
    ]

    try:
        response = await asyncio.wait_for(
            config.llm.ainvoke(messages), timeout=_ENRICH_TIMEOUT_S,
        )
        # Gemini/Gemma return `content` as list[dict] (multimodal parts), not str.
        # Normalize through the shared helper so this stays a string concat.
        from app.streaming.helpers import _content_to_text
        raw = _content_to_text(response.content).strip()

        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        parsed = json.loads(raw)
        enriched = _apply_enrichment_patch(schedule, parsed, warnings)

    except asyncio.TimeoutError:
        logger.warning(f"[Node 7 Enrich] LLM timeout after {_ENRICH_TIMEOUT_S}s. Returning original.")
        enriched = schedule
        warnings.append(f"Enrichment timed out after {_ENRICH_TIMEOUT_S}s — returning schedule without descriptions.")
    except json.JSONDecodeError as e:
        logger.warning(f"[Node 7 Enrich] JSON parse error: {e}. Returning original.")
        enriched = schedule
        warnings.append("Enrichment failed — returning validated schedule without descriptions.")

    # Guard: keep compatibility if a model ignored the patch instruction and
    # returned a full schedule.
    enriched = _guard_enrichment(schedule, enriched, warnings)

    cache_key = (
        f"{state.get('destination_id', '')}:"
        f"{state.get('num_days', 3)}:"
        f"{state.get('budget_tier', 'standard')}:"
        f"{state.get('travel_month', 'any')}"
    )

    logger.info(f"[Node 7 Enrich] Done. cache_key={cache_key!r}")
    return {
        "final_plan": enriched,
        "cache_key":  cache_key,
        "warnings":   warnings,
    }


def _apply_enrichment_patch(original: dict, patch: dict, warnings: list) -> dict:
    """Merge a small LLM patch into the validated schedule.

    Backward-compatible: if the model returns a full schedule, pass it through
    the existing guard instead of treating it as patch format.
    """
    if not isinstance(patch, dict):
        warnings.append("Enrichment returned non-object JSON — ignored.")
        return original

    if _looks_like_full_schedule(patch):
        warnings.append("Enrichment returned full schedule — accepted through guard.")
        return patch

    enriched = deepcopy(original)
    for key in ("trip_summary", "packing_tips", "budget_note", "weather_advice"):
        if patch.get(key):
            enriched[key] = patch[key]

    days_by_num = {
        day.get("day_num"): day
        for day in enriched.get("days", [])
        if day.get("day_num") is not None
    }
    for day_patch in patch.get("days", []) or []:
        day = days_by_num.get(day_patch.get("day_num"))
        if not day:
            continue
        if day_patch.get("day_highlight"):
            day["day_highlight"] = day_patch["day_highlight"]

        slots = day.get("slots", [])
        for slot_patch in day_patch.get("slots", []) or []:
            index = slot_patch.get("index")
            if not isinstance(index, int) or index < 0 or index >= len(slots):
                continue
            slot = slots[index]
            for key in ("description", "tip"):
                if slot_patch.get(key):
                    slot[key] = slot_patch[key]

    return enriched


def _looks_like_full_schedule(payload: dict) -> bool:
    days = payload.get("days")
    if not isinstance(days, list) or not days:
        return False
    slots = days[0].get("slots") if isinstance(days[0], dict) else None
    if not isinstance(slots, list) or not slots:
        return False
    first_slot = slots[0]
    return isinstance(first_slot, dict) and ("start" in first_slot or "slot_type" in first_slot)


def _guard_enrichment(original: dict, enriched: dict, warnings: list) -> dict:
    """Revert any LLM changes to price_vnd / start / end / place_id / slot_type."""
    orig_days = original.get("days", [])
    enr_days  = enriched.get("days", [])

    if len(orig_days) != len(enr_days):
        logger.warning("[Node 7 Guard] Day count mismatch — reverting days.")
        warnings.append("Enrichment changed day count — reverted.")
        enriched["days"] = orig_days
        return enriched

    critical = ("start", "end", "slot_type", "place_id", "price_vnd")
    for i, (orig_day, enr_day) in enumerate(zip(orig_days, enr_days)):
        orig_slots = orig_day.get("slots", [])
        enr_slots  = enr_day.get("slots", [])

        if len(orig_slots) != len(enr_slots):
            logger.warning(f"[Node 7 Guard] Day {i+1} slot count changed — reverting.")
            warnings.append(f"Day {i+1}: enrichment changed slot count — reverted.")
            enr_day["slots"] = orig_slots
            continue

        for j, (os, es) in enumerate(zip(orig_slots, enr_slots)):
            changed = [k for k in critical if os.get(k) != es.get(k)]
            if changed:
                logger.warning(f"[Node 7 Guard] Day {i+1} slot {j+1}: reverted {changed}")
                warnings.append(f"Day {i+1} slot {j+1}: enrichment changed {changed} — reverted.")
                for k in changed:
                    es[k] = os[k]

    return enriched
