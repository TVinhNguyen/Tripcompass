"""
Node 2 / Tool: Destination Resolve — Code only.
Resolves user's destination hint to a canonical DB destination string.
Fixed: uses flat config module.
"""
from loguru import logger
from app.db import get_pool
from app import config

# Alias map for common typos / English names
ALIASES: dict[str, str] = {
    "da nang": "đà nẵng",
    "danang":  "đà nẵng",
    "đà nẵng": "đà nẵng",
    "hoi an":  "hội an",
    "hoian":   "hội an",
    "hội an":  "hội an",
    "ha noi":  "hà nội",
    "hanoi":   "hà nội",
    "hà nội":  "hà nội",
    "hcmc":    "hồ chí minh",
    "ho chi minh": "hồ chí minh",
    "saigon":  "hồ chí minh",
    "sài gòn": "hồ chí minh",
    "nha trang": "nha trang",
    "phu quoc":  "phú quốc",
    "phú quốc":  "phú quốc",
    "da lat":    "đà lạt",
    "dalat":     "đà lạt",
    "đà lạt":    "đà lạt",
    "hue":       "huế",
    "huế":       "huế",
    "sapa":      "sapa",
    "ha long":   "hạ long",
    "halong":    "hạ long",
    "hạ long":   "hạ long",
    "ninh binh": "ninh bình",
    "ninh bình": "ninh bình",
    "quy nhon":  "quy nhơn",
    "quy nhơn":  "quy nhơn",
    "vung tau":  "vũng tàu",
    "vũng tàu":  "vũng tàu",
}


async def resolve_destination(hint: str) -> dict:
    """
    Resolve a destination hint to canonical form.
    Returns: {destination_id, destination_name, resolve_confidence, resolve_method, warnings?}
    """
    hint = (hint or "").lower().strip()
    warnings = []

    # ── 1. Alias map (fast, handles English names + typos) ───────────────
    canonical = ALIASES.get(hint)
    if canonical:
        logger.info(f"[resolve] '{hint}' → '{canonical}' (alias)")
        return {
            "destination_id":     canonical,
            "destination_name":   canonical.title(),
            "resolve_confidence": 1.0,
            "resolve_method":     "alias",
        }

    # ── 2. DB exact match (case-insensitive) ─────────────────────────────
    pool = await get_pool()
    row = await pool.fetchrow(
        f"SELECT DISTINCT destination FROM {config.DB_SCHEMA}.places "
        f"WHERE LOWER(destination) = LOWER($1) LIMIT 1",
        hint,
    )
    if row:
        dest = row["destination"]
        logger.info(f"[resolve] '{hint}' → '{dest}' (db_exact)")
        return {
            "destination_id":     dest,
            "destination_name":   dest.title(),
            "resolve_confidence": 0.95,
            "resolve_method":     "db_exact",
        }

    # ── 3. DB partial match (ILIKE) ───────────────────────────────────────
    row = await pool.fetchrow(
        f"SELECT DISTINCT destination FROM {config.DB_SCHEMA}.places "
        f"WHERE LOWER(destination) ILIKE $1 LIMIT 1",
        f"%{hint}%",
    )
    if row:
        dest = row["destination"]
        warnings.append(
            f"Destination '{hint}' được hiểu là '{dest}'. "
            "Nếu không đúng, vui lòng gõ rõ hơn."
        )
        logger.info(f"[resolve] '{hint}' → '{dest}' (db_partial)")
        return {
            "destination_id":     dest,
            "destination_name":   dest.title(),
            "resolve_confidence": 0.7,
            "resolve_method":     "db_partial",
            "warnings":           warnings,
        }

    # ── 4. Fallback — unresolved ──────────────────────────────────────────
    warnings.append(
        f"Không tìm thấy destination '{hint}' trong hệ thống. "
        "Vui lòng kiểm tra lại tên điểm đến."
    )
    logger.warning(f"[resolve] '{hint}' → unresolved")
    return {
        "destination_id":     hint,
        "destination_name":   hint.title(),
        "resolve_confidence": 0.0,
        "resolve_method":     "unresolved",
        "warnings":           warnings,
    }


# Legacy node wrapper for backward compat (used by old graph.py /plan endpoint)
async def node_resolve(state: dict) -> dict:
    hint = state.get("destination_hint", "")
    return await resolve_destination(hint)
