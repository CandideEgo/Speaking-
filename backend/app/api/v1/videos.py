"""Video route handlers — thin HTTP layer only.

All business logic lives in app.services.video_service.
These handlers parse requests, call the service, and return responses.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user, get_current_user, get_optional_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.models.video import Video
from app.schemas.pagination import PaginatedResponse, PaginationParams, paginated
from app.schemas.video import (
    RecomputeWordLevelsRequest,
    ReviewRejectRequest,
    SubtitleBatchUpdate,
    SubtitleCreate,
    SubtitleReorder,
    SubtitleResponse,
    SubtitleSearchResult,
    SubtitleSplit,
    SubtitleUpdate,
    VideoAdminResponse,
    VideoAdminStatusResponse,
    VideoAdminUpdate,
    VideoCreate,
    VideoDetailResponse,
    VideoResponse,
    VideoStatusResponse,
    WordLevelsUpdate,
)
from app.services.search_service import (
    get_hot_searches as _get_hot_searches,
)
from app.services.search_service import (
    record_search_query as _record_search_query,
)
from app.services.search_service import (
    search_subtitles as _search_subtitles,
)
from app.services.search_service import (
    search_videos as _search_videos,
)
from app.services.search_service import (
    suggest_titles as _suggest_titles,
)
from app.services.subtitle_edit_service import (
    create_subtitle as _create_subtitle,
)
from app.services.subtitle_edit_service import (
    delete_subtitle as _delete_subtitle,
)
from app.services.subtitle_edit_service import (
    list_subtitle_revisions as _list_subtitle_revisions,
)
from app.services.subtitle_edit_service import (
    merge_subtitle as _merge_subtitle,
)
from app.services.subtitle_edit_service import (
    recompute_word_levels as _recompute_word_levels,
)
from app.services.subtitle_edit_service import (
    reorder_subtitles as _reorder_subtitles,
)
from app.services.subtitle_edit_service import (
    resegment_video as _resegment_video,
)
from app.services.subtitle_edit_service import (
    rollback_resegment as _rollback_resegment,
)
from app.services.subtitle_edit_service import (
    rollback_subtitle as _rollback_subtitle,
)
from app.services.subtitle_edit_service import (
    split_subtitle as _split_subtitle,
)
from app.services.subtitle_edit_service import (
    update_subtitle as _update_subtitle,
)
from app.services.subtitle_edit_service import (
    update_subtitles_batch as _update_subtitles_batch,
)
from app.services.subtitle_edit_service import (
    update_word_levels as _update_word_levels,
)
from app.services.video_like_service import (
    get_video_like_status as _get_video_like_status,
)
from app.services.video_like_service import (
    toggle_video_like as _toggle_video_like,
)
from app.services.video_review_service import (
    approve_review as _approve_review,
)
from app.services.video_review_service import (
    reject_review as _reject_review,
)
from app.services.video_seed_service import (
    seed_video as _seed_video,
)
from app.services.video_service import (
    delete_video as _delete_video,
)
from app.services.video_service import (
    get_ugc_pending_counts as _get_ugc_pending_counts,
)
from app.services.video_service import (
    get_video_detail as _get_video_detail,
)
from app.services.video_service import (
    get_video_status as _get_video_status,
)
from app.services.video_service import (
    list_all_videos as _list_all_videos,
)
from app.services.video_service import (
    list_public_videos as _list_public_videos,
)
from app.services.video_service import (
    localize_video_admin as _localize_video_admin,
)
from app.services.video_service import (
    update_video as _update_video,
)

router = APIRouter(prefix="/videos", tags=["videos"])


@router.get("/public", response_model=PaginatedResponse[VideoResponse])
@rate_limit("30/minute")
async def list_public_videos(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    return await _list_public_videos(db, page=page, page_size=page_size)


@router.get("/search", response_model=list[VideoResponse])
@rate_limit("30/minute")
async def search_videos(
    request: Request,
    q: str = "",
    limit: int = Query(20, ge=1, le=50),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Search videos by keyword across title and topic tags.

    Works for both authenticated and unauthenticated users.
    Authenticated users can also find their own non-official videos.

    Intentionally non-paginated (top-N by relevance); returns a bare list,
    not the PaginatedResponse envelope.
    """
    user_id = current_user.id if current_user else None
    results = await _search_videos(db, query=q, limit=limit, user_id=user_id)
    # D7: 搜索热度计数（best-effort，Redis 故障静默）
    await _record_search_query(q)
    return results


