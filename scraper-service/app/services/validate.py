"""
Validate completeness — split places into complete + incomplete.
"""
from __future__ import annotations

from loguru import logger

from app.config.settings import console
from app.models.place import PlaceInput

_AREA_KEYWORDS: dict[str, list[str]] = {
    "island": ["đảo", "hòn", "island", "cù lao"],
    "far_outskirts": ["cách", "km", "huyện", "tỉnh"],
    "north": ["phía bắc", "bắc", "north"],
    "south": ["phía nam", "nam", "south", "phú quốc", "cam ranh"],
    "center": ["trung tâm", "tp.", "thành phố", "phường", "quận"],
}


def _infer_area(address: str) -> str | None:
    if not address:
        return None
    addr_lower = address.lower()
    for area, keywords in _AREA_KEYWORDS.items():
        if any(kw in addr_lower for kw in keywords):
            return area
    return "center"


def validate_and_split(places: list[PlaceInput]) -> tuple[list[PlaceInput], list[PlaceInput]]:
    """
    Returns (complete, incomplete).
    Side effect: auto-fill area from address if missing.
    """
    complete: list[PlaceInput] = []
    incomplete: list[PlaceInput] = []

    for p in places:
        if not p.area and p.address:
            p.area = _infer_area(p.address)

        missing = p.missing_fields()
        if missing:
            incomplete.append(p)
            logger.debug("Incomplete: {} ({}) — missing {}", p.name, p.category, missing)
        else:
            complete.append(p)

    logger.info("Validation: {} complete, {} incomplete", len(complete), len(incomplete))
    console.print(
        f"  Validation: [green]{len(complete)} complete[/green], "
        f"[yellow]{len(incomplete)} incomplete[/yellow]"
    )
    for p in incomplete:
        console.print(f"    [yellow]⚠ {p.name} ({p.category}): missing {p.missing_fields()}[/yellow]")
    return complete, incomplete
