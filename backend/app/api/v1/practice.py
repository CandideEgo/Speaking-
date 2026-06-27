"""Practice mode — AI-generated questions per exam level for a video.

GET  /api/v1/videos/{video_id}/practice?level=<exam_level>
    Generate-on-demand + DB cache. First request generates a question set for
    the given exam level (content Q&A + word fill-in-the-blank from the
    target-level vocabulary) and caches it under video_practice_questions;
    subsequent requests return the cached set.

POST /api/v1/videos/{video_id}/practice/grade
    Grade one answer. Fill-in-the-blank is lenient locally; open-ended Q&A is
    graded by the AI.

Pro-gated: practice is a Pro feature (annotation/highlighting stays free).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_pro_user
from app.core.database import get_db
from app.core.exam_levels import EXAM_LEVEL_KEYS, level_order, max_level, should_display
from app.models.practice import VideoPracticeQuestion
from app.models.user import User
from app.models.video import Video
from app.services import ecdict, exam_corpus
from app.services.ai_service import get_ai_service

router = APIRouter(prefix="/videos", tags=["practice"])

DEFAULT_COUNT = 6


class PracticeQuestion(BaseModel):
    type: str  # "qa" | "fill_blank"
    question: str
    answer: str
    options: list[str] | None = None
    cet_words: list[str] = []


class PracticeSet(BaseModel):
    video_id: str
    exam_level: str
    questions: list[PracticeQuestion]


class GradeRequest(BaseModel):
    question: PracticeQuestion
    user_answer: str = ""


class GradeResponse(BaseModel):
    correct: bool
    explanation: str


async def _get_ready_video_or_404(db: AsyncSession, video_id: str) -> Video:
    video = (await db.execute(select(Video).where(Video.id == video_id))).scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


def _collect_target_words(subtitles, target_level: str) -> list[dict]:
    """Collect {word, translation} for words whose highest level >= target,
    drawn from the subtitles' word_levels annotations. Returns the ECDICT
    translation for each so the prompt has Chinese context."""
    seen: dict[str, list[str]] = {}
    for sub in subtitles:
        if not sub.word_levels:
            continue
        for surface, levels in sub.word_levels.items():
            if should_display(levels, target_level) and surface not in seen:
                seen[surface] = levels
    words: list[dict] = []
    for surface, _levels in seen.items():
        entry = ecdict.lookup(surface)
        words.append({"word": surface, "translation": entry["translation"] if entry else ""})
        if len(words) >= 30:
            break
    return words


def _transcript(subtitles) -> str:
    return " ".join(s.text_en for s in subtitles if s.text_en)


@router.get("/{video_id}/practice", response_model=PracticeSet)
async def get_practice(
    video_id: str,
    level: str = Query(..., description="Target exam level key"),
    count: int = Query(DEFAULT_COUNT, ge=1, le=12),
    current_user: User = Depends(require_pro_user),
    db: AsyncSession = Depends(get_db),
):
    """Return (generating on first request) the cached practice set for a level."""
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(status_code=422, detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}")

    await _get_ready_video_or_404(db, video_id)

    # Cached?
    cached = (
        await db.execute(
            select(VideoPracticeQuestion).where(
                VideoPracticeQuestion.video_id == video_id,
                VideoPracticeQuestion.exam_level == level,
            )
        )
    ).scalar_one_or_none()
    if cached:
        return PracticeSet(
            video_id=video_id,
            exam_level=level,
            questions=[PracticeQuestion(**q) for q in cached.questions],
        )

    # Generate from the video's subtitles + target-level words.
    from app.models.subtitle import Subtitle

    sub_result = await db.execute(
        select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index)
    )
    subtitles = list(sub_result.scalars().all())
    if not subtitles:
        raise HTTPException(status_code=409, detail="字幕尚未就绪，无法生成练习题")

    cet_words = _collect_target_words(subtitles, level)
    transcript = _transcript(subtitles)

    # Source layer: pull 真题 sentences containing the target words to seed
    # authentic fill-in-the-blank questions. Non-fatal if corpus is empty.
    exam_examples: list[str] = []
    try:
        exam_examples = await exam_corpus.example_sentences_for_words(
            db, [w["word"] for w in cet_words], level, limit=5
        )
    except Exception:
        pass

    try:
        ai = get_ai_service()
        questions = await ai.generate_practice_questions(
            transcript, cet_words, level, count, exam_examples=exam_examples
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"练习题生成失败：{exc}") from exc

    if not questions:
        raise HTTPException(status_code=502, detail="练习题生成失败，请稍后重试")

    record = VideoPracticeQuestion(
        video_id=video_id,
        exam_level=level,
        questions=questions,
        question_count=len(questions),
    )
    db.add(record)
    await db.commit()

    return PracticeSet(
        video_id=video_id,
        exam_level=level,
        questions=[PracticeQuestion(**q) for q in questions],
    )


@router.post("/{video_id}/practice/grade", response_model=GradeResponse)
async def grade_practice_answer(
    video_id: str,
    body: GradeRequest,
    current_user: User = Depends(require_pro_user),
    db: AsyncSession = Depends(get_db),
):
    """Grade a single practice-question answer."""
    await _get_ready_video_or_404(db, video_id)
    try:
        ai = get_ai_service()
        result = await ai.grade_answer(body.question.model_dump(), body.user_answer)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"判分失败：{exc}") from exc
    return GradeResponse(correct=result["correct"], explanation=result["explanation"])
