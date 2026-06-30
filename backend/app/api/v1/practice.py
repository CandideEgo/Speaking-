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
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, is_video_owner, require_pro_user, require_video_owner
from app.core.database import get_db
from app.core.exam_levels import EXAM_LEVEL_KEYS, level_order, max_level, should_display
from app.models.practice import VideoPracticeQuestion
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus
from app.services import ecdict, exam_corpus
from app.services.ai_service import get_ai_service

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


async def _get_ready_video_or_404(db: AsyncSession, video_id: str) -> Video:
    video = (await db.execute(select(Video).where(Video.id == video_id))).scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


def _snapshot_practice(snapshot: dict | None, level: str) -> list[dict] | None:
    """Return the frozen practice questions for ``level`` from a published
    snapshot, or None if the snapshot has none for this level."""
    if not snapshot:
        return None
    by_level = snapshot.get("practice")
    if not by_level:
        return None
    return by_level.get(level)


def _should_use_snapshot(video: Video, current_user: User | None) -> bool:
    """A non-owner viewing a UGC video under re-review sees the frozen approved
    snapshot instead of the owner's live draft (mirrors get_video_detail)."""
    return (
        not video.is_official
        and not is_video_owner(video, current_user)
        and video.review_status in (VideoReviewStatus.pending_review.value, VideoReviewStatus.rejected.value)
        and video.published_snapshot is not None
    )


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

    video = await _get_ready_video_or_404(db, video_id)

    # While a UGC video is under re-review, non-owners read the frozen snapshot
    # (last approved version), not the owner's in-progress draft.
    if _should_use_snapshot(video, current_user):
        snap_qs = _snapshot_practice(video.published_snapshot, level)
        if snap_qs is not None:
            return PracticeSet(
                video_id=video_id,
                exam_level=level,
                questions=[PracticeQuestion(**q) for q in snap_qs],
            )
        # No snapshot for this level (e.g. owner never generated it before the
        # first approval) → fall through and treat as unavailable.
        raise HTTPException(status_code=409, detail="该等级练习题暂不可用")

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


# ---------------------------------------------------------------------------
# Vocabulary drill (Phase 4) — deterministic, free-tier, no AI.
#
# Generates spelling + meaning-choice items from the video's target-level
# words (drawn from subtitle word_levels via _collect_target_words, same
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
async def get_vocabulary_drill(
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

    # Validate the video exists + is ready (raises 404 on miss).
    await _get_ready_video_or_404(db, video_id)

    from app.models.subtitle import Subtitle

    sub_result = await db.execute(
        select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index)
    )
    subtitles = list(sub_result.scalars().all())
    if not subtitles:
        raise HTTPException(status_code=409, detail="字幕尚未就绪，无法生成词汇练习")

    target_words = _collect_target_words(subtitles, level)
    if not target_words:
        raise HTTPException(status_code=409, detail="该视频暂无目标等级词汇，无法生成练习")

    # Pool of translations for meaning-choice distractors.
    all_translations = [w["translation"] for w in target_words if w["translation"]]

    items: list[VocabDrillItem] = []
    for w in target_words:
        word = w["word"]
        translation = w["translation"] or ""

        # Spelling item: show translation, type the word.
        items.append(
            VocabDrillItem(
                kind="spelling",
                word=word,
                translation=translation,
                answer=word,
                cet_words=[word],
            )
        )

        # Meaning-choice item: pick the translation for `word`. Distractors are
        # other target words' translations (deduped, up to 3).
        if translation:
            distractors = [t for t in all_translations if t and t != translation]
            # Shuffle deterministically-ish by set ordering is fine for a drill.
            distractor_pool = list(dict.fromkeys(distractors))[:3]
            if len(distractor_pool) >= 2:  # need at least 2 distractors to be worthwhile
                options = [*distractor_pool, translation]
                # simple in-place shuffle to avoid the answer always being last
                _shuffle_options(options)
                items.append(
                    VocabDrillItem(
                        kind="meaning_choice",
                        word=word,
                        translation=translation,
                        answer=translation,
                        options=options,
                        cet_words=[word],
                    )
                )

    return VocabDrillSet(video_id=video_id, exam_level=level, items=items)


def _shuffle_options(options: list[str]) -> None:
    """Rotate a small options list in place so the correct answer isn't fixed."""
    if len(options) < 2:
        return
    # Rotate by one position — deterministic, avoids importing random here.
    options[:] = options[1:] + options[:1]


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


# ---------------------------------------------------------------------------
# UGC creator endpoints — edit / regenerate the practice set for your own video.
#
# Owners edit freely (no Pro gate — the creator green channel). Editing a
# published video is blocked until begin-edit (which freezes the approved
# version, incl. practice, to published_snapshot).
# ---------------------------------------------------------------------------


async def _require_editable_own_video(video_id: str, current_user: User, db: AsyncSession) -> Video:
    """Fetch a video owned by the caller; 404 if not owned, 409 if published."""
    video = await require_video_owner(video_id, current_user, db)
    if video.review_status == VideoReviewStatus.published.value:
        raise HTTPException(
            status_code=409,
            detail="视频已发布，请先调用 begin-edit 触发重新审核后再编辑",
        )
    return video


@router.patch("/{video_id}/practice", response_model=PracticeSet)
async def edit_practice(
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
    await _require_editable_own_video(video_id, current_user, db)

    questions_json = [q.model_dump() for q in payload.questions]
    cached = (
        await db.execute(
            select(VideoPracticeQuestion).where(
                VideoPracticeQuestion.video_id == video_id,
                VideoPracticeQuestion.exam_level == level,
            )
        )
    ).scalar_one_or_none()
    if cached is None:
        cached = VideoPracticeQuestion(
            video_id=video_id,
            exam_level=level,
            questions=questions_json,
            question_count=len(questions_json),
        )
        db.add(cached)
    else:
        cached.questions = questions_json
        cached.question_count = len(questions_json)
    await db.commit()
    await db.refresh(cached)
    return PracticeSet(
        video_id=video_id,
        exam_level=level,
        questions=[PracticeQuestion(**q) for q in cached.questions],
    )


@router.post("/{video_id}/practice/regenerate", response_model=PracticeSet)
async def regenerate_practice(
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
    video = await _require_editable_own_video(video_id, current_user, db)
    if video.status != VideoStatus.ready:
        raise HTTPException(status_code=409, detail="视频仍在处理中，暂无法生成练习题")

    from app.models.subtitle import Subtitle

    sub_result = await db.execute(
        select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index)
    )
    subtitles = list(sub_result.scalars().all())
    if not subtitles:
        raise HTTPException(status_code=409, detail="字幕尚未就绪，无法生成练习题")

    cet_words = _collect_target_words(subtitles, level)
    transcript = _transcript(subtitles)

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

    cached = (
        await db.execute(
            select(VideoPracticeQuestion).where(
                VideoPracticeQuestion.video_id == video_id,
                VideoPracticeQuestion.exam_level == level,
            )
        )
    ).scalar_one_or_none()
    if cached is None:
        cached = VideoPracticeQuestion(
            video_id=video_id,
            exam_level=level,
            questions=questions,
            question_count=len(questions),
        )
        db.add(cached)
    else:
        cached.questions = questions
        cached.question_count = len(questions)
    await db.commit()
    await db.refresh(cached)
    return PracticeSet(
        video_id=video_id,
        exam_level=level,
        questions=[PracticeQuestion(**q) for q in cached.questions],
    )
