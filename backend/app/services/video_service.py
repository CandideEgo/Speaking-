"""Business logic for video operations.

Route handlers in api/v1/videos.py delegate to these functions
so HTTP concerns (parsing, status codes) stay separate from
domain logic (queries, state transitions, side effects).
"""

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import check_video_access, is_video_owner
from app.core.database import commit_refresh
from app.models.learning import LearningRecord
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus
from app.schemas.community import UserProfileBrief
from app.schemas.pagination import PaginatedResponse, paginated
from app.schemas.pagination import has_more as _has_more
from app.schemas.video import (
    RecomputeWordLevelsRequest,
    SubtitleBatchUpdate,
    SubtitleResponse,
    SubtitleUpdate,
    VideoAdminResponse,
    VideoAdminUpdate,
    VideoDetailResponse,
    VideoResponse,
    VideoStatusResponse,
    WordLevelsUpdate,
)


def _detect_platform(source_url: str) -> VideoSource:
    """Determine video source from source URL.

    HTTP/HTTPS URLs are treated as imported (YouTube, etc.).
    Local file paths are treated as local.
    """
    if source_url.startswith(("http://", "https://")):
        return VideoSource.imported
    return VideoSource.local


async def submit_video(
    db: AsyncSession,
    source_url: str,
    current_user: User,
) -> VideoResponse:
    """Submit a new video URL for processing.

    If a ready video already exists for this URL, creates a new user
    reference instead of re-processing.
    """
    platform = _detect_platform(source_url)

    # Check if this URL was already processed
    result = await db.execute(
        select(Video).where(
            Video.source_url == source_url,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Create a new reference for this user
        user_video = Video(
            user_id=current_user.id,
            title=existing.title,
            source_url=source_url,
            video_source=existing.video_source,
            thumbnail_url=existing.thumbnail_url,
            duration=existing.duration,
            difficulty_level=existing.difficulty_level,
            video_url_480p=existing.video_url_480p,
            video_url_720p=existing.video_url_720p,
            video_url_1080p=existing.video_url_1080p,
            processing_mode=existing.processing_mode,
            status=existing.status,
        )
        db.add(user_video)
        await commit_refresh(db, user_video)
        return VideoResponse.model_validate(user_video)

    # New video -- queue for processing
    video = Video(
        user_id=current_user.id,
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.processing,
    )
    db.add(video)
    await commit_refresh(db, video)

    # Dispatch to Celery — all platforms use full processing (download + transcode)
    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


async def seed_video(
    db: AsyncSession,
    source_url: str,
    auto_publish: bool = False,
) -> VideoResponse:
    """Seed an official video for the public homepage. Admin only.

    If an official video for this URL is already ready (or has subtitles), it
    is returned as-is instead of re-running the whole pipeline — prevents
    duplicate rows when an admin re-clicks the seed button.
    """
    # Dedup: an official, already-processed video for this URL wins.
    existing_result = await db.execute(
        select(Video).where(
            Video.source_url == source_url,
            Video.is_official == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        return VideoResponse.model_validate(existing)

    platform = _detect_platform(source_url)

    video = Video(
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.processing,
        is_official=True,
        # Seeded as a draft: stays off the homepage until published. The
        # one-click flow sets auto_publish=True so finalize_video publishes it
        # automatically once ready; the manual flow leaves it False for review.
        is_published=False,
        auto_publish=auto_publish,
    )
    db.add(video)
    await commit_refresh(db, video)

    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


async def seed_user_video(
    db: AsyncSession,
    source_url: str,
    current_user: User,
    *,
    auto_publish: bool = False,
) -> VideoResponse:
    """Seed a video from a URL on behalf of a regular (non-admin) user.

    Similar to seed_video but creates a UGC video (is_official=False)
    owned by the submitting user, starting in draft review status.
    When ``auto_publish=True`` (the one-click flow), the video is
    auto-published once the pipeline completes, but still needs admin
    review before appearing in the community feed.
    """
    platform = _detect_platform(source_url)

    video = Video(
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.processing,
        user_id=current_user.id,
        is_official=False,
        is_published=False,
        review_status=VideoReviewStatus.draft.value,
        auto_publish=auto_publish,
    )
    db.add(video)
    await commit_refresh(db, video)

    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


async def list_public_videos(db: AsyncSession, page: int = 1, page_size: int = 20) -> dict:
    """List official public videos for the homepage. Paginated."""
    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    offset = (page - 1) * page_size

    base = select(Video).where(
        Video.is_official == True,
        Video.is_published == True,
        Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    result = await db.execute(base.order_by(Video.created_at.desc()).offset(offset).limit(page_size + 1))
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = [VideoResponse.model_validate(v) for v in rows[:page_size]]
    return paginated(items, page=page, page_size=page_size, has_more=has_more, total=total)


async def list_user_videos(db: AsyncSession, user_id: str, page: int = 1, page_size: int = 20) -> dict:
    """List videos belonging to a specific user. Paginated."""
    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    offset = (page - 1) * page_size

    base = select(Video).where(Video.user_id == user_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    result = await db.execute(base.order_by(Video.created_at.desc()).offset(offset).limit(page_size + 1))
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = [VideoResponse.model_validate(v) for v in rows[:page_size]]
    return paginated(items, page=page, page_size=page_size, has_more=has_more, total=total)


async def list_published_ugc_videos(db: AsyncSession, page: int = 1, page_size: int = 20) -> dict:
    """List published user-uploaded videos for the community feed.

    Per the UGC design, approved UGC surfaces only in the community feed (the
    homepage/browse feed stays official-curated). Returns ``{items, has_more}``.
    Each item includes a ``user`` brief (id, name, avatar_url) for attribution.
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    offset = (page - 1) * page_size

    base = (
        select(Video)
        .where(
            Video.is_official == False,
            Video.review_status == VideoReviewStatus.published.value,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
        .options(selectinload(Video.user))
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    result = await db.execute(base.order_by(Video.created_at.desc()).offset(offset).limit(page_size + 1))
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = []
    for v in rows[:page_size]:
        item = VideoResponse.model_validate(v).model_dump()
        item["user"] = UserProfileBrief.from_model(v.user) if v.user else None
        items.append(item)
    return {"items": items, "has_more": has_more, "total": total}


# ---------------------------------------------------------------------------
# UGC review lifecycle
# ---------------------------------------------------------------------------

_SNAPSHOT_VERSION = 1


def _subtitles_from_snapshot(snapshot: dict | None) -> list[SubtitleResponse]:
    """Build SubtitleResponse list from a frozen published_snapshot."""
    if not snapshot:
        return []
    raw = snapshot.get("subtitles") or []
    out: list[SubtitleResponse] = []
    for s in raw:
        out.append(
            SubtitleResponse(
                id=s.get("id", ""),
                start_time=s.get("start_time", 0.0),
                end_time=s.get("end_time", 0.0),
                text_en=s.get("text_en", ""),
                text_zh=s.get("text_zh"),
                sentence_index=s.get("sentence_index", 0),
                grammar_note=s.get("grammar_note"),
                speaker=s.get("speaker"),
                word_levels=s.get("word_levels"),
            )
        )
    return out


async def _build_snapshot(db: AsyncSession, video: Video) -> dict:
    """Freeze the current live subtitles + practice sets into a snapshot dict.

    The snapshot is what the public keeps watching while the owner edits a
    pending/rejected draft. Practice questions are stored per exam level so the
    practice GET can serve the approved version during re-review.
    """
    result = await db.execute(select(Video).options(selectinload(Video.subtitles)).where(Video.id == video.id))
    loaded = result.scalar_one_or_none()
    subs = loaded.subtitles if loaded else []

    # Freeze every cached practice set, keyed by exam level.
    from app.models.practice import VideoPracticeQuestion

    pq_result = await db.execute(select(VideoPracticeQuestion).where(VideoPracticeQuestion.video_id == video.id))
    practice_by_level: dict[str, list] = {}
    for pq in pq_result.scalars().all():
        practice_by_level[pq.exam_level] = pq.questions or []

    return {
        "version": _SNAPSHOT_VERSION,
        "subtitles": [
            {
                "id": s.id,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "text_en": s.text_en,
                "text_zh": s.text_zh,
                "sentence_index": s.sentence_index,
                "grammar_note": s.grammar_note,
                "speaker": s.speaker,
                "word_levels": s.word_levels,
            }
            for s in (subs or [])
        ],
        "practice": practice_by_level,
    }


async def begin_edit(db: AsyncSession, video: Video) -> Video:
    """Owner starts editing a published video: freeze the approved version to
    ``published_snapshot`` and flip to ``pending_review`` so the public keeps
    watching the snapshot while the owner edits the live draft."""
    if video.review_status != VideoReviewStatus.published.value:
        raise ValueError("只有已发布的视频才能开始编辑")
    video.published_snapshot = await _build_snapshot(db, video)
    video.review_status = VideoReviewStatus.pending_review.value
    video.submitted_at = None
    await commit_refresh(db, video)
    await _invalidate_video_detail_cache(video.id)
    return video


async def submit_for_review(db: AsyncSession, video: Video) -> Video:
    """Owner submits a draft/rejected video for admin review."""
    if video.review_status not in (VideoReviewStatus.draft.value, VideoReviewStatus.rejected.value):
        raise ValueError("当前状态无法提交审核")
    if video.status != VideoStatus.ready:
        raise ValueError("视频仍在处理中，暂无法提交审核")
    # Must have at least one subtitle line to review.
    from app.models.subtitle import Subtitle

    has_subs = (
        await db.execute(
            select(func.count()).select_from(select(Subtitle).where(Subtitle.video_id == video.id).subquery())
        )
    ).scalar_one()
    if not has_subs:
        raise ValueError("尚无字幕，无法提交审核")

    video.review_status = VideoReviewStatus.pending_review.value
    video.submitted_at = datetime.now(UTC)
    video.rejection_reason = None
    await commit_refresh(db, video)
    await _invalidate_video_detail_cache(video.id)
    return video


async def withdraw_submission(db: AsyncSession, video: Video) -> Video:
    """Owner withdraws a pending review back to draft."""
    if video.review_status != VideoReviewStatus.pending_review.value:
        raise ValueError("仅待审核状态可撤回")
    video.review_status = VideoReviewStatus.draft.value
    video.submitted_at = None
    await commit_refresh(db, video)
    await _invalidate_video_detail_cache(video.id)
    return video


async def approve_review(db: AsyncSession, video: Video, admin: User) -> Video:
    """Admin approves a pending review: freeze live subtitles as the new public
    version and mark published. (Both is_published and review_status are kept in
    sync so existing listing filters keep working.)"""
    if video.review_status != VideoReviewStatus.pending_review.value:
        raise ValueError("仅待审核状态可批准")
    video.published_snapshot = await _build_snapshot(db, video)
    video.review_status = VideoReviewStatus.published.value
    video.is_published = True
    video.reviewed_by = admin.id
    video.reviewed_at = datetime.now(UTC)
    video.rejection_reason = None
    await commit_refresh(db, video)
    await _invalidate_video_detail_cache(video.id)
    return video


async def reject_review(db: AsyncSession, video: Video, admin: User, reason: str) -> Video:
    """Admin rejects a pending review. The published_snapshot is preserved so
    the public keeps watching the last approved version (if any); the owner can
    edit the live draft and resubmit."""
    if video.review_status != VideoReviewStatus.pending_review.value:
        raise ValueError("仅待审核状态可驳回")
    video.review_status = VideoReviewStatus.rejected.value
    video.reviewed_by = admin.id
    video.reviewed_at = datetime.now(UTC)
    video.rejection_reason = reason
    await commit_refresh(db, video)
    await _invalidate_video_detail_cache(video.id)
    return video


async def get_video_detail(
    db: AsyncSession,
    video_id: str,
    current_user: User | None,
) -> VideoDetailResponse:
    """Get video detail with subtitles. Creates a LearningRecord on first view."""

    # Check cache for official videos (user-owned videos are never cached)
    from app.core.cache import cache_get, cache_set

    cache_key = f"video:detail:{video_id}"
    if current_user is None or current_user.plan == "free":
        # Only cache for anonymous/free users on official videos
        cached = await cache_get(cache_key)
        if cached:
            return VideoDetailResponse.model_validate_json(cached)

    result = await db.execute(select(Video).options(selectinload(Video.subtitles)).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        return None

    # Access control: official videos are public; user-owned require auth
    if not check_video_access(video, current_user):
        return None

    # Create LearningRecord on first view for authenticated users (after access check)
    if current_user:
        lr_result = await db.execute(
            select(LearningRecord)
            .where(
                LearningRecord.user_id == current_user.id,
                LearningRecord.video_id == video_id,
            )
            .with_for_update()
        )
        if not lr_result.scalar_one_or_none():
            db.add(LearningRecord(user_id=current_user.id, video_id=video_id))
            try:
                await db.commit()
            except Exception as exc:
                await db.rollback()
                if "uq_learning_record_user_video" not in str(exc):
                    raise

    # Decide which subtitles the viewer sees. The owner always sees their live
    # (draft) subtitles. A non-owner viewing a UGC video under re-review
    # (pending/rejected) sees the frozen approved snapshot instead of the live
    # draft the owner is editing.
    use_snapshot = (
        not is_video_owner(video, current_user)
        and not video.is_official
        and video.review_status in (VideoReviewStatus.pending_review.value, VideoReviewStatus.rejected.value)
        and video.published_snapshot is not None
    )

    if use_snapshot:
        subtitle_responses = _subtitles_from_snapshot(video.published_snapshot)
    else:
        subtitle_responses = [
            SubtitleResponse(
                id=s.id,
                start_time=s.start_time,
                end_time=s.end_time,
                text_en=s.text_en,
                text_zh=s.text_zh,
                sentence_index=s.sentence_index,
                grammar_note=s.grammar_note,
                speaker=s.speaker,
                word_levels=s.word_levels,
            )
            for s in (video.subtitles or [])
        ]

    detail = VideoDetailResponse(
        id=video.id,
        title=video.title,
        source_url=video.source_url,
        video_source=video.video_source.value,
        thumbnail_url=video.thumbnail_url,
        duration=video.duration,
        difficulty_level=video.difficulty_level,
        status=video.status.value,
        topic_tags=video.topic_tags,
        is_official=video.is_official,
        is_published=video.is_published,
        review_status=video.review_status,
        # Only the owner sees the rejection reason; a public/snapshot viewer
        # never learns why an unpublished draft was rejected.
        # Cached responses (anonymous/free) must never include it.
        rejection_reason=video.rejection_reason if is_video_owner(video, current_user) else None,
        video_url_480p=video.video_url_480p,
        video_url_720p=video.video_url_720p,
        video_url_1080p=video.video_url_1080p,
        like_count=video.like_count,
        favorite_count=video.favorite_count,
        processing_mode=video.processing_mode,
        created_at=video.created_at.isoformat(),
        subtitles=subtitle_responses,
    )

    # Cache official video details for 5 minutes.
    # Only cache if rejection_reason is None (non-owner view) to prevent
    # leaking owner-only data to anonymous/free users via the shared cache.
    if video.is_official and detail.rejection_reason is None:
        await cache_set(cache_key, detail.model_dump_json(), ttl=300)

    return detail


async def get_video_status(
    db: AsyncSession,
    video_id: str,
    current_user: User | None,
) -> VideoStatusResponse | None:
    """Get processing status for a video. Returns None if not found / no access."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        return None
    if not check_video_access(video, current_user):
        return None
    return VideoStatusResponse(
        status=video.status.value,
        video_url_720p=video.video_url_720p,
        processing_step=video.processing_step,
        processing_progress=video.processing_progress,
    )


# ---------------------------------------------------------------------------
# Admin video content management
# ---------------------------------------------------------------------------


async def list_all_videos(
    db: AsyncSession,
    *,
    status: str | None = None,
    is_official: bool | None = None,
    is_featured: bool | None = None,
    review_status: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedResponse[VideoAdminResponse]:
    """List every video (admin view) with filters.

    Unlike the public list, this returns videos in any status (including
    ``processing``/``error``). Keyword search uses ILIKE on title/topic_tags so
    it works on SQLite (tests) and Postgres alike — we deliberately avoid the
    Postgres-only ``search_vector`` column here. ``review_status`` filters the
    UGC review queue (e.g. ``pending_review``).
    """
    stmt = select(Video)
    if status:
        try:
            status_enum = VideoStatus(status)
        except ValueError:
            status_enum = None
        if status_enum is not None:
            stmt = stmt.where(Video.status == status_enum)
    if is_official is not None:
        stmt = stmt.where(Video.is_official == is_official)
    if is_featured is not None:
        stmt = stmt.where(Video.is_featured == is_featured)
    if review_status:
        stmt = stmt.where(Video.review_status == review_status)
    if keyword and keyword.strip():
        escaped_kw = keyword.strip().replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped_kw}%"
        stmt = stmt.where(or_(Video.title.ilike(pattern, escape="\\"), Video.topic_tags.ilike(pattern, escape="\\")))

    # total count for has_more
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(Video.created_at.desc()).limit(page_size + 1).offset((page - 1) * page_size)
    rows = (await db.execute(stmt)).scalars().all()

    has_more = total > page * page_size
    items = [VideoAdminResponse.model_validate(v) for v in rows[:page_size]]
    return PaginatedResponse(items=items, page=page, page_size=page_size, has_more=has_more)


async def _get_video_or_404(db: AsyncSession, video_id: str) -> Video:
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if video is None:
        raise ValueError("Video not found")
    return video


async def update_video(
    db: AsyncSession,
    video_id: str,
    payload: VideoAdminUpdate,
) -> VideoAdminResponse:
    """Apply a partial admin update to a video (None fields are skipped)."""
    video = await _get_video_or_404(db, video_id)

    # Publish guard: only ready videos may be published. Raising ValueError lets
    # the route handler map this to a 400 (mirrors localize's error mapping).
    if payload.is_published is True and video.status != VideoStatus.ready:
        raise ValueError("只能发布 status=ready 的视频")

    publish_changed = payload.is_published is not None and payload.is_published != video.is_published

    for field in (
        "title",
        "difficulty_level",
        "topic_tags",
        "is_official",
        "is_featured",
        "is_published",
        "show_on_homepage",
        "admin_notes",
    ):
        value = getattr(payload, field)
        if value is not None:
            setattr(video, field, value)

    # Keep review_status in sync with the admin publish toggle so the two
    # visibility gates never diverge (official videos are managed here; UGC
    # videos are managed via the dedicated approve/reject endpoints).
    if publish_changed:
        if video.is_published:
            video.review_status = VideoReviewStatus.published.value
        else:
            video.review_status = VideoReviewStatus.draft.value

    await commit_refresh(db, video)

    # Best-effort cache invalidation so the next read reflects new metadata.
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(f"video:detail:{video_id}")
    except Exception:
        pass

    # Publish/unpublish changes which videos surface on the homepage/browse feed
    # — invalidate those caches too. (Subtitle edits don't need this; browse only
    # caches video metadata.)
    if publish_changed:
        from app.api.v1.browse import invalidate_browse_cache

        await invalidate_browse_cache()

    return VideoAdminResponse.model_validate(video)


async def _invalidate_video_detail_cache(video_id: str) -> None:
    """Best-effort drop of the cached video detail (subtitles included).

    Reused by subtitle/word_levels edits so the next read reflects the change.
    Fail-open: a Redis outage just means a stale read for up to the TTL.
    """
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(f"video:detail:{video_id}")
    except Exception:
        pass


async def update_subtitle(
    db: AsyncSession,
    video_id: str,
    subtitle_id: str,
    payload: SubtitleUpdate,
) -> SubtitleResponse:
    """Apply a partial admin edit to one subtitle.

    Editing ``text_en`` resets ``word_levels`` to the ECDICT baseline (the
    inflection index is derived from the English text), mirroring the ingest
    pipeline's annotating step. Raises ValueError for not-found or
    cross-video edits (route maps these to 404 / 400).
    """
    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text

    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if subtitle is None:
        raise ValueError("Subtitle not found")
    if subtitle.video_id != video_id:
        raise ValueError("Subtitle does not belong to this video")

    text_en_changed = payload.text_en is not None and payload.text_en != subtitle.text_en

    for field in ("text_en", "text_zh", "start_time", "end_time", "grammar_note", "speaker"):
        value = getattr(payload, field)
        if value is not None:
            setattr(subtitle, field, value)

    if text_en_changed and not payload.preserve_word_levels:
        # Re-derive word_levels from the new English text — same primitive the
        # finalize pipeline and backfill script use. This overwrites any manual
        # overrides on this line; UI should warn before editing text_en. Pass
        # ``preserve_word_levels=True`` to keep existing overrides.
        levels = annotate_text(subtitle.text_en)
        subtitle.word_levels = levels or None

    await commit_refresh(db, subtitle)
    await _invalidate_video_detail_cache(video_id)
    return SubtitleResponse.model_validate(subtitle)


async def update_subtitles_batch(
    db: AsyncSession,
    video_id: str,
    payload: SubtitleBatchUpdate,
) -> list[SubtitleResponse]:
    """Apply many subtitle edits in one transaction. All ids must belong to video_id."""
    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text

    if not payload.updates:
        return []

    ids = [item.id for item in payload.updates]
    result = await db.execute(select(Subtitle).where(Subtitle.id.in_(ids)))
    subtitles_by_id = {s.id: s for s in result.scalars().all()}

    # Validate every target up front so we don't partially apply.
    for item in payload.updates:
        sub = subtitles_by_id.get(item.id)
        if sub is None:
            raise ValueError(f"Subtitle {item.id} not found")
        if sub.video_id != video_id:
            raise ValueError(f"Subtitle {item.id} does not belong to this video")

    updated: list[SubtitleResponse] = []
    for item in payload.updates:
        sub = subtitles_by_id[item.id]
        text_en_changed = item.text_en is not None and item.text_en != sub.text_en
        for field in ("text_en", "text_zh", "start_time", "end_time", "grammar_note", "speaker"):
            value = getattr(item, field)
            if value is not None:
                setattr(sub, field, value)
        if text_en_changed and not item.preserve_word_levels:
            levels = annotate_text(sub.text_en)
            sub.word_levels = levels or None
        updated.append(SubtitleResponse.model_validate(sub))

    await db.commit()
    for sub in subtitles_by_id.values():
        if sub.id in ids:
            await db.refresh(sub)
    await _invalidate_video_detail_cache(video_id)

    # Return in the order requested, refreshed.
    refreshed = {s.id: s for s in subtitles_by_id.values()}
    return [SubtitleResponse.model_validate(refreshed[item.id]) for item in payload.updates]


async def update_word_levels(
    db: AsyncSession,
    video_id: str,
    subtitle_id: str,
    payload: WordLevelsUpdate,
) -> SubtitleResponse:
    """Manually override one subtitle's word_levels (admin review)."""
    from app.models.subtitle import Subtitle

    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if subtitle is None:
        raise ValueError("Subtitle not found")
    if subtitle.video_id != video_id:
        raise ValueError("Subtitle does not belong to this video")

    subtitle.word_levels = payload.word_levels  # None clears all annotations
    await commit_refresh(db, subtitle)
    await _invalidate_video_detail_cache(video_id)
    return SubtitleResponse.model_validate(subtitle)


async def recompute_word_levels(
    db: AsyncSession,
    video_id: str,
    subtitle_ids: list[str] | None = None,
) -> dict:
    """Recompute word_levels from ECDICT for selected subtitles (or the whole video).

    Mirrors the finalize pipeline's annotating step and the backfill script.
    Gracefully degrades when ECDICT is unavailable (returns zero counts, no 500).
    """
    from app.models.subtitle import Subtitle
    from app.services.ecdict import annotate_text, is_available

    if not is_available():
        return {"subtitles_updated": 0, "exam_words_found": 0}

    stmt = select(Subtitle).where(Subtitle.video_id == video_id)
    if subtitle_ids is not None:
        if not subtitle_ids:
            return {"subtitles_updated": 0, "exam_words_found": 0}
        stmt = stmt.where(Subtitle.id.in_(subtitle_ids))

    result = await db.execute(stmt)
    subtitles = result.scalars().all()

    updated = 0
    exam_words_found = 0
    for sub in subtitles:
        levels = annotate_text(sub.text_en)
        sub.word_levels = levels or None
        updated += 1
        if levels:
            exam_words_found += len(levels)

    await db.commit()
    await _invalidate_video_detail_cache(video_id)
    return {"subtitles_updated": updated, "exam_words_found": exam_words_found}


async def delete_video(db: AsyncSession, video_id: str) -> bool:
    """Delete a video and all of its dependents + on-disk media files.

    Most FKs to ``videos.id`` have no DB-level ``ondelete`` clause, so we
    delete the child rows explicitly. Comments/comment_stats rely on their
    existing ``cascade="all, delete-orphan"`` / ``ondelete=CASCADE`` and are
    cleaned up via the ORM relationship cascade when the video row goes.
    """
    video = await _get_video_or_404(db, video_id)

    # Explicit child-row cleanup for tables lacking ondelete CASCADE.
    # SpeakingAttempt -> subtitle (no ondelete), must go before subtitles.
    from app.models.community import Post  # local import to avoid cycle risk
    from app.models.learning import SpeakingAttempt, Vocabulary
    from app.models.subtitle import Subtitle

    # SpeakingAttempts reference subtitles by FK without ondelete, so remove
    # them before we delete the subtitle rows they point at.
    sub_ids_stmt = select(Subtitle.id).where(Subtitle.video_id == video_id)
    await db.execute(delete(SpeakingAttempt).where(SpeakingAttempt.subtitle_id.in_(sub_ids_stmt)))
    await db.execute(delete(Subtitle).where(Subtitle.video_id == video_id))
    await db.execute(delete(LearningRecord).where(LearningRecord.video_id == video_id))
    await db.execute(delete(Vocabulary).where(Vocabulary.video_id == video_id))
    await db.execute(delete(Post).where(Post.video_id == video_id))

    # Remove the video row (comments/comment_stats cascade via ORM).
    await db.delete(video)
    await db.commit()

    # Best-effort deletion of on-disk media files.
    _delete_media_files(video_id)

    # Best-effort cache invalidation.
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(f"video:detail:{video_id}")
    except Exception:
        pass

    return True


def _delete_media_files(video_id: str) -> None:
    """Remove raw + transcoded media files for a video from local storage."""
    try:
        from app.core.config import get_settings

        media_dir = Path(get_settings().local_media_path).resolve()  # type: ignore[name-defined]
    except Exception:
        return
    if not media_dir.exists():
        return
    import glob

    for pattern in (f"{video_id}_raw.*", f"{video_id}_480p.mp4", f"{video_id}_720p.mp4", f"{video_id}_1080p.mp4"):
        for path in glob.glob(str(media_dir / pattern)):
            try:
                Path(path).unlink()
            except Exception:
                pass


# Mirrors STEP_PROGRESS["downloading"] from app.tasks.video_processing to avoid
# importing the task module at service load time.
STEP_PROGRESS_DOWNLOADING = 10


async def localize_video_admin(db: AsyncSession, video_id: str) -> VideoAdminResponse:
    """Kick off local download+transcode for an imported video (admin).

    Clears any existing local URLs and flips the video to ``processing`` so
    the admin panel can poll progress. Returns 409 (via ValueError) if the
    video is already being processed.
    """
    video = await _get_video_or_404(db, video_id)

    if video.status == VideoStatus.processing:
        raise ValueError("Video is already processing")

    video.video_url_480p = None
    video.video_url_720p = None
    video.video_url_1080p = None
    video.error_message = None
    video.processing_step = "downloading"
    video.processing_progress = STEP_PROGRESS_DOWNLOADING
    video.status = VideoStatus.processing
    await commit_refresh(db, video)

    from app.tasks.video_processing import localize_video

    localize_video.delay(video.id)
    return VideoAdminResponse.model_validate(video)
