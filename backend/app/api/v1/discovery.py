"""Transport for user-facing discovery and persistent content actions."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.discovery import (
    ChannelSubscriptionCard,
    DictionaryResponse,
    LearningMetadataItem,
    SentenceFavoriteItem,
    SentenceFavoriteStatus,
    SubscriptionState,
)
from app.schemas.pagination import PaginatedResponse
from app.services import discovery_service

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("/learning-metadata", response_model=dict[str, LearningMetadataItem])
@rate_limit("60/minute")
async def learning_metadata(
    request: Request, ids: str = Query(..., max_length=4000), db: AsyncSession = Depends(get_db)
):
    return await discovery_service.learning_metadata(db, list(dict.fromkeys(ids.split(",")))[:100])


@router.get("/dictionary", response_model=DictionaryResponse)
@rate_limit("60/minute")
async def dictionary(
    request: Request,
    q: str = Query("", max_length=100),
    exam_level: str | None = None,
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    return discovery_service.dictionary_words(q, exam_level, page, page_size)


@router.get("/search")
@rate_limit("60/minute")
async def search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=100),
    group: Literal["all", "videos", "subtitles", "words", "channels"] = "all",
    page: int = Query(1, ge=1, le=1000),
    page_size: int = Query(12, ge=1, le=30),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await discovery_service.search(db, q.strip(), group, page, page_size, user)


@router.get("/subscriptions", response_model=list[ChannelSubscriptionCard])
async def subscriptions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await discovery_service.channel_subscriptions(db, user)


@router.put("/subscriptions/{slug}", response_model=SubscriptionState)
@rate_limit("30/minute")
async def subscribe(
    request: Request, slug: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await discovery_service.set_channel_subscription(db, user, slug, True)
    await db.commit()
    return result


class CreateSet(BaseModel):
    source_type: Literal["custom", "exam"]
    name: str = Field(default="", max_length=100)
    exam_level: str | None = None


class SetWords(BaseModel):
    vocabulary_ids: list[str] = Field(default_factory=list, max_length=100)
    words: list[str] = Field(default_factory=list, max_length=100)


class RenameSet(BaseModel):
    name: str = Field(min_length=1, max_length=100)


@router.post("/sets", status_code=201)
@rate_limit("20/minute")
async def create_set(
    request: Request, payload: CreateSet, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    from app.services import library_service

    row = await library_service.create_set(db, user, payload.source_type, payload.name, payload.exam_level)
    await db.commit()
    return {"id": row.id}


@router.patch("/sets/{set_id}")
async def rename_set(
    set_id: str, payload: RenameSet, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    from app.core.errors import BadRequestError
    from app.services import library_service

    row = await library_service.owned_set(db, user, set_id)
    if row.source_type == "video" or not payload.name.strip():
        raise BadRequestError("请填写自建或考试词单名称")
    row.name = payload.name.strip()
    await db.commit()
    return {"id": row.id, "name": row.name}


@router.delete("/sets/{set_id}")
async def delete_set(set_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import delete

    from app.models.vocab_set import VocabSet, VocabSetWord
    from app.services import library_service

    await library_service.owned_set(db, user, set_id)
    await db.execute(delete(VocabSetWord).where(VocabSetWord.set_id == set_id))
    await db.execute(delete(VocabSet).where(VocabSet.id == set_id, VocabSet.user_id == user.id))
    await db.commit()
    return {"deleted": True}


@router.post("/sets/{set_id}/words")
@rate_limit("30/minute")
async def add_words(
    request: Request,
    set_id: str,
    payload: SetWords,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services import library_service

    result = await library_service.add_words(db, user, set_id, payload.vocabulary_ids, payload.words)
    await db.commit()
    return result


@router.delete("/sets/{set_id}/words/{set_word_id}")
async def remove_word(
    set_id: str, set_word_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    from app.services import library_service

    await library_service.remove_word(db, user, set_id, set_word_id)
    await db.commit()
    return {"removed": True}


class DailyStart(BaseModel):
    token: str = Field(min_length=1, max_length=20000)


@router.get("/daily")
@rate_limit("30/minute")
async def daily_preview(
    request: Request,
    variant: int = Query(0, ge=0, le=10000),
    question_type: Literal["reading", "matching", "cloze"] | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services import daily_recommendation_service

    return await daily_recommendation_service.preview(db, user, variant, question_type)


@router.get("/practice-summary")
async def practice_summary(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.services import daily_recommendation_service

    return await daily_recommendation_service.summary(db, user)


@router.post("/daily/start")
@rate_limit("20/minute")
async def daily_start(
    request: Request, payload: DailyStart, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    from app.services import daily_recommendation_service

    session, questions = await daily_recommendation_service.start(db, user, payload.token)
    await db.commit()
    return {
        "session_id": session.id,
        "paper_id": session.paper_id,
        "mode": session.mode,
        "question_count": len(questions),
        "questions": [
            {key: q[key] for key in ("id", "number", "section", "question_type", "passage", "question", "options")}
            for q in questions
        ],
    }


@router.delete("/subscriptions/{slug}", response_model=SubscriptionState)
@rate_limit("30/minute")
async def unsubscribe(
    request: Request, slug: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await discovery_service.set_channel_subscription(db, user, slug, False)
    await db.commit()
    return result


@router.get("/sentence-favorites", response_model=PaginatedResponse[SentenceFavoriteItem])
async def sentence_favorites(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await discovery_service.sentence_favorites(db, user, page, page_size)


@router.get("/sentence-favorites/{subtitle_id}", response_model=SentenceFavoriteStatus)
async def sentence_status(subtitle_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select

    from app.models.user_content import SentenceFavorite

    value = (
        await db.execute(
            select(SentenceFavorite.id).where(
                SentenceFavorite.user_id == user.id, SentenceFavorite.subtitle_id == subtitle_id
            )
        )
    ).scalar_one_or_none()
    return {"saved": value is not None}


@router.put("/sentence-favorites/{subtitle_id}", response_model=SentenceFavoriteStatus)
@rate_limit("60/minute")
async def save_sentence(
    request: Request, subtitle_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await discovery_service.set_sentence_favorite(db, user, subtitle_id, True)
    await db.commit()
    return result


@router.delete("/sentence-favorites/{subtitle_id}", response_model=SentenceFavoriteStatus)
@rate_limit("60/minute")
async def remove_sentence(
    request: Request, subtitle_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await discovery_service.set_sentence_favorite(db, user, subtitle_id, False)
    await db.commit()
    return result
