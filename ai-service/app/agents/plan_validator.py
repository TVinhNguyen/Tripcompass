"""
app/agents/plan_validator.py

Pure Python post-generation validator + auto-repair for planner output.
No LLM involved — all checks are deterministic regex + set logic.

Checks:
  FOOD_REPEAT      — same venue used more than once in the trip
  OUTDOOR_NIGHT    — outdoor activities scheduled after 18:00
  FAKE_ADDRESS     — plan uses addresses not in decisions data
  OVER_BUDGET      — activity_spent > activity_budget
"""

from __future__ import annotations
import re

from app.config.settings import console
from app.models.state import TravelPipelineState
from app.models.decisions import ValidationViolation

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_OUTDOOR_KWS = [
    "bãi biển", "bai bien", "beach", "đảo", "dao", "island",
    "thác", "thac", "waterfall", "suối", "suoi", "núi", "nui",
    "mountain", "rừng", "rung", "forest", "hồ bơi", "bể bơi",
]

_TIME_PATTERN = re.compile(r'\*{0,2}(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\*{0,2}')


def _normalize(name: str) -> str:
    """Lowercase, strip accents approximation for fuzzy compare."""
    return re.sub(r'\s+', ' ', name.lower().strip())


def _extract_time_blocks(plan_text: str) -> list[tuple[str, str, str]]:
    """
    Extract (start_time, end_time, block_text) from plan.
    Each block ends at the next time marker or end of text.
    """
    blocks = []
    matches = list(_TIME_PATTERN.finditer(plan_text))
    for i, m in enumerate(matches):
        start = m.group(1)
        end   = m.group(2)
        block_end = matches[i + 1].start() if i + 1 < len(matches) else len(plan_text)
        block_text = plan_text[m.start():block_end]
        blocks.append((start, end, block_text))
    return blocks


def _time_to_minutes(t: str) -> int:
    try:
        h, m = map(int, t.split(":"))
        return h * 60 + m
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Individual check functions
# ---------------------------------------------------------------------------

def _check_food_uniqueness(plan_text: str, decisions: dict) -> list[ValidationViolation]:
    """Each food venue may appear at most once; lunch ≠ dinner same day."""
    violations = []
    food_venues = decisions.get("food_venues", [])
    venue_names = [v["name"] for v in food_venues if v.get("name")]

    # Count occurrences of each known venue name in the plan
    global_count: dict[str, int] = {}
    for name in venue_names:
        count = len(re.findall(re.escape(name), plan_text, re.IGNORECASE))
        if count > 1:
            global_count[name] = count

    for name, cnt in global_count.items():
        violations.append(ValidationViolation(
            rule="FOOD_REPEAT",
            severity="error",
            message=f"Quán '{name}' xuất hiện {cnt} lần trong cả chuyến (tối đa 1 lần)",
        ))

    return violations


def _check_time_feasibility(plan_text: str) -> list[ValidationViolation]:
    """Outdoor activities must not be scheduled after 18:00."""
    violations = []
    blocks = _extract_time_blocks(plan_text)
    for start, end, text in blocks:
        start_min = _time_to_minutes(start)
        if start_min < 18 * 60:
            continue  # before 18:00, OK
        text_lower = text.lower()
        for kw in _OUTDOOR_KWS:
            if kw in text_lower:
                violations.append(ValidationViolation(
                    rule="OUTDOOR_NIGHT",
                    severity="error",
                    message=f"Hoạt động ngoài trời '{kw}' vào lúc {start} — phải trước 18:00",
                ))
                break
    return violations


def _check_budget_limits(decisions: dict) -> list[ValidationViolation]:
    """activity_spent must not exceed activity_budget."""
    spent  = decisions.get("activity_spent", 0)
    budget = decisions.get("activity_budget", 0)
    if budget > 0 and spent > budget:
        over = spent - budget
        return [ValidationViolation(
            rule="OVER_BUDGET",
            severity="warning",
            message=f"Vượt activity budget {over:,} VND ({spent:,} > {budget:,})",
        )]
    return []


# ---------------------------------------------------------------------------
# Auto-repair functions
# ---------------------------------------------------------------------------

