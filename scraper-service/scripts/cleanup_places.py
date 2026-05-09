#!/usr/bin/env python3
"""
Clean imported TripAdvisor places in Postgres.

Default mode is dry-run. Use --apply to write changes.

Rules:
  1. Deduplicate same destination/category/normalized name.
     Keep the row with higher review count, more images, coords, address.
  2. Delete very low-signal imported rows:
     review_count = 0, no coords, and fewer than 5 images.
  3. Null obviously wrong coordinates using destination bounding boxes.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import unicodedata
from pathlib import Path
from typing import Any

import asyncpg

ROOT = Path(__file__).resolve().parents[2]


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(ROOT / "scraper-service" / ".env")
_load_env_file(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tripcompass")
DB_SCHEMA = os.getenv("DB_SCHEMA", "schema_travel")


DESTINATION_BOUNDS: dict[str, tuple[float, float, float, float]] = {
    # min_lat, max_lat, min_lng, max_lng. Broad enough for nearby islands/parks.
    "Côn Đảo": (8.45, 8.95, 106.45, 106.85),
    "Đảo Phú Quý": (10.45, 10.75, 108.80, 109.15),
    "Vĩnh Hy": (11.55, 11.75, 109.05, 109.35),
    "Phú Yên": (12.65, 13.65, 108.65, 109.55),
    "Quy Nhơn": (13.55, 14.35, 108.75, 109.45),
    "Măng Đen": (14.45, 14.75, 107.80, 108.45),
    "Mù Cang Chải": (21.60, 22.10, 103.70, 104.30),
    "Hà Giang": (22.40, 23.50, 104.50, 105.60),
    "Đảo Cát Bà": (20.60, 21.10, 106.75, 107.15),
    "Vũng Tàu": (10.25, 10.75, 106.95, 107.45),
    "Phú Quốc": (9.80, 10.50, 103.75, 104.20),
}


def normalize_name(value: str) -> str:
    value = (value or "").replace("Đ", "D").replace("đ", "d")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^a-zA-Z0-9]+", " ", value.lower())
    return re.sub(r"\s+", " ", value).strip()


def image_count(row: dict[str, Any]) -> int:
    images = row.get("images") or []
    return len(images)


def has_coords(row: dict[str, Any]) -> bool:
    return row.get("latitude") is not None and row.get("longitude") is not None


def keep_score(row: dict[str, Any]) -> tuple[int, int, int, int, int, str]:
    return (
        int(row.get("review_count") or 0),
        image_count(row),
        1 if has_coords(row) else 0,
        1 if row.get("address") else 0,
        1 if row.get("source_url") else 0,
        str(row.get("id")),
    )


def in_bounds(row: dict[str, Any]) -> bool:
    lat = row.get("latitude")
    lng = row.get("longitude")
    if lat is None or lng is None:
        return True
    bounds = DESTINATION_BOUNDS.get(row["destination"])
    if not bounds:
        return True
    min_lat, max_lat, min_lng, max_lng = bounds
    return min_lat <= float(lat) <= max_lat and min_lng <= float(lng) <= max_lng


def very_low_signal(row: dict[str, Any]) -> bool:
    return (
        int(row.get("review_count") or 0) == 0
        and not has_coords(row)
        and image_count(row) < 5
    )


async def fetch_places(conn: asyncpg.Connection, destination: str | None) -> list[dict[str, Any]]:
    where = "WHERE external_source = 'tripadvisor'"
    params: list[Any] = []
    if destination:
        params.append(destination)
        where += f" AND destination = ${len(params)}"

    rows = await conn.fetch(
        f"""
        SELECT id, destination, category::text AS category, name, external_id,
               review_count, images, latitude, longitude, address, source_url
        FROM {DB_SCHEMA}.places
        {where}
        ORDER BY destination, category, name
        """,
        *params,
    )
    return [dict(row) for row in rows]


def plan_cleanup(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    duplicate_deletes: list[dict[str, Any]] = []
    seen_delete_ids: set[str] = set()

    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for row in rows:
        key = (row["destination"], row["category"], normalize_name(row["name"]))
        groups.setdefault(key, []).append(row)

    for group_rows in groups.values():
        if len(group_rows) <= 1:
            continue
        keep = max(group_rows, key=keep_score)
        for row in group_rows:
            if row["id"] == keep["id"]:
                continue
            duplicate_deletes.append({**row, "reason": f"duplicate_name_keep={keep['external_id']}"})
            seen_delete_ids.add(str(row["id"]))

    low_quality_deletes = [
        {**row, "reason": "low_signal_zero_review_no_coords_lt5_images"}
        for row in rows
        if str(row["id"]) not in seen_delete_ids and very_low_signal(row)
    ]

    invalid_coord_updates = [
        {**row, "reason": "coords_outside_destination_bounds"}
        for row in rows
        if str(row["id"]) not in seen_delete_ids and not in_bounds(row)
    ]

    return duplicate_deletes + low_quality_deletes, invalid_coord_updates


def print_rows(title: str, rows: list[dict[str, Any]], limit: int) -> None:
    print(f"\n{title}: {len(rows)}")
    for row in rows[:limit]:
        print(
            f"  - {row['destination']} | {row['name']} | ext={row.get('external_id')} "
            f"| reviews={row.get('review_count')} | imgs={image_count(row)} "
            f"| coords={row.get('latitude')},{row.get('longitude')} | {row['reason']}"
        )
    if len(rows) > limit:
        print(f"  ... +{len(rows) - limit} more")


async def run(args: argparse.Namespace) -> int:
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        rows = await fetch_places(conn, args.destination)
        deletes, coord_updates = plan_cleanup(rows)

        print(f"Loaded places: {len(rows)}")
        print_rows("DELETE candidates", deletes, args.limit)
        print_rows("NULL coordinate candidates", coord_updates, args.limit)

        if not args.apply:
            print("\nDRY RUN only. Re-run with --apply to write changes.")
            return 0

        async with conn.transaction():
            if deletes:
                await conn.execute(
                    f"DELETE FROM {DB_SCHEMA}.places WHERE id = ANY($1::uuid[])",
                    [row["id"] for row in deletes],
                )
            if coord_updates:
                await conn.execute(
                    f"""
                    UPDATE {DB_SCHEMA}.places
                    SET latitude = NULL, longitude = NULL, updated_at = NOW()
                    WHERE id = ANY($1::uuid[])
                    """,
                    [row["id"] for row in coord_updates],
                )

        print(f"\nAPPLIED: deleted={len(deletes)}, nulled_coords={len(coord_updates)}")
        return 0
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", help="Only clean one destination")
    parser.add_argument("--apply", action="store_true", help="Write changes to DB")
    parser.add_argument("--limit", type=int, default=80, help="Rows to print per section")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
