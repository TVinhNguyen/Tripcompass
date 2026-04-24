"""
CLI entry point for scraper-service.

Usage:
    python -m app --dest "Nha Trang"
    python -m app --dest "Nha Trang" --category ATTRACTION
    python -m app --dest "Nha Trang" --dry-run
    python -m app --dest "Nha Trang" --skip-existing
    python -m app --dest "Nha Trang" --no-apify
    python -m app --dest "Nha Trang" --no-serpapi
    python -m app --all
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from loguru import logger
from rich.console import Console

# Setup loguru
LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / f"scraper_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logger.remove()
logger.add(
    sys.stderr,
    format="<cyan>{time:HH:mm:ss}</cyan> | <level>{level: <8}</level> | <level>{message}</level>",
    level="INFO",
)
logger.add(
    LOG_FILE, rotation="50 MB", retention="7 days",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}",
    level="DEBUG", encoding="utf-8",
)

console = Console()

from app.config.constants import DESTINATION_LIST
from app.services.post import db_has_enough
from app.pipeline.runner import run_scraper

DELAY_BETWEEN = int(os.environ.get("SCRAPER_DELAY_BETWEEN", "3"))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="TripCompass Scraper Service — LangGraph pipeline with Apify + Tavily"
    )
    parser.add_argument("--dest", help="Destination (e.g. 'Nha Trang')")
    parser.add_argument("--all", action="store_true", help="Scrape all destinations")
    parser.add_argument("--category", choices=["ATTRACTION", "FOOD"], help="Filter by category")
    parser.add_argument("--dry-run", action="store_true", help="Preview only — do NOT POST to DB")
    parser.add_argument("--skip-existing", action="store_true", help="Skip if DB already has enough data")
    parser.add_argument("--no-apify", action="store_true", help="Skip Apify enrichment")
    parser.add_argument("--no-serpapi", action="store_true", help="Skip SerpAPI fallback enrichment")
    args = parser.parse_args()

    if not args.dest and not args.all:
        parser.error("Cần --dest 'Destination' hoặc --all")

    targets = DESTINATION_LIST if args.all else [args.dest]

    logger.info("Scraping {} destination(s)…", len(targets))
    console.print(f"\n[bold]Scraping {len(targets)} destination(s)…[/bold]")
    if args.dry_run:
        console.print("[yellow]DRY RUN mode — không write vào DB[/yellow]")

    success = skipped = failed = 0

    for i, dest in enumerate(targets, 1):
        try:
            console.print(f"\n[bold][{i}/{len(targets)}][/bold]", end=" ")

            if args.skip_existing and not args.dry_run and db_has_enough(dest):
                console.print(f"[dim]{dest} — DB đã đủ data, skip.[/dim]")
                skipped += 1
                continue

            ok = run_scraper(
                destination=dest,
                category_filter=args.category,
                dry_run=args.dry_run,
                no_serpapi=args.no_serpapi,
                no_apify=args.no_apify,
            )
            if ok:
                success += 1
            else:
                failed += 1

        except Exception as e:
            logger.error("CRASH processing {}: {}", dest, e, exc_info=True)
            console.print(f"\n[bold red]✗ CRASH: {dest} — {e}[/bold red]")
            failed += 1

        if i < len(targets):
            time.sleep(DELAY_BETWEEN)

    summary = f"Done! {success} success, {skipped} skipped, {failed} failed."
    logger.info(summary)
    console.print(f"\n[bold]{summary}[/bold]")
    console.print(f"[dim]Log: {LOG_FILE}[/dim]")


if __name__ == "__main__":
    main()
