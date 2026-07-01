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

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_pro_user
from app.core.database import get_db
from app.core.exam_levels import EXAM_LEVEL_KEYS
from app.core.limiter import rate_limit
from app.models.user import User
from app.services import practice_service
from app.services.ai_service import AIServiceError

router = APIRouter(prefix="/videos", tags=["practice"])

DEFAULT_COUNT = 6


class PracticeQuestion(BaseModel):
    type: str  # "qa" | "fill_blank" | "reading" | "sentence_building"
    question: str
    answer: str
    options: list[str] | None = None
    cet_words: list[str] = []
    # reading: a comprehension passage the question refers to.
    passage: str | None = None
    # sentence_building: the scrambled tokens; answer is the correct order
    # (space-joined) and options holds the shuffled tokens.
    tokens: list[str] | None = None


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


class PracticeQuestionItem(PracticeQuestion):
    """One editable practice question (UGC editor). Mirrors PracticeQuestion; the
    shared base keeps the on-wire shape identical between editor and player."""

    pass


class PracticeQuestionEdit(BaseModel):
    """Full replacement payload for a video's practice set at a given level.

    The owner sends the complete list of questions; the backend overwrites the
    cached ``questions`` JSON and recomputes ``question_count``. Add/remove/
    reorder are all expressed as "send the new full list".
    """

    questions: list[PracticeQuestionItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers: map service-layer exceptions → HTTP
# ---------------------------------------------------------------------------


def _raise_for_value_error(exc: ValueError) -> None:
    """Map ValueError from the service layer to the appropriate HTTP error."""
    if "not found" in str(exc):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    raise HTTPException(status_code=409, detail=str(exc)) from exc


def _raise_for_permission_error(exc: PermissionError) -> None:
    """Map PermissionError from the service layer to the appropriate HTTP error."""
    if "无权" in str(exc):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/{video_id}/practice", response_model=PracticeSet)
@rate_limit("10/minute")
async def get_practice(
    request: Request,
    video_id: str,
    level: str = Query(..., description="Target exam level key"),
    count: int = Query(DEFAULT_COUNT, ge=1, le=12),
    current_user: User = Depends(require_pro_user),
    db: AsyncSession = Depends(get_db),
):
    """Return (generating on first request) the cached practice set for a level."""
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(status_code=422, detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}")

    try:
        questions = await practice_service.get_or_generate_practice(db, video_id, level, count, current_user)
    except ValueError as e:
        _raise_for_value_error(e)
    except PermissionError as e:
        _raise_for_permission_error(e)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=f"练习题生成失败：{e}") from e

    return PracticeSet(video_id=video_id, exam_level=level, questions=[PracticeQuestion(**q) for q in questions])


# ---------------------------------------------------------------------------
# Vocabulary drill (Phase 4) — deterministic, free-tier, no AI.
#
# Generates spelling + meaning-choice items from the video's target-level
# words (drawn from subtitle word_levels via collect_target_words, same
# primitive the AI practice set uses). Distractors come from other target
# words' translations, so it stays fully local (ECDICT only) and engages the
# learner with the video's own vocabulary.
# ---------------------------------------------------------------------------


class VocabDrillItem(BaseModel):
    """One vocabulary drill item.

    Two kinds:
    - kind="spelling": show ``translation``, learner types the English word
      (``answer`` = the lemma). Graded leniently client-side (case/plural).
    - kind="meaning_choice": show ``word``, pick its Chinese translation from
      ``options`` (``answer`` = the correct option; ``options`` are shuffled).
    """

    kind: str  # "spelling" | "meaning_choice"
    word: str
    translation: str
    answer: str
    options: list[str] | None = None
    cet_words: list[str] = []


class VocabDrillSet(BaseModel):
    video_id: str
    exam_level: str
    items: list[VocabDrillItem]


