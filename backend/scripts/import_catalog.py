"""Import scraped video-catalog JSON into the catalog candidate pool.

Reads the normalized scrape output (the shape produced by the Language Reactor
catalog scrape: ``youtube_id`` / ``youtube_url`` / ``title`` / ``view_count`` /
``channel_id`` / ``channel_name`` / ``duration_ms`` / ``publish_date`` /
``thumbnail`` / ``freq_rank95`` / ``popularity_score`` / ``subs_yt`` / ...),
maps it to canonical catalog fields, and upserts into ``catalog_items`` via
``catalog_service.import_records`` (idempotent by ``(source, upstream_id)``).

The pool is staging only — nothing is downloaded or published here. Admins then
promote candidates one at a time via ``POST /api/v1/admin/catalog/{id}/promote``.

Usage:
    cd backend && python scripts/import_catalog.py
    cd backend && python scripts/import_catalog.py --input path/to/videos.json --source languagereactor
    cd backend && python scripts/import_catalog.py --dry-run
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import async_session
from app.core.logging import get_logger
from app.services import catalog_service

logger = get_logger(__name__)

DEFAULT_INPUT = Path(__file__).parent / "data" / "languagereactor_yt_en.json"

# Curation boost added on top of catalog_service.compute_fit_score (the numeric
# screen) so learning-oriented channels lead the default fit ordering. Keyed by
# the `category` tag the re-scrape assigns per Language Reactor channel; records
# without a category (e.g. the date-sorted news pool) get no boost.
CATEGORY_BOOST = {"english-learning": 18.0, "educational": 12.0, "talk": 8.0}


def to_canonical(r: dict) -> dict:
    """Map a normalized Language Reactor scrape record to canonical catalog fields."""
    dur_ms = r.get("duration_ms")
    dur_sec = int(dur_ms // 1000) if isinstance(dur_ms, (int, float)) else None
    subs = bool(r.get("subs_yt"))
    base = catalog_service.compute_fit_score(dur_sec, subs, r.get("freq_rank95"), r.get("view_count"))
    fit = round(min(base + CATEGORY_BOOST.get(r.get("category") or "", 0.0), 100.0), 1)
    return {
        "upstream_id": r.get("youtube_id"),
        "source_url": r.get("youtube_url"),
        "title": r.get("title"),
        "channel_id": r.get("channel_id"),
        "channel_name": r.get("channel_name"),
        "ext_view_count": r.get("view_count"),
        "duration_sec": dur_sec,
        # publish_date is a "YYYY-MM-DD" string; the service parses it.
        "publish_date": r.get("publish_date"),
        "thumbnail_url": r.get("thumbnail"),
        "subs_available": subs,
        "freq_rank95": r.get("freq_rank95"),
        "popularity_score": r.get("popularity_score"),
        "fit_score": fit,
        # raw_meta keeps the lossless record incl. category / lr_channel.
        "raw_meta": r,
    }


async def main(input_path: Path, source: str, dry_run: bool) -> None:
    if not input_path.exists():
        logger.error("input file not found: %s", input_path)
        raise SystemExit(1)

    raw = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        logger.error("expected a JSON array of video records in %s", input_path)
        raise SystemExit(1)

    records = [to_canonical(r) for r in raw]
    logger.info("loaded %d records from %s (source=%s)", len(records), input_path, source)

    async with async_session() as db:
        result = await catalog_service.import_records(db, records, source=source, commit=not dry_run)
        if dry_run:
            await db.rollback()
            logger.info("dry-run (rolled back): %s", result)
        else:
            logger.info("import complete: %s", result)
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Scrape JSON to import")
    parser.add_argument("--source", default="languagereactor", help="Provenance tag for the candidates")
    parser.add_argument("--dry-run", action="store_true", help="Roll back instead of committing")
    args = parser.parse_args()
    asyncio.run(main(input_path=args.input, source=args.source, dry_run=args.dry_run))
