"""Catalog candidate pool service (admin curation staging area).

Decouples bulk discovery from deliberate curation: scraped candidates land in
``catalog_items`` (status=new); admins promote them one at a time into the real
ingestion pipeline ("process one, publish one") via :func:`promote_item`, which
reuses the existing official-video seed path (``video_seed_service.seed_video``
-> ``process_video`` full pipeline). Nothing here re-implements processing — it
only stages candidates and hands them to the battle-tested pipeline.
"""

import math
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.catalog import CatalogItem, CatalogStatus
from app.models.video import Video, VideoStatus
from app.schemas.catalog import CatalogItemResponse
from app.schemas.pagination import paginated

# ---------------------------------------------------------------------------
# SeeWord-fit heuristic
# ---------------------------------------------------------------------------


def compute_fit_score(
    duration_sec: int | None,
    subs_available: bool,
    freq_rank95: int | None,
    ext_view_count: int | None,
) -> float:
    """Score a candidate 0-100 for SeeWord learning fit.

    Mirrors the curation criteria documented in ``scripts/seed_official_videos.py``
    (real speech, 2-20 min optimal, difficulty spread, subtitles required). The
    source catalog is ordered by upload date (news/sports heavy); this re-ranks
    the pool so learning-suitable candidates lead without discarding any.

    - Duration: peaked at 3-10 min (35) — the ideal learning-clip length;
      tapers for shorter/longer (28/18/10/3).
    - Subtitles: +25 when upstream captions exist (the pipeline needs them).
    - Difficulty (freqRank95, lower = more common vocab): sweet spot 2000-5000
      (20), very common <=2000 (12), moderate 5000-9000 (15), rare/advanced (7).
    - Engagement: gentle log-scaled view count, capped at +15 (a tiebreaker —
      high views do NOT imply good learning content).

    NOTE: fit_score is a *numeric* screen (length / captions / vocab difficulty /
    reach). It cannot judge topic quality — a well-formed 5-min news clip and a
    5-min TED talk score similarly. Topic curation (news/sports vs educational)
    is a human decision at promote time, or via the channel filter on the list
    endpoint.
    """
    # Duration: peak at 3-10 min, taper outward.
    d = duration_sec or 0
    if 180 <= d <= 600:
        dur = 35.0
    elif 120 <= d < 180 or 600 < d <= 900:
        dur = 28.0
    elif 90 <= d < 120 or 900 < d <= 1500:
        dur = 18.0
    elif 60 <= d < 90 or 1500 < d <= 2400:
        dur = 10.0
    elif d > 0:
        dur = 3.0
    else:
        dur = 8.0

    subs = 25.0 if subs_available else 0.0

    fr = freq_rank95 or 0
    if fr and fr <= 2000:
        diff = 12.0
    elif fr and fr <= 5000:
        diff = 20.0
    elif fr and fr <= 9000:
        diff = 15.0
    elif fr:
        diff = 7.0
    else:
        diff = 8.0

    eng = 0.0
    if ext_view_count and ext_view_count > 0:
        eng = min(15.0, math.log10(ext_view_count) * 2.5)

    return round(min(dur + subs + diff + eng, 100.0), 1)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _enum_val(v: object) -> str:
    return v.value if hasattr(v, "value") else str(v)


def _derive_effective_status(item: CatalogItem, video: Video | None) -> str:
    """Live status shown to the admin, derived from the promoted Video.

    ``ready`` means the pipeline finished but the video is not published yet
    (auto_publish off, awaiting a manual publish). Falls back to the catalog's
    own recorded status when there is no promoted video.
    """
    if video is None:
        return item.status
    st = _enum_val(video.status)
    if st == VideoStatus.ready.value and video.is_published:
        return CatalogStatus.published.value
    if st == VideoStatus.error.value:
        return CatalogStatus.error.value
    if st in (VideoStatus.ready.value, VideoStatus.ready_subtitles.value):
        return "ready"
    return CatalogStatus.processing.value