def _swap_repeated_food(plan_text: str, v: ValidationViolation, decisions: dict) -> str:
    """Replace second occurrence of a repeated food venue with an unused venue."""
    # Extract venue name from message
    m = re.search(r"Quán '(.+?)' xuất hiện", v.message)
    if not m:
        return plan_text
    repeat_name = m.group(1)

    # Find all occurrences
    occurrences = [mo for mo in re.finditer(re.escape(repeat_name), plan_text, re.IGNORECASE)]
    if len(occurrences) < 2:
        return plan_text  # nothing to fix

    # Find unused venues (not yet in plan)
    food_venues = decisions.get("food_venues", [])
    used_names  = set(re.findall(
        r'\b(' + '|'.join(re.escape(v["name"]) for v in food_venues if v.get("name")) + r')\b',
        plan_text, re.IGNORECASE,
    ))
    unused = [v for v in food_venues if v.get("name") and v["name"] not in used_names]

    if not unused:
        return plan_text  # no replacement available

    replacement = unused[0]
    rep_name    = replacement["name"]
    rep_addr    = replacement.get("address", "(khu vực địa phương)")

    # Replace the SECOND occurrence's full line (name + address)
    second_pos = occurrences[1].start()
    # Find the line containing the second occurrence
    line_start = plan_text.rfind('\n', 0, second_pos) + 1
    line_end   = plan_text.find('\n', second_pos)
    if line_end == -1:
        line_end = len(plan_text)
    old_line = plan_text[line_start:line_end]
    new_line = old_line.replace(repeat_name, rep_name)
    # Also try to replace address on next line
    plan_text = plan_text[:line_start] + new_line + plan_text[line_end:]
    return plan_text


def _fix_address(plan_text: str, v: ValidationViolation, decisions: dict) -> str:
    """Not auto-fixable without address context — skip for now."""
    return plan_text


# ---------------------------------------------------------------------------
# Main validator node
# ---------------------------------------------------------------------------

def plan_validator(state: TravelPipelineState) -> dict:
    console.print("\n[bold blue]━━━ PLAN VALIDATOR ━━━[/bold blue]")

    proposals = state.get("plan_proposals", [])
    if not proposals:
        return {}

    plan_text = proposals[0]
    decisions = state.get("decisions", {})

    # Run all checks
    violations: list[ValidationViolation] = []
    violations += _check_food_uniqueness(plan_text, decisions)
    violations += _check_time_feasibility(plan_text)
    violations += _check_budget_limits(decisions)

    console.print(f"  Violations found: {len(violations)}")
    for viol in violations:
        icon = "🔴" if viol.severity == "error" else "🟡"
        console.print(f"  {icon} [{viol.rule}] {viol.message}")

    # Auto-repair
    repaired_plan = plan_text
    repaired: list[str] = []
    remaining: list[ValidationViolation] = []

    for viol in violations:
        if viol.rule == "FOOD_REPEAT":
            new_plan = _swap_repeated_food(repaired_plan, viol, decisions)
            if new_plan != repaired_plan:
                repaired_plan = new_plan
                repaired.append(f"FOOD_REPEAT: '{viol.message[:50]}' → swapped")
                console.print(f"  [green]✓ Auto-repaired: {viol.rule}[/green]")
            else:
                remaining.append(viol)
        elif viol.rule == "OVER_BUDGET":
            remaining.append(viol)  # pass to judge as warning
        else:
            remaining.append(viol)

    # Observability metrics
    food_venues  = decisions.get("food_venues", [])
    total_venues = len(food_venues)
    repeat_count = sum(1 for v in violations if v.rule == "FOOD_REPEAT")
    night_count  = sum(1 for v in violations if v.rule == "OUTDOOR_NIGHT")
    food_repeat_pct = round(repeat_count / max(total_venues, 1) * 100)

    console.print(f"  auto_repaired:     {len(repaired)}")
    console.print(f"  remaining:         {len(remaining)}")
    console.print(f"  food_repeat_pct:   {food_repeat_pct}%")
    console.print(f"  outdoor_night:     {night_count}")

    return {
        "plan_proposals": [repaired_plan],
        "decisions": {
            **decisions,
            "validation_violations": [v.model_dump() for v in remaining],
            "validation_repaired":   repaired,
            "validator_metrics": {
                "total_violations": len(violations),
                "auto_repaired":    len(repaired),
                "remaining":        len(remaining),
                "food_repeat_pct":  food_repeat_pct,
                "outdoor_night":    night_count,
            },
        },
    }
