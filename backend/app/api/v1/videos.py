"""Video route handlers — thin HTTP layer only.

All business logic lives in app.services.video_service.
These handlers parse requests, call the service, and return responses.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user, get_current_user, get_optional_user, require_video_owner
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.models.video import VideoReviewStatus
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.schemas.video import (
    ProposalCreate,
    ProposalReject,
    RecomputeWordLevelsRequest,
    ReviewRejectRequest,
    SubtitleBatchUpdate,
    SubtitleResponse,
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
from app.services.community_service import (
    get_video_like_status as _get_video_like_status,
)
from app.services.community_service import (
    toggle_video_like as _toggle_video_like,
)
from app.services.proposal_service import (
    apply_mergeable_update as _apply_mergeable_update,
)
from app.services.proposal_service import (
    list_mergeable_updates as _list_mergeable_updates,
)
from app.services.proposal_service import (
    list_proposals as _list_proposals,
)
from app.services.proposal_service import (
    merge_proposal as _merge_proposal,
)
from app.services.proposal_service import (
    propose_subtitle_changes as _propose_subtitle_changes,
)
from app.services.proposal_service import (
    reject_proposal as _reject_proposal,
)
from app.services.proposal_service import (
    withdraw_proposal as _withdraw_proposal,
)
from app.services.search_service import (
    search_subtitles as _search_subtitles,
)
from app.services.search_service import (
    search_videos as _search_videos,
)
from app.services.subtitle_edit_service import (
    list_subtitle_revisions as _list_subtitle_revisions,
)
from app.services.subtitle_edit_service import (
    recompute_word_levels as _recompute_word_levels,
)
from app.services.subtitle_edit_service import (
    rollback_subtitle as _rollback_subtitle,
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
from app.services.upload_service import handle_video_upload
from app.services.video_review_service import (
    approve_review as _approve_review,
)
from app.services.video_review_service import (
    begin_edit as _begin_edit,
)
from app.services.video_review_service import (
    reject_review as _reject_review,
)
from app.services.video_review_service import (
    submit_for_review as _submit_for_review,
)
from app.services.video_review_service import (
    withdraw_submission as _withdraw_submission,
)
from app.services.video_seed_service import (
    seed_user_video as _seed_user_video,
)
from app.services.video_seed_service import (
    seed_video as _seed_video,
)
from app.services.video_seed_service import (
    submit_video as _submit_video,
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
    list_user_videos as _list_user_videos,
)
from app.services.video_service import (
    localize_video_admin as _localize_video_admin,
)
from app.services.video_service import (
    update_video as _update_video,
)

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("5/minute")
async def submit_video(
    request: Request,
    data: VideoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _submit_video(db, data.source_url, current_user)


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
    limit: int = 20,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Search videos by keyword across title and topic tags.

    Works for both authenticated and unauthenticated users.
    Authenticated users can also find their own non-official videos.
    """
    user_id = current_user.id if current_user else None
    return await _search_videos(db, query=q, limit=limit, user_id=user_id)


@router.get("/search/subtitles")
@rate_limit("20/minute")
async def search_subtitles(
    request: Request,
    q: str = "",
    limit: int = Query(10, ge=1, le=30),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Search subtitle text, return video + matching subtitle snippets."""
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


@router.get("", response_model=PaginatedResponse[VideoResponse])
@rate_limit("30/minute")
async def list_videos(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _list_user_videos(db, current_user.id, page=page, page_size=page_size)


@router.post("/upload", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("5/minute")
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a local video file for processing."""
    return await handle_video_upload(file=file, title=title, current_user=current_user, db=db)


# ---------------------------------------------------------------------------
# UGC creator endpoints (owner-scoped)
#
# Owners can edit their own video's subtitles + manage the review lifecycle.
# Editing a published video is blocked until the owner calls begin-edit (which
# freezes the approved version and flips to pending_review so the public keeps
# watching the snapshot).
# ---------------------------------------------------------------------------


async def _require_editable_own_video(video_id: str, current_user: User, db: AsyncSession):
    """Fetch a video owned by the caller and ensure it is in an editable state.

    Returns the Video. Raises 404 if not owned, 409 if currently published
    (owner must begin-edit first to avoid clobbering the public version), 403
    if the video is a standard version body (决议 5 — standard edits go via PR).
    """
    video = await require_video_owner(video_id, current_user, db)
    if video.review_status == VideoReviewStatus.published.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="视频已发布，请先调用 begin-edit 触发重新审核后再编辑",
        )
    # Standard version body is admin-only (决议 5); owners must propose via PR.
    from sqlalchemy import select

    from app.models.video_standard import VideoStandard

    std = (
        await db.execute(select(VideoStandard).where(VideoStandard.canonical_video_id == video_id))
    ).scalar_one_or_none()
    if std is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该视频是标准版本体，请通过 PR 提议修改",
        )
    return video