def _to_response(item: CatalogItem, video: Video | None = None) -> CatalogItemResponse:
    resp = CatalogItemResponse.model_validate(item)
    resp.promoted_video_status = _enum_val(video.status) if video is not None else None
    resp.promoted_video_published = bool(video.is_published) if video is not None else None
    resp.effective_status = _derive_effective_status(item, video)
    return resp


def _parse_date(v: object) -> datetime | None:
    if v is None or isinstance(v, datetime):
        return v  # type: ignore[return-value]
    if isinstance(v, str) and v.strip():
        try:
            return datetime.fromisoformat(v.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


async def import_records(
    db: AsyncSession,
    records: list[dict],
    source: str = "languagereactor",
    *,
    commit: bool = True,
) -> dict:
    """Idempotently upsert scraped candidates into the pool.

    Each record uses canonical keys (``upstream_id``, ``source_url``, ``title``,
    ``channel_id``, ``channel_name``, ``ext_view_count``, ``duration_sec``,
    ``publish_date``, ``thumbnail_url``, ``subs_available``, ``freq_rank95``,
    ``popularity_score``, optional ``fit_score``, ``raw_meta``). De-dupes on
    ``(source, upstream_id)``; re-importing refreshes metadata but never
    overwrites an item's curation state (status / promotion / notes).
    """
    existing_rows = (await db.execute(select(CatalogItem).where(CatalogItem.source == source))).scalars().all()
    by_upstream = {e.upstream_id: e for e in existing_rows}

    imported = updated = skipped = 0
    seen: set[str] = set()
    for r in records:
        upstream_id = r.get("upstream_id")
        source_url = r.get("source_url")
        if not upstream_id or not source_url or upstream_id in seen:
            skipped += 1
            continue
        seen.add(upstream_id)

        fit = r.get("fit_score")
        if fit is None:
            fit = compute_fit_score(
                r.get("duration_sec"),
                bool(r.get("subs_available", False)),
                r.get("freq_rank95"),
                r.get("ext_view_count"),
            )

        fields = {
            "source_url": source_url,
            "title": r.get("title") or "",
            "channel_id": r.get("channel_id"),
            "channel_name": r.get("channel_name"),
            "ext_view_count": r.get("ext_view_count"),
            "duration_sec": r.get("duration_sec"),
            "publish_date": _parse_date(r.get("publish_date")),
            "thumbnail_url": r.get("thumbnail_url"),
            "subs_available": bool(r.get("subs_available", False)),
            "freq_rank95": r.get("freq_rank95"),
            "popularity_score": r.get("popularity_score"),
            "fit_score": fit,
            "raw_meta": r.get("raw_meta") or r,
        }

        existing = by_upstream.get(upstream_id)
        if existing is not None:
            for k, v in fields.items():
                setattr(existing, k, v)
            updated += 1
        else:
            db.add(
                CatalogItem(
                    source=source,
                    upstream_id=upstream_id,
                    status=CatalogStatus.new.value,
                    **fields,
                )
            )
            imported += 1

    if commit:
        await db.commit()
    return {
        "source": source,
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "total": len(records),
    }


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


def _order_clause(sort: str):
    if sort == "views":
        return (CatalogItem.ext_view_count.desc().nulls_last(), CatalogItem.created_at.desc())
    if sort == "date":
        return (CatalogItem.publish_date.desc().nulls_last(), CatalogItem.created_at.desc())
    if sort == "duration":
        return (CatalogItem.duration_sec.desc().nulls_last(), CatalogItem.created_at.desc())
    if sort == "recent":
        return (CatalogItem.created_at.desc(),)
    # default: SeeWord-fit best first; break ties by popularity then recency
    return (
        CatalogItem.fit_score.desc().nulls_last(),
        CatalogItem.ext_view_count.desc().nulls_last(),
        CatalogItem.created_at.desc(),
    )


async def list_items(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    source: str | None = None,
    channel: str | None = None,
    sort: str = "fit",
    min_duration: int | None = None,
    max_duration: int | None = None,
    keyword: str | None = None,
) -> dict:
    """Paginated candidate list with live promoted-video status."""
    base = select(CatalogItem)
    if status:
        base = base.where(CatalogItem.status == status)
    if source:
        base = base.where(CatalogItem.source == source)
    if channel and channel.strip():
        base = base.where(func.lower(CatalogItem.channel_name).contains(channel.strip().lower()))
    if min_duration is not None:
        base = base.where(CatalogItem.duration_sec >= min_duration)
    if max_duration is not None:
        base = base.where(CatalogItem.duration_sec <= max_duration)
    if keyword and keyword.strip():
        base = base.where(func.lower(CatalogItem.title).contains(keyword.strip().lower()))

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = base.order_by(*_order_clause(sort)).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(stmt)).scalars().all())

    # Batch-fetch promoted videos to derive effective status (one extra query).
    video_ids = [i.promoted_video_id for i in items if i.promoted_video_id]
    vmap: dict[str, Video] = {}
    if video_ids:
        rows = (await db.execute(select(Video).where(Video.id.in_(video_ids)))).scalars().all()
        vmap = {v.id: v for v in rows}

    out = [_to_response(i, vmap.get(i.promoted_video_id) if i.promoted_video_id else None).model_dump() for i in items]
    return paginated(out, page=page, page_size=page_size, total=total)


