"""Video route handlers — thin HTTP layer only.

All business logic lives in app.services.video_service.
These handlers parse requests, call the service, and return responses.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Form, Request, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.schemas.video import VideoCreate, VideoResponse, VideoDetailResponse, VideoStatusResponse
from app.api.dependencies import get_current_user, get_optional_user, get_admin_user
from app.core.limiter import rate_limit
from app.services.video_service import (
    submit_video as _submit_video,
    seed_video as _seed_video,
    list_public_videos as _list_public_videos,
    list_user_videos as _list_user_videos,
    get_video_detail as _get_video_detail,
    get_video_status as _get_video_status,
    get_video_quiz as _get_video_quiz,
    submit_quiz_result as _submit_quiz_result,
    search_videos as _search_videos,
)
from app.services.upload_service import handle_video_upload

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
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Search videos by keyword across title and topic tags.

    Works for both authenticated and unauthenticated users.
    Authenticated users can also find their own non-official videos.
    """
    user_id = current_user.id if current_user else None
    return await _search_videos(db, query=q, limit=limit, user_id=user_id)


@router.get("/{video_id}", response_model=VideoDetailResponse)
@rate_limit("30/minute")
async def get_video(
    request: Request,
    video_id: str,
    current_user: Optional[User] = Depends(get_optional_user),
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
    current_user: Optional[User] = Depends(get_optional_user),
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
    current_user: Optional[User] = Depends(get_optional_user),
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