@router.get("/search/suggest")
@rate_limit("30/minute")
async def suggest_search(
    request: Request,
    q: str = "",
    limit: int = Query(8, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
):
    """D7 搜索建议：已发布视频标题，前缀匹配优先。公开（无需登录）。"""
    return {"suggestions": await _suggest_titles(db, q, limit)}


@router.get("/search/hot")
@rate_limit("30/minute")
async def hot_searches(request: Request):
    """D7 热门搜索：Redis ZSET Top 10（1h 缓存），故障时退回静态列表。"""
    return {"hot": await _get_hot_searches()}


@router.get("/search/subtitles", response_model=list[SubtitleSearchResult])
@rate_limit("20/minute")
async def search_subtitles(
    request: Request,
    q: str = "",
    limit: int = Query(10, ge=1, le=30),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Search subtitle text, return video + matching subtitle snippets.

    Intentionally non-paginated (top-N grouped by video); returns a bare
    list, not the PaginatedResponse envelope.
    """
    user_id = current_user.id if current_user else None
    return await _search_subtitles(db, query=q, limit=limit, user_id=user_id)


# ---------------------------------------------------------------------------
# Admin video content management
#
# NOTE: these static-path routes MUST be registered before the ``/{video_id}``
# catch-all below, otherwise ``GET /admin`` is shadowed by ``GET /{video_id}``.
# ---------------------------------------------------------------------------


@router.get("/admin", response_model=PaginatedResponse)
@rate_limit("30/minute")
async def list_admin_videos(
    request: Request,
    pagination: PaginationParams = Depends(),
    status: str | None = Query(None, description="Filter by processing status"),
    is_official: bool | None = Query(None, description="Filter official/user videos"),
    is_featured: bool | None = Query(None, description="Filter featured videos"),
    review_status: str | None = Query(
        None, description="Filter by UGC review status (draft/pending_review/published/rejected)"
    ),
    keyword: str | None = Query(None, description="Search title/topic_tags"),
    quality: str | None = Query(
        None, description="Filter by quality flag (quality_warning|quality_blocked|low_coverage)"
    ),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all videos (any status) with filters. Admin only."""
    return await _list_all_videos(
        db,
        status=status,
        is_official=is_official,
        is_featured=is_featured,
        review_status=review_status,
        keyword=keyword,
        quality=quality,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/admin/pending-count")
@rate_limit("30/minute")
async def get_admin_pending_count(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Count UGC videos awaiting admin action (badge for the admin top bar).

    Returns ``{pending_processing, pending_review, total}`` for non-official
    videos waiting to be processed or reviewed.
    """
    return await _get_ugc_pending_counts(db)


@router.patch("/admin/{video_id}", response_model=VideoAdminResponse)
@rate_limit("30/minute")
async def update_admin_video(
    request: Request,
    video_id: str,
    payload: VideoAdminUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update video metadata (title, difficulty, tags, official/featured, published, notes). Admin only."""
    try:
        return await _update_video(db, video_id, payload)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found") from None
        # Publish guard (and any other domain rule): 400 Bad Request.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from None


@router.delete("/admin/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
@rate_limit("30/minute")
async def delete_admin_video(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a video and all of its dependents + media files. Admin only."""
    try:
        await _delete_video(db, video_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found") from None
    return None


@router.post("/admin/{video_id}/start-processing", response_model=VideoAdminResponse)
@rate_limit("10/minute")
async def start_processing_video(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger GPU processing for a pending video. Admin only.

    The local GPU worker must be online (heartbeat present in Redis).
    Returns 503 if the worker is offline, 400 if the video is not in
    pending_processing status.
    """
    from app.services.video_seed_service import start_processing as _start_processing

    try:
        return await _start_processing(db, video_id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        if "offline" in msg.lower():
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/admin/{video_id}/recover", response_model=VideoAdminResponse)
@rate_limit("10/minute")
async def recover_video(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-dispatch finalize_video for a video stuck mid-pipeline. Admin only.

    Clears the stale ``video:processing:{id}`` Redis lock left behind when the
    cloud worker died during finalize, then re-dispatches ``finalize_video``
    (resume-safe — skips completed steps). Use this for videos stuck in
    ``processing`` / ``ready_subtitles``; use ``start-processing`` for a fresh
    ``pending_processing`` video.
    """
    from app.services.video_seed_service import recover_processing as _recover_processing

    try:
        return await _recover_processing(db, video_id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/admin/{video_id}/retry", response_model=VideoAdminResponse)
@rate_limit("10/minute")
async def retry_video(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume a failed (error) video from the last completed pipeline step. Admin only.

    Preserves completed steps so finalize_video skips already-finished work.
    If subtitles exist, jumps straight to the tail (translating -> ... -> ready);
    otherwise resets to pending_processing for a fresh full run.

    Use ``recover`` for videos stuck mid-pipeline (processing/ready_subtitles)
    without an error state.
    """
    from app.services.video_seed_service import retry_video as _retry_video

    try:
        return await _retry_video(db, video_id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/admin/{video_id}/localize", response_model=VideoAdminResponse)
@rate_limit("5/minute")
async def localize_admin_video(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Download + transcode an imported video's source to local storage. Admin only."""
    try:
        return await _localize_video_admin(db, video_id)
    except ValueError as e:
        msg = str(e)
        if "already processing" in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e


@router.post("/admin/{video_id}/retranslate", response_model=VideoAdminResponse)
@rate_limit("10/minute")
async def retranslate_video(
    request: Request,
    video_id: str,
    engine: str | None = Query(None, description="Override translation engine (glm|qwen|hy_mt2|agnes|custom)"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-run translation, optionally with a different engine. Admin only.

    Use after a translation quality block (coverage below the block threshold)
    to retry with a different engine - the same engine + same input would
    reproduce the low coverage. Clears existing text_zh + quality_flag and
    re-dispatches finalize_video.
    """
    from app.services.video_seed_service import retranslate_video as _retranslate

    try:
        return await _retranslate(db, video_id, engine=engine)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.get("/admin/{video_id}/quality-reports")
@rate_limit("30/minute")
async def get_video_quality_reports(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all quality reports for a video (transcription + translation history).

    Admin-only. Powers the video-detail quality panel: shows each stage's
    pass/fail, coverage, and per-check breakdown across re-runs.
    """
    from app.models.video_quality_report import VideoQualityReport

    rows = (
        (
            await db.execute(
                select(VideoQualityReport)
                .where(VideoQualityReport.video_id == video_id)
                .order_by(VideoQualityReport.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": r.id,
            "stage": r.stage,
            "passed": r.passed,
            "coverage_ratio": r.coverage_ratio,
            "metrics": r.metrics,
            "issues": r.issues,
            "segment_count": r.segment_count,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.patch("/admin/{video_id}/subtitles/{subtitle_id}", response_model=SubtitleResponse)
@rate_limit("60/minute")
async def update_admin_subtitle(
    request: Request,
    video_id: str,
    subtitle_id: str,
    payload: SubtitleUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit one subtitle's text/timing/grammar note. Editing text_en resets that
    line's word_levels to the ECDICT baseline. Admin only."""
    try:
        return await _update_subtitle(db, video_id, subtitle_id, payload, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        # Cross-video edit attempt.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.patch("/admin/{video_id}/subtitles", response_model=list[SubtitleResponse])
@rate_limit("60/minute")
async def update_admin_subtitles_batch(
    request: Request,
    video_id: str,
    payload: SubtitleBatchUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply many subtitle edits in one transaction. All ids must belong to video_id. Admin only."""
    try:
        return await _update_subtitles_batch(db, video_id, payload, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/admin/{video_id}/subtitles", response_model=SubtitleResponse)
@rate_limit("60/minute")
async def create_admin_subtitle(
    request: Request,
    video_id: str,
    payload: SubtitleCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Append a new subtitle row at the end of the video (canvas editor).
    The English text may be empty initially; timing must not overlap existing
    rows. Admin only."""
    try:
        return await _create_subtitle(db, video_id, payload, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post(
    "/admin/{video_id}/subtitles/reorder",
    response_model=list[SubtitleResponse],
)
@rate_limit("30/minute")
async def reorder_admin_subtitles(
    request: Request,
    video_id: str,
    payload: SubtitleReorder,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Reassign sentence_index for every subtitle in one transaction (canvas
    editor drag-to-reorder). The payload must cover all current subtitles with
    a contiguous 0..N-1 index sequence; timing is re-validated against the new
    neighbor order. Admin only."""
    try:
        return await _reorder_subtitles(db, video_id, payload, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.delete("/admin/{video_id}/subtitles/{subtitle_id}", response_model=dict)
@rate_limit("60/minute")
async def delete_admin_subtitle(
    request: Request,
    video_id: str,
    subtitle_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete one subtitle and close the gap in sentence_index (canvas editor).
    Admin only."""
    try:
        return await _delete_subtitle(db, video_id, subtitle_id, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post(
    "/admin/{video_id}/subtitles/{subtitle_id}/split",
    response_model=list[SubtitleResponse],
)
@rate_limit("60/minute")
async def split_admin_subtitle(
    request: Request,
    video_id: str,
    subtitle_id: str,
    payload: SubtitleSplit,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Split one subtitle into two at split_time. Admin only."""
    try:
        return await _split_subtitle(db, video_id, subtitle_id, payload, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post(
    "/admin/{video_id}/subtitles/{subtitle_id}/merge",
    response_model=SubtitleResponse,
)
@rate_limit("60/minute")
async def merge_admin_subtitle(
    request: Request,
    video_id: str,
    subtitle_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Merge a subtitle with the next one. Admin only."""
    try:
        return await _merge_subtitle(db, video_id, subtitle_id, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/admin/{video_id}/subtitles/resegment", response_model=dict)
@rate_limit("10/minute")
async def resegment_admin_subtitles(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-cut every subtitle into proper sentences (bulk). Snapshots first so
    the change is reversible via /resegment/rollback. Translations are cleared
    — segmentation changed, so the admin should re-trigger translation after.
    Admin only."""
    try:
        return await _resegment_video(db, video_id, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/admin/{video_id}/subtitles/resegment/rollback", response_model=dict)
@rate_limit("10/minute")
async def rollback_resegment_admin(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore subtitles from the latest re-segment snapshot. Admin only."""
    try:
        return await _rollback_resegment(db, video_id, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.patch("/admin/{video_id}/subtitles/{subtitle_id}/word-levels", response_model=SubtitleResponse)
@rate_limit("60/minute")
async def update_admin_word_levels(
    request: Request,
    video_id: str,
    subtitle_id: str,
    payload: WordLevelsUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually override one subtitle's word-level annotations. Pass null to clear. Admin only."""
    try:
        return await _update_word_levels(db, video_id, subtitle_id, payload)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/admin/{video_id}/subtitles/word-levels/recompute")
@rate_limit("10/minute")
async def recompute_admin_word_levels(
    request: Request,
    video_id: str,
    payload: RecomputeWordLevelsRequest | None = None,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Recompute word_levels from ECDICT for selected subtitles (or the whole video). Admin only."""
    subtitle_ids = payload.subtitle_ids if payload else None
    return await _recompute_word_levels(db, video_id, subtitle_ids)


@router.post("/admin/{video_id}/subtitles/{subtitle_id}/rollback/{revision_id}", response_model=SubtitleResponse)
@rate_limit("30/minute")
async def rollback_admin_subtitle(
    request: Request,
    video_id: str,
    subtitle_id: str,
    revision_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Roll back a subtitle to the before-state of a prior edit. Admin only."""
    try:
        return await _rollback_subtitle(db, video_id, subtitle_id, revision_id, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.get("/admin/{video_id}/subtitles/revisions")
@rate_limit("30/minute")
async def list_admin_subtitle_revisions(
    request: Request,
    video_id: str,
    page: int = 1,
    page_size: int = 50,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all subtitle edit revisions for a video (newest first). Admin only."""
    return await _list_subtitle_revisions(db, video_id, page=page, page_size=page_size)


@router.get("/admin/{video_id}/subtitles/{subtitle_id}/revisions")
@rate_limit("30/minute")
async def list_admin_subtitle_revisions_for_one(
    request: Request,
    video_id: str,
    subtitle_id: str,
    page: int = 1,
    page_size: int = 50,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List edit revisions for one subtitle. Admin only."""
    return await _list_subtitle_revisions(db, video_id, subtitle_id=subtitle_id, page=page, page_size=page_size)


@router.post("/admin/{video_id}/review/approve", response_model=VideoAdminResponse)
@rate_limit("30/minute")
async def approve_admin_review(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a UGC video pending review: freezes live subtitles as the public
    version and marks it published. Admin only."""
    video = await _get_admin_video_or_404(db, video_id)
    try:
        return VideoAdminResponse.model_validate(await _approve_review(db, video, current_user))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.post("/admin/{video_id}/review/reject", response_model=VideoAdminResponse)
@rate_limit("30/minute")
async def reject_admin_review(
    request: Request,
    video_id: str,
    payload: ReviewRejectRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a UGC video pending review with a reason. The public keeps the
    last approved snapshot (if any); the owner can edit & resubmit. Admin only."""
    video = await _get_admin_video_or_404(db, video_id)
    try:
        return VideoAdminResponse.model_validate(await _reject_review(db, video, current_user, payload.reason))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


async def _get_admin_video_or_404(db: AsyncSession, video_id: str):
    """Admin helper: fetch any video by id (no access gate — admin sees all)."""
    from app.services.video_service import _get_video_or_404

    try:
        return await _get_video_or_404(db, video_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found") from None


@router.get("/admin/{video_id}/detail", response_model=VideoDetailResponse)
@rate_limit("30/minute")
async def get_admin_video_detail(
    request: Request,
    video_id: str,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin video detail — bypasses check_video_access so admins can view UGC drafts."""
    result = await _get_video_detail(db, video_id, current_user=None, skip_access_check=True)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return result


@router.get("/admin/{video_id}/status", response_model=VideoAdminStatusResponse)
@rate_limit("30/minute")
async def get_admin_video_status(
    request: Request,
    video_id: str,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin processing status — bypasses check_video_access + includes error_message."""
    result = await _get_video_status(db, video_id, current_user=None, skip_access_check=True)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return result


@router.get("/admin/{video_id}/score", response_model=dict)
@rate_limit("30/minute")
async def get_admin_video_score(
    request: Request,
    video_id: str,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin/debug: latest learning_score breakdown for a video (P1).

    Returns the per-factor values so the score is explainable, not just the
    total. 404 if the video has never been scored.
    """
    from app.services.scoring_service import get_latest_score

    row = await get_latest_score(db, video_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No score computed yet")
    return {
        "video_id": video_id,
        "total_score": row.total_score,
        "factors": {
            "ctr": row.ctr,
            "retention": row.retention,
            "watch_time": row.watch_time,
            "topic_match": row.topic_match,
            "quality": row.quality,
            "viral": row.viral,
            "freshness": row.freshness,
            "bonus": row.bonus,
        },
        "computed_at": row.computed_at.isoformat() if row.computed_at else None,
    }


@router.get("/unlocked", response_model=PaginatedResponse[VideoResponse])
@rate_limit("30/minute")
async def list_unlocked_videos(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The current user's permanently unlocked videos (newest first).

    Powers the /history 「已解锁」 tab. Registered before ``/{video_id}``
    so the static path wins route matching.
    """
    from app.services.unlock_service import list_unlocked_videos as _list_unlocked_videos

    return await _list_unlocked_videos(db, current_user, page=page, page_size=page_size)


@router.get("/unlocked-ids")
@rate_limit("30/minute")
async def list_unlocked_video_ids(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All unlocked video ids for the current user (card badge lookups).

    Also reports the month's remaining quota for Free viewers so card grids
    can render the three badge states (✓ unlocked / lock / lock+exhausted)
    without one request per video. Pro/admin get ``remaining_this_month: null``.
    """
    from app.core.config import get_settings
    from app.services.unlock_service import is_active_pro, remaining_unlocks
    from app.services.unlock_service import list_unlocked_video_ids as _list_unlocked_video_ids

    quota = get_settings().free_monthly_unlock_quota
    remaining = None
    if not (current_user.role == "admin" or is_active_pro(current_user)):
        remaining = await remaining_unlocks(db, current_user)
    return {
        "video_ids": await _list_unlocked_video_ids(db, current_user),
        "remaining_this_month": remaining,
        "quota": quota,
    }


# Phase 1 B0 — list the current user's favorite videos. Declared before the
# /{video_id} dynamic route so the static "favorites" path wins the match
# (FastAPI's route ordering is registration order; the previous attempt got
# swallowed by the catch-all and returned 404).
@router.get("/favorites", response_model=PaginatedResponse[dict])
@rate_limit("30/minute")
async def list_user_favorites(
    request: Request,
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated list of the current user's favorited videos.

    Joins user_favorites → videos (LEFT user_notes for excerpt). The response
    shape is intentionally flat: each item carries the fields the favorites
    page needs (id, title, thumbnail, like/favorite counts, note excerpt)
    so the frontend can render VideoCard without a second round-trip.
    """
    from app.models.favorite import UserFavorite, UserNote
    from app.services.channel_service import channel_slugs_for

    total = (
        await db.execute(select(func.count(UserFavorite.id)).where(UserFavorite.user_id == current_user.id))
    ).scalar_one()

    rows = (
        await db.execute(
            select(Video, UserFavorite.created_at, UserNote.content)
            .join(UserFavorite, UserFavorite.video_id == Video.id)
            .outerjoin(
                UserNote,
                (UserNote.video_id == Video.id) & (UserNote.user_id == current_user.id),
            )
            .where(UserFavorite.user_id == current_user.id)
            .order_by(UserFavorite.created_at.desc())
            .offset(pagination.offset)
            .limit(pagination.page_size)
        )
    ).all()

    slug_map = await channel_slugs_for(db, [v for v, _, _ in rows])
    items = [
        {
            "id": v.id,
            "title": v.title,
            "thumbnail_url": v.thumbnail_url,
            "duration": v.duration,
            "difficulty_level": v.difficulty_level,
            "topic_tags": v.topic_tags,
            "channel_name": v.channel_name,
            "channel_slug": slug_map.get(v.channel_ref),
            "like_count": getattr(v, "like_count", 0) or 0,
            "favorite_count": getattr(v, "favorite_count", 0) or 0,
            "note_excerpt": (note.content[:60] + "…")
            if note and note.content and len(note.content) > 60
            else (note.content if note else None),
            "has_note": bool(note and note.content),
            "favorited_at": fav_at.isoformat() if fav_at else None,
        }
        for v, fav_at, note in rows
    ]
    return paginated(items, pagination, total=total)


# Phase 1 B0 — list the current user's vocabulary for a single video, used by
# the EndScreen "复习本视频生词" entry on the watch page.
@router.get("/{video_id}/vocabulary", response_model=PaginatedResponse[dict])
@rate_limit("30/minute")
async def list_video_vocabulary(
    request: Request,
    video_id: str,
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's vocabulary rows for this video, newest first."""
    from app.models.learning import Vocabulary

    video = await db.get(Video, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    total = (
        await db.execute(
            select(func.count(Vocabulary.id)).where(
                Vocabulary.user_id == current_user.id, Vocabulary.video_id == video_id
            )
        )
    ).scalar_one()

    rows = (
        (
            await db.execute(
                select(Vocabulary)
                .where(Vocabulary.user_id == current_user.id, Vocabulary.video_id == video_id)
                .order_by(Vocabulary.created_at.desc())
                .offset(pagination.offset)
                .limit(pagination.page_size)
            )
        )
        .scalars()
        .all()
    )

    items = [
        {
            "id": w.id,
            "word": w.word,
            "definition": w.definition,
            "translation": w.translation,
            "mastery_level": w.mastery_level,
            "context_sentence": w.context_sentence,
            "video_id": w.video_id,
            "subtitle_id": w.subtitle_id,
            "review_count": w.review_count,
            "next_review_at": w.next_review_at.isoformat() if w.next_review_at else None,
            "created_at": w.created_at.isoformat(),
        }
        for w in rows
    ]
    return paginated(items, pagination, total=total)


# Phase 1 B0 — return the top-N sentences with the highest exam-word density,
# used by the EndScreen "跟读重点句" entry. Falls back to the first N
# sentences when no exam words are tagged.
@router.get("/{video_id}/shadowing-sentences", response_model=list[dict])
@rate_limit("30/minute")
async def list_shadowing_sentences(
    request: Request,
    video_id: str,
    limit: int = Query(3, ge=1, le=10),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pick the top `limit` subtitles with the most exam-tagged words.

    The target exam comes from the user's preferences (target_exam); if not
    set, defaults to cet4. When the video has no exam-tagged subtitles at
    all, return the first `limit` sentences by sentence_index so the
    EndScreen still surfaces something useful.
    """
    from app.models.preferences import UserPreferences
    from app.models.subtitle import Subtitle

    video = await db.get(Video, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # D0 membership gate: subtitles are paid content — locked videos must not
    # leak them here (mirrors get_video_detail blanking subtitles when locked).
    from app.services.unlock_service import get_video_access_info

    access = await get_video_access_info(db, current_user, video)
    if not access["unlocked"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Video not unlocked")

    # Read the user's target exam (defaults to cet4).
    target_exam = (
        await db.execute(select(UserPreferences.target_exam).where(UserPreferences.user_id == current_user.id))
    ).scalar_one_or_none() or "cet4"

    subtitles = (
        (
            await db.execute(
                select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index.asc())
            )
        )
        .scalars()
        .all()
    )

    def _exam_count(sub: Subtitle) -> int:
        wl = sub.word_levels or {}
        if not isinstance(wl, dict):
            return 0
        n = 0
        for levels in wl.values():
            if isinstance(levels, list) and target_exam in levels:
                n += 1
            elif isinstance(levels, str) and levels == target_exam:
                n += 1
        return n

    scored = sorted(subtitles, key=_exam_count, reverse=True)
    if scored and _exam_count(scored[0]) > 0:
        picked = scored[:limit]
    else:
        picked = subtitles[:limit]  # fallback: first N

    return [
        {
            "subtitle_id": s.id,
            "sentence_index": s.sentence_index,
            "text_en": s.text_en,
            "text_zh": s.text_zh,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "exam_word_count": _exam_count(s),
        }
        for s in picked
    ]


@router.get("/{video_id}", response_model=VideoDetailResponse)
@rate_limit("30/minute")
async def get_video(
    request: Request,
    video_id: str,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await _get_video_detail(db, video_id, current_user)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return result


@router.post("/{video_id}/unlock")
@rate_limit("10/minute")
async def unlock_video(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Consume one monthly Free quota to permanently unlock this video.

    Idempotent (re-unlock consumes nothing). Pro/admin/demo requests succeed
    without writing an unlock row. 409 when the month's quota is exhausted.
    """
    from app.services.unlock_service import UnlockQuotaExhaustedError
    from app.services.unlock_service import unlock_video as _unlock_video
    from app.services.video_access import check_video_access

    video = await db.get(Video, video_id)
    if video is None or not check_video_access(video, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    try:
        access = await _unlock_video(db, current_user, video)
    except UnlockQuotaExhaustedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": str(exc), "remaining": exc.remaining, "quota": exc.quota},
        ) from exc

    # Best-effort: drop the viewer's cached (locked) detail so the next read
    # reflects the unlock immediately.
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(f"video:detail:{video_id}:u:{current_user.id}")
    except Exception:
        pass

    return {"access": access}


@router.get("/{video_id}/status", response_model=VideoStatusResponse)
@rate_limit("30/minute")
async def get_video_status(
    request: Request,
    video_id: str,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await _get_video_status(db, video_id, current_user)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return result


@router.post("/seed", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("5/minute")
async def seed_video(
    request: Request,
    data: VideoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Seed an official video for the public homepage. Admin only."""
    return await _seed_video(db, data.source_url)


async def _require_valid_cookies(source_url: str):
    """Ensure YouTube cookies are valid; raise HTTPException if not."""
    from app.services.youtube_cookies_service import ensure_cookies

    cookies_status = await ensure_cookies(source_url)
    if cookies_status == "need_manual_login":
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="YouTube cookies 需重新登录：请在服务器上运行 playwright-cli open "
            "https://www.youtube.com --persistent 并登录后重试",
        )
    if cookies_status == "error":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="cookies 探测/刷新失败，请检查网络或 yt-dlp 配置",
        )


@router.post("/seed-full", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("3/minute")
async def seed_video_full(
    request: Request,
    data: VideoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """One-click seed: ensure cookies, seed, run the full pipeline, auto-publish.

    Probes yt-dlp cookies against the URL; if invalid, refreshes from the
    persistent playwright-cli browser session; if the session is logged out,
    returns 423 so the admin knows to re-login on the server. On success the
    video is seeded with auto_publish=True so finalize_video publishes it once
    ready — the frontend just polls /status.
    """
    await _require_valid_cookies(data.source_url)
    return await _seed_video(db, data.source_url, auto_publish=True)


@router.post("/{video_id}/like")
@rate_limit("30/minute")
async def toggle_video_like(
    request: Request,
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle like on a video. Returns {"liked": bool}."""
    try:
        return await _toggle_video_like(db, current_user.id, video_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.get("/{video_id}/like-status")
@rate_limit("30/minute")
async def video_like_status(
    request: Request,
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if the current user has liked a video."""
    return await _get_video_like_status(db, current_user.id, video_id)