async def get_item(db: AsyncSession, item_id: str) -> CatalogItem:
    item = await db.get(CatalogItem, item_id)
    if item is None:
        raise ValueError("Catalog item not found")
    return item


async def get_item_response(db: AsyncSession, item_id: str) -> CatalogItemResponse:
    item = await get_item(db, item_id)
    video = await db.get(Video, item.promoted_video_id) if item.promoted_video_id else None
    return _to_response(item, video)


async def summary(db: AsyncSession) -> dict:
    total = (await db.execute(select(func.count(CatalogItem.id)))).scalar_one()
    status_rows = (await db.execute(select(CatalogItem.status, func.count()).group_by(CatalogItem.status))).all()
    source_rows = (await db.execute(select(CatalogItem.source, func.count()).group_by(CatalogItem.source))).all()
    return {
        "total": total,
        "by_status": {s: c for s, c in status_rows},
        "by_source": {s: c for s, c in source_rows},
    }


# ---------------------------------------------------------------------------
# Curation actions
# ---------------------------------------------------------------------------


async def promote_item(
    db: AsyncSession,
    item_id: str,
    auto_publish: bool = True,
) -> CatalogItemResponse:
    """Promote a candidate into the official-video pipeline (process one).

    Reuses ``video_seed_service.seed_video`` (dedup-safe): creates/returns an
    official ``Video`` and dispatches ``process_video`` (extract -> transcribe ->
    translate -> annotate -> yt-dlp download + transcode -> ready; auto-publish
    when requested). The catalog row records the link + promoted_at; the promoted
    video's live status is reflected via ``effective_status`` on reads.
    """
    item = await get_item(db, item_id)
    if item.status == CatalogStatus.published.value:
        raise ValueError("Catalog item is already published")

    from app.services.video_seed_service import seed_video

    video_resp = await seed_video(db, item.source_url, auto_publish=auto_publish)

    now = datetime.now(UTC)
    item.promoted_video_id = video_resp.id
    item.promoted_at = now
    if video_resp.is_published:
        item.status = CatalogStatus.published.value
        item.published_at = now
    else:
        item.status = CatalogStatus.processing.value
    await commit_refresh(db, item)

    video = await db.get(Video, video_resp.id)
    return _to_response(item, video)


async def mark_item(
    db: AsyncSession,
    item_id: str,
    status: str,
    admin_notes: str | None = None,
) -> CatalogItemResponse:
    """Set a curation state (new/queued/skipped) without triggering processing."""
    item = await get_item(db, item_id)
    if status in ("new", "queued") and item.status in (
        CatalogStatus.processing.value,
        CatalogStatus.published.value,
    ):
        raise ValueError(f"Cannot reset a {item.status} item to '{status}'")
    item.status = status
    if admin_notes is not None:
        item.admin_notes = admin_notes
    await commit_refresh(db, item)
    return _to_response(item)
