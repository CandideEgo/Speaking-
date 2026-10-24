"""Authenticated listening catalog, durable drafts and server-side grading."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.errors import UnprocessableEntityError
from app.models.listening import ListeningSession
from app.models.user import User
from app.services import listening_service as service

router = APIRouter(prefix="/listening", tags=["listening"])


class Start(BaseModel):
    video_id: str = Field(min_length=1, max_length=36)
    count: int = Field(default=5, ge=1, le=10)
    restart: bool = False


class Draft(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict, max_length=10)
    current_index: int = Field(default=0, ge=0, le=9)


@router.get("/videos")
async def videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=30),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.catalog(db, page, page_size)


@router.get("/sessions")
async def sessions(
    page: int = Query(1, ge=1), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    rows = list(
        (
            await db.execute(
                select(ListeningSession)
                .where(ListeningSession.user_id == user.id)
                .order_by(ListeningSession.updated_at.desc())
                .offset((page - 1) * 12)
                .limit(13)
            )
        ).scalars()
    )
    return {
        "items": [
            {
                "id": s.id,
                "title": s.title,
                "total": len(s.questions),
                "answered": sum(bool(a.strip()) for a in s.answers.values()),
                "correct_count": s.correct_count,
                "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
                "updated_at": s.updated_at.isoformat(),
            }
            for s in rows[:12]
        ],
        "has_more": len(rows) > 12,
        "page": page,
    }


@router.post("/sessions")
async def start(body: Start, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session = await service.start(db, user, body.video_id, body.count, body.restart)
    await db.commit()
    return await service.payload(db, session, user)


@router.get("/sessions/{session_id}")
async def detail(session_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.payload(db, await service.owned_session(db, session_id, user.id), user)


@router.put("/sessions/{session_id}")
async def draft(
    session_id: str, body: Draft, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    if any(len(a) > 2000 for a in body.answers.values()):
        raise UnprocessableEntityError("每句答案最多 2000 个字符")
    session = await service.owned_session(db, session_id, user.id, lock=True)
    await service.save(db, session, body.answers, body.current_index)
    await db.commit()
    return {"saved": True, "updated_at": session.updated_at.isoformat()}


@router.post("/sessions/{session_id}/submit")
async def submit(session_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    session = await service.owned_session(db, session_id, user.id, lock=True)
    await service.submit(db, session)
    await db.commit()
    return await service.payload(db, session, user)
