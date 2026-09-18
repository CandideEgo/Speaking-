"""Vocab-set + quick-sieve API (词汇本「筛选 + 快速过筛」闭环, 产品需求 §4.6).

Thin transport layer over app.services.vocab_set_service — auth + validation
+ commit; all logic lives in the service. Word data is ECDICT-only by design
(no AI enrichment anywhere in this flow).
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.services import vocab_set_service

router = APIRouter(prefix="/vocab-sets", tags=["vocab-sets"])


class CollectSetRequest(BaseModel):
    video_id: str
    exam_level: str | None = None


class SieveJudgeRequest(BaseModel):
    known: bool


@router.post("")
@rate_limit("10/minute")
async def collect_vocab_set(
    request: Request,
    body: CollectSetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Collect (or extend) the user's exam-word set for a video.

    Idempotent per (user, video, level): re-collecting appends only new
    tokens. The target level comes from the body, then the user's
    preference, then the "cet4" fallback.
    """
    try:
        result = await vocab_set_service.collect_set(db, current_user, body.video_id, body.exam_level)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    await db.commit()
    return result


@router.get("")
@rate_limit("30/minute")
async def list_vocab_sets(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The user's vocab sets — unfinished first, then most recent activity."""
    return await vocab_set_service.list_sets(db, current_user)


@router.get("/{set_id}")
@rate_limit("30/minute")
async def get_vocab_set(
    request: Request,
    set_id: str,
    scope: str = "all",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set detail with ordered words. scope: all | unmastered | learning."""
    if scope not in vocab_set_service.SCOPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"invalid scope: {scope!r} (expected one of all|unmastered|learning)",
        )
    detail = await vocab_set_service.get_set_detail(db, current_user, set_id, scope)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found")
    return detail


@router.get("/{set_id}/sieve")
@rate_limit("30/minute")
async def get_sieve_state(
    request: Request,
    set_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Quick-sieve resume point: next pending word + progress."""
    state = await vocab_set_service.get_sieve_state(db, current_user, set_id)
    if state is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found")
    return state


@router.post("/{set_id}/words/{set_word_id}/learned")
@rate_limit("30/minute")
async def mark_sieve_word_learned(
    request: Request,
    set_id: str,
    set_word_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """把待学清单里的词标记为已掌握 —— 闭环终点（产品需求 §4.5）。

    过筛判定「不会」的词进入待学清单后，由本端点完成学习闭环；最后一个词
    标记时发射 learned_words LearningEvent。
    """
    result = await vocab_set_service.mark_learned(db, current_user, set_id, set_word_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set word not found")
    await db.commit()
    return result


@router.post("/{set_id}/words/{set_word_id}/sieve")
@rate_limit("10/minute")
async def judge_sieve_word(
    request: Request,
    set_id: str,
    set_word_id: str,
    body: SieveJudgeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a known/unknown verdict; closing the set emits learned_words."""
    result = await vocab_set_service.sieve_judge(db, current_user, set_id, set_word_id, body.known)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set word not found")
    await db.commit()
    return result