@router.patch("/{video_id}/subtitles/{subtitle_id}", response_model=SubtitleResponse)
@rate_limit("60/minute")
async def update_own_subtitle(
    request: Request,
    video_id: str,
    subtitle_id: str,
    payload: SubtitleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit one subtitle on your own video. Owner only; blocked while published."""
    await _require_editable_own_video(video_id, current_user, db)
    try:
        return await _update_subtitle(db, video_id, subtitle_id, payload, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.patch("/{video_id}/subtitles", response_model=list[SubtitleResponse])
@rate_limit("60/minute")
async def update_own_subtitles_batch(
    request: Request,
    video_id: str,
    payload: SubtitleBatchUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply many subtitle edits in one transaction to your own video. Owner only."""
    await _require_editable_own_video(video_id, current_user, db)
    try:
        return await _update_subtitles_batch(db, video_id, payload, edited_by=current_user.id)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


# ---------------------------------------------------------------------------
# Phase 3e: PR propose-back + mergeable updates
# ---------------------------------------------------------------------------


@router.post("/{video_id}/propose", response_model=dict, status_code=status.HTTP_201_CREATED)
@rate_limit("10/minute")
async def propose_subtitle_changes(
    request: Request,
    video_id: str,
    payload: ProposalCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a PR proposing this fork's subtitle edits back to the standard body."""
    try:
        proposal = await _propose_subtitle_changes(
            db,
            video_id,
            title=payload.title,
            body=payload.body,
            subtitle_ids=payload.subtitle_ids,
            submitted_by=current_user.id,
        )
        return {"id": proposal.id, "status": proposal.status}
    except ValueError as e:
        msg = str(e)
        if "owner" in msg.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg) from e
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.get("/proposals/mine")
@rate_limit("30/minute")
async def list_my_proposals(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's submitted PRs."""
    return await _list_proposals(db, submitted_by=current_user.id, page=page, page_size=page_size)


@router.post("/proposals/{proposal_id}/withdraw", response_model=dict)
@rate_limit("10/minute")
async def withdraw_my_proposal(
    request: Request,
    proposal_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Withdraw one of your own pending PRs."""
    try:
        proposal = await _withdraw_proposal(db, proposal_id, submitted_by=current_user.id)
        return {"id": proposal.id, "status": proposal.status}
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        if "submitter" in msg.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.get("/{video_id}/mergeable-updates")
@rate_limit("30/minute")
async def list_my_mergeable_updates(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List pending mergeable-update markers on one of the caller's forks."""
    video = await require_video_owner(video_id, current_user, db)
    return await _list_mergeable_updates(db, video.id)


@router.post("/{video_id}/mergeable-updates/{update_id}/apply", response_model=SubtitleResponse)
@rate_limit("10/minute")
async def apply_mergeable_update(
    request: Request,
    video_id: str,
    update_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply one mergeable update: pull the standard's value onto this fork line."""
    try:
        sub = await _apply_mergeable_update(db, video_id, update_id, user_id=current_user.id)
        return SubtitleResponse.model_validate(sub)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        if "owner" in msg.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.get("/admin/proposals")
@rate_limit("30/minute")
async def list_admin_proposals(
    request: Request,
    status_filter: str | None = Query(None, alias="status"),
    page: int = 1,
    page_size: int = 50,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List PRs for admin review (optionally filtered by status). Admin only."""
    return await _list_proposals(db, status=status_filter, page=page, page_size=page_size)


@router.post("/admin/proposals/{proposal_id}/merge", response_model=dict)
@rate_limit("10/minute")
async def merge_admin_proposal(
    request: Request,
    proposal_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Merge a PR: write to standard body + propagate to forks. Admin only."""
    try:
        proposal = await _merge_proposal(db, proposal_id, reviewed_by=current_user.id)
        return {"id": proposal.id, "status": proposal.status}
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/admin/proposals/{proposal_id}/reject", response_model=dict)
@rate_limit("10/minute")
async def reject_admin_proposal(
    request: Request,
    proposal_id: str,
    payload: ProposalReject,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a PR with a reason. Admin only."""
    try:
        proposal = await _reject_proposal(db, proposal_id, reviewed_by=current_user.id, reason=payload.reason)
        return {"id": proposal.id, "status": proposal.status}
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


@router.post("/{video_id}/begin-edit", response_model=VideoResponse)
@rate_limit("10/minute")
async def begin_own_edit(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start editing a published video: freezes the approved version (public keeps
    watching it) and flips to pending_review. Owner only."""
    video = await require_video_owner(video_id, current_user, db)
    try:
        return VideoResponse.model_validate(await _begin_edit(db, video))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.post("/{video_id}/submit-review", response_model=VideoResponse)
@rate_limit("10/minute")
async def submit_own_review(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit your video for admin review. Owner only."""
    video = await require_video_owner(video_id, current_user, db)
    try:
        return VideoResponse.model_validate(await _submit_for_review(db, video))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.post("/{video_id}/withdraw", response_model=VideoResponse)
@rate_limit("10/minute")
async def withdraw_own_review(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Withdraw your pending review back to draft. Owner only."""
    video = await require_video_owner(video_id, current_user, db)
    try:
        return VideoResponse.model_validate(await _withdraw_submission(db, video))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.post("/{video_id}/fork", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("10/minute")
async def fork_video(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fork a ready video into the current user's library.

    Copies subtitles + practice questions + metadata; the fork is born ready
    and editable. No GPU pipeline runs (扩展 A4).
    """
    from app.services.video_seed_service import fork_video as _fork_video

    try:
        return await _fork_video(db, video_id, current_user)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg) from e


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


@router.post("/user-seed", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("3/minute")
async def user_seed_video(
    request: Request,
    data: VideoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Seed a video from URL on behalf of a regular user (UGC pipeline).

    Creates a non-official video owned by the user, starting in draft
    review status. The user must edit subtitles and submit for review
    before the video becomes publicly visible.
    """
    return await _seed_user_video(db, data.source_url, current_user)


@router.post("/user-seed-full", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("3/minute")
async def user_seed_video_full(
    request: Request,
    data: VideoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One-click user seed: ensure cookies, seed, run full pipeline.

    Like user-seed but also ensures YouTube cookies are valid before
    processing. The video is created as UGC (is_official=False) and
    stays in draft after processing completes, so the creator can
    edit subtitles and practice questions before submitting for admin
    review.
    """
    await _require_valid_cookies(data.source_url)
    return await _seed_user_video(db, data.source_url, current_user)


# ---------------------------------------------------------------------------
# Video likes
# ---------------------------------------------------------------------------


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
