"""
extractor/place_resolver.py — Fuzzy place-name → DB row resolver.

Strategy:
    1. Strip diacritics (unaccent) + lower-case both sides.
    2. Run pg_trgm similarity on `unaccent(lower(name))`.
    3. Boost ranking with `priority_score` and (if destination known)
       a destination filter.
    4. Return the best match if its similarity ≥ THRESHOLD, otherwise None.

Why pg_trgm not embeddings: Vietnamese place names are short, often quoted
verbatim or with one diacritic mistake. Trigram similarity catches this
robustly without the embedding-pipeline overhead (no model load, no extra
column). For a corpus of ~5k places, lookup is sub-millisecond with the
GIN index already declared in schema.sql.

Returned shape mirrors the fields the FE GenerateResponse needs (id, name,
category, base_price, lat/lng, cover_image). Unresolved names round-trip
without an `id` — the FE renders them as a text-only card.
"""
from __future__ import annotations

import asyncpg
from typing import Optional

from loguru import logger
from app.services.database import get_pool


# Above this similarity, we trust the match. Empirically ~0.35 gives good
# precision/recall on Vietnamese place names; tighter and we miss "Linh Ứng"
# vs "Chùa Linh Ứng"; looser and we mismatch "Bánh Mì" to any food cart.
_SIMILARITY_THRESHOLD = 0.35

# Maximum candidates fetched per name. Higher fan-out is wasteful since we
# always pick rank=1. Kept >1 so logs can surface near-miss candidates when
# debugging a mismatch.
_LIMIT = 3


async def _resolve_one(
    conn: asyncpg.Connection,
    name: str,
    destination: Optional[str],
) -> Optional[dict]:
    """Look up a single place name. Returns None if no candidate clears threshold."""
    if not name or not name.strip():
        return None

    # destination is optional — when provided, restrict to that area for
    # better precision (avoids matching "Chùa Linh Ứng" in HCMC when user is
    # planning Đà Nẵng). When absent, search the whole table.
    #
    # Both sides go through schema_travel.f_unaccent — the IMMUTABLE wrapper
    # built by migration 202605240015. Using the same expression on both
    # sides + same expression in the GIN index lets the planner satisfy the
    # `%` operator from the index instead of scanning every row.
    if destination:
        sql = """
            SELECT id::text, name, name_en, category::text, destination,
                   COALESCE(base_price, 0) AS base_price,
                   latitude, longitude, cover_image,
                   priority_score,
                   similarity(schema_travel.f_unaccent(lower(name)),
                              schema_travel.f_unaccent(lower($1))) AS sim
            FROM schema_travel.places
            WHERE LOWER(destination) ILIKE '%' || LOWER($2) || '%'
              AND schema_travel.f_unaccent(lower(name)) %
                  schema_travel.f_unaccent(lower($1))
            ORDER BY sim DESC, priority_score DESC NULLS LAST
            LIMIT $3
        """
        rows = await conn.fetch(sql, name, destination, _LIMIT)
    else:
        sql = """
            SELECT id::text, name, name_en, category::text, destination,
                   COALESCE(base_price, 0) AS base_price,
                   latitude, longitude, cover_image,
                   priority_score,
                   similarity(schema_travel.f_unaccent(lower(name)),
                              schema_travel.f_unaccent(lower($1))) AS sim
            FROM schema_travel.places
            WHERE schema_travel.f_unaccent(lower(name)) %
                  schema_travel.f_unaccent(lower($1))
            ORDER BY sim DESC, priority_score DESC NULLS LAST
            LIMIT $2
        """
        rows = await conn.fetch(sql, name, _LIMIT)

    if not rows:
        return None

    top = rows[0]
    if float(top["sim"]) < _SIMILARITY_THRESHOLD:
        logger.debug(
            f"[resolver] '{name}' best sim={top['sim']:.2f} (<{_SIMILARITY_THRESHOLD}) — skipped"
        )
        return None

    return {
        "id": top["id"],
        "name": top["name"],
        "name_en": top["name_en"],
        "category": top["category"],
        "destination": top["destination"],
        "base_price": int(top["base_price"] or 0),
        "latitude": top["latitude"],
        "longitude": top["longitude"],
        "cover_image": top["cover_image"],
    }


async def resolve_places(
    names: list[str],
    destination: Optional[str] = None,
) -> dict[str, Optional[dict]]:
    """Resolve a batch of names to DB rows.

    Returns a dict keyed by the *original* (un-normalised) name. Values are
    the DB row (best match) or None if nothing cleared threshold. The caller
    decides what to do with None — typically render a text-only card.

    Batches share one connection from the pool (cheap), no transaction (reads
    only). Sequential per-name for simplicity; can be turned into a single
    UNION ALL if measurement shows it matters.
    """
    if not names:
        return {}

    pool = await get_pool()
    # De-duplicate preserving order so log lines are predictable.
    seen: set[str] = set()
    unique: list[str] = []
    for n in names:
        if n and n not in seen:
            seen.add(n)
            unique.append(n)

    result: dict[str, Optional[dict]] = {}
    async with pool.acquire() as conn:
        for name in unique:
            try:
                result[name] = await _resolve_one(conn, name, destination)
            except Exception as exc:  # never let one bad name break the batch
                logger.warning(f"[resolver] '{name}' raised {type(exc).__name__}: {exc}")
                result[name] = None

    # Also fill in result entries for any duplicates the caller passed.
    for name in names:
        if name not in result and name in seen:
            # Already canonicalised above — fall through.
            continue

    matched = sum(1 for v in result.values() if v)
    logger.info(f"[resolver] resolved {matched}/{len(unique)} places (dest={destination!r})")
    return result