@router.get("/{video_id}/vocabulary-drill", response_model=VocabDrillSet)
@rate_limit("10/minute")
async def get_vocabulary_drill(
    request: Request,
    video_id: str,
    level: str = Query(..., description="Target exam level key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deterministic vocabulary drill from the video's target-level words.

    Free-tier (not Pro-gated): the drill drives engagement with the video's
    own vocabulary and needs no AI. Generates spelling + meaning-choice items
    on every call (cheap; not cached) so the learner can drill repeatedly.
    """
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(status_code=422, detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}")

    try:
        items = await practice_service.build_vocabulary_drill(db, video_id, level)
    except ValueError as e:
        _raise_for_value_error(e)
    except PermissionError as e:
        _raise_for_permission_error(e)

    return VocabDrillSet(video_id=video_id, exam_level=level, items=[VocabDrillItem(**i) for i in items])


@router.post("/{video_id}/practice/grade", response_model=GradeResponse)
@rate_limit("20/minute")
async def grade_practice_answer(
    request: Request,
    video_id: str,
    body: GradeRequest,
    current_user: User = Depends(require_pro_user),
    db: AsyncSession = Depends(get_db),
):
    """Grade a single practice-question answer."""
    try:
        await practice_service.get_accessible_video(db, video_id, current_user)
    except ValueError as e:
        _raise_for_value_error(e)
    except PermissionError as e:
        _raise_for_permission_error(e)

    try:
        result = await practice_service.grade_answer(body.question.model_dump(), body.user_answer)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=f"判分失败：{e}") from e

    return GradeResponse(correct=result["correct"], explanation=result["explanation"])


# ---------------------------------------------------------------------------
# UGC creator endpoints — edit / regenerate the practice set for your own video.
#
# Owners edit freely (no Pro gate — the creator green channel). Editing a
# published video is blocked until begin-edit (which freezes the approved
# version, incl. practice, to published_snapshot).
# ---------------------------------------------------------------------------


@router.patch("/{video_id}/practice", response_model=PracticeSet)
@rate_limit("10/minute")
async def edit_practice(
    request: Request,
    video_id: str,
    payload: PracticeQuestionEdit,
    level: str = Query(..., description="Target exam level key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Overwrite the cached practice set for a level with the owner's edits.

    Owner only; not Pro-gated. The full question list is replaced (add/remove/
    reorder/tweak all expressed as "send the new list"). Blocked while the
    video is published — begin-edit first.
    """
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(status_code=422, detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}")

    try:
        await practice_service.require_editable_own_video(db, video_id, current_user)
    except PermissionError as e:
        _raise_for_permission_error(e)
    except ValueError as e:
        _raise_for_value_error(e)

    questions_json = [q.model_dump() for q in payload.questions]
    persisted = await practice_service.update_practice_set(db, video_id, level, questions_json)
    return PracticeSet(video_id=video_id, exam_level=level, questions=[PracticeQuestion(**q) for q in persisted])


@router.post("/{video_id}/practice/regenerate", response_model=PracticeSet)
@rate_limit("5/minute")
async def regenerate_practice(
    request: Request,
    video_id: str,
    level: str = Query(..., description="Target exam level key"),
    count: int = Query(DEFAULT_COUNT, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate the practice set for a level from scratch via the AI.

    Owner only; not Pro-gated (creator green channel). Deletes/replaces the
    cached row with a freshly generated set. Blocked while the video is
    published — begin-edit first.
    """
    if level not in EXAM_LEVEL_KEYS:
        raise HTTPException(status_code=422, detail=f"level must be one of: {', '.join(EXAM_LEVEL_KEYS)}")

    try:
        questions = await practice_service.regenerate_practice_questions(db, video_id, level, count, current_user)
    except ValueError as e:
        _raise_for_value_error(e)
    except PermissionError as e:
        _raise_for_permission_error(e)
    except AIServiceError as e:
        raise HTTPException(status_code=502, detail=f"练习题生成失败：{e}") from e

    return PracticeSet(video_id=video_id, exam_level=level, questions=[PracticeQuestion(**q) for q in questions])
