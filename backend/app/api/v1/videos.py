"""Video route handlers — thin HTTP layer only.

All business logic lives in app.services.video_service.
These handlers parse requests, call the service, and return responses.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user, get_current_user, get_optional_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.schemas.video import (
    RecomputeWordLevelsRequest,
    SubtitleBatchUpdate,
    SubtitleResponse,
    SubtitleUpdate,
    VideoAdminResponse,
    VideoAdminUpdate,
    VideoCreate,
    VideoDetailResponse,
    VideoResponse,
    VideoStatusResponse,
    WordLevelsUpdate,
)
from app.services.upload_service import handle_video_upload
from app.services.video_service import (
    delete_video as _delete_video,
)
from app.services.video_service import (
    get_video_detail as _get_video_detail,
)
from app.services.video_service import (
    get_video_quiz as _get_video_quiz,
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
    recompute_word_levels as _recompute_word_levels,
)
from app.services.video_service import (
    search_subtitles as _search_subtitles,
)
from app.services.video_service import (
    search_videos as _search_videos,
)
from app.services.video_service import (
    seed_video as _seed_video,
)
from app.services.video_service import (
    submit_quiz_result as _submit_quiz_result,
)
from app.services.video_service import (
    submit_video as _submit_video,
)
from app.services.video_service import (
    update_subtitle as _update_subtitle,
)
from app.services.video_service import (
    update_subtitles_batch as _update_subtitles_batch,
)
from app.services.video_service import (
    update_video as _update_video,
)
from app.services.video_service import (
    update_word_levels as _update_word_levels,
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


@router.get("/public", response_model=list[VideoResponse])
@rate_limit("30/minute")
async def list_public_videos(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await _list_public_videos(db)


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
        keyword=keyword,
        page=pagination.page,
        page_size=pagination.page_size,
    )


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
        return await _update_subtitle(db, video_id, subtitle_id, payload)
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
        return await _update_subtitles_batch(db, video_id, payload)
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


@router.get("/{video_id}/quiz")
@rate_limit("30/minute")
async def get_video_quiz(
    request: Request,
    video_id: str,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get quiz questions for a video. Returns empty list if quiz not yet generated."""
    result = await _get_video_quiz(db, video_id, current_user)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return result


@router.post("/{video_id}/quiz/submit")
@rate_limit("10/minute")
async def submit_quiz_result(
    request: Request,
    video_id: str,
    score: float = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit quiz score and update learning record."""
    result = await _submit_quiz_result(db, video_id, current_user.id, score)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return result


@router.get("", response_model=list[VideoResponse])
@rate_limit("30/minute")
async def list_videos(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _list_user_videos(db, current_user.id)


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
    from app.services.youtube_cookies_service import ensure_cookies

    cookies_status = await ensure_cookies(data.source_url)
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
    return await _seed_video(db, data.source_url, auto_publish=True)
