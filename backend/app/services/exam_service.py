"""Exam service — paper generation, server-side grading and the wrong book.

Built on top of ``practice_service``'s adaptive item builders:
- ``daily_check``  draws items across the user's favorite/practiced videos at
  their target exam level.
- ``video_exam``   uses one video's unified drill.
- ``wrong_redo``   re-presents the wrong-book snapshots; a correct redo
  clears the word.

Grading is server-side: snapshots keep the answer, clients submit raw answers.
The wrong book is derived from exam_answers (correct=false without a later
correct wrong_redo answer) — no dedicated table.
"""

import logging
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.exam import (
    MODE_DAILY_CHECK,
    MODE_VIDEO_EXAM,
    MODE_WRONG_REDO,
    ExamAnswer,
    ExamSession,
)
from app.models.favorite import UserFavorite
from app.models.preferences import UserPreferences
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.services import ecdict, practice_service
from app.services.practice_service import (
    _build_production_item,
    _build_recognition_item,
    collect_target_words,
    fetch_subtitles,
)

logger = logging.getLogger(__name__)

# Exam parameters
EXAM_TIME_LIMIT_SECONDS = 1800  # 30:00 countdown on the client
DAILY_CHECK_SIZE = 30
VIDEO_EXAM_SIZE = 20
WRONG_REDO_SIZE = 20
DAILY_CHECK_MAX_VIDEOS = 6
PAPER_SIZE = 20

# Item types that cannot be graded objectively server-side.
_UNGRADABLE_TYPES = {"sentence_repeat"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_level(db: AsyncSession, user: User, level: str | None) -> str:
    """Return the requested level, falling back to the user's target exam."""
    if level:
        return level
    prefs = (await db.execute(select(UserPreferences).where(UserPreferences.user_id == user.id))).scalar_one_or_none()
    return (prefs.target_exam if prefs and prefs.target_exam else None) or "cet4"


def _aware(dt: datetime | None) -> datetime | None:
    """Normalize DB datetimes (SQLite returns naive) to tz-aware UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _strip_answer(item: dict) -> dict:
    """Return a client-safe copy of an item with the answer removed."""
    safe = {k: v for k, v in item.items() if k != "answer"}
    return safe


def _grade(question: dict, user_answer: str | None) -> bool:
    """Server-side grading for one item.

    Choice items (options present) require an exact match on the answer text;
    spelling/fill items compare case-insensitively after trimming.
    """
    expected = question.get("answer")
    if expected is None or user_answer is None:
        return False
    ua = user_answer.strip()
    if not ua:
        return False
    if question.get("options"):
        return ua == str(expected).strip()
    return ua.lower() == str(expected).strip().lower()


def _stem_for(question: dict) -> str:
    """Human-readable stem for wrong-book display."""
    qtype = question.get("type", "")
    word = question.get("word", "")
    if qtype in ("listen_choose_meaning", "see_word_choose_meaning"):
        return f"选出「{word}」的正确释义"
    if qtype in ("see_meaning_spell_word", "listen_spell_word"):
        translation = question.get("translation") or ""
        return f"根据释义拼写单词：{translation}"
    if qtype == "context_fill":
        return question.get("sentence_template") or f"填空：{word}"
    return question.get("sentence_template") or word


def _filter_gradable(items: list[dict]) -> list[dict]:
    """Drop items that can't be graded server-side or lack renderable options."""
    out = []
    for it in items:
        if it.get("type") in _UNGRADABLE_TYPES:
            continue
        # Choice-style items without options can't be rendered as choices.
        if it.get("type") in ("listen_choose_meaning", "see_word_choose_meaning") and not it.get("options"):
            continue
        out.append(it)
    return out


# ---------------------------------------------------------------------------
# Item sourcing per mode
# ---------------------------------------------------------------------------


async def _daily_check_items(db: AsyncSession, user: User, level: str) -> list[dict]:
    """Collect items across the user's favorite/practiced videos."""
    # Candidate videos: favorites + videos already examined, newest first.
    fav_ids = (await db.execute(select(UserFavorite.video_id).where(UserFavorite.user_id == user.id))).scalars().all()
    exam_ids = (
        (
            await db.execute(
                select(ExamSession.video_id)
                .where(ExamSession.user_id == user.id, ExamSession.video_id.is_not(None))
                .distinct()
            )
        )
        .scalars()
        .all()
    )
    candidate_ids: list[str] = []
    for vid in [*fav_ids, *exam_ids]:
        if vid and vid not in candidate_ids:
            candidate_ids.append(vid)

    # Fallback: newest official ready videos.
    if not candidate_ids:
        rows = (
            (
                await db.execute(
                    select(Video)
                    .where(Video.status == VideoStatus.ready, Video.is_official.is_(True))
                    .order_by(Video.created_at.desc())
                    .limit(DAILY_CHECK_MAX_VIDEOS)
                )
            )
            .scalars()
            .all()
        )
        candidate_ids = [v.id for v in rows]

    videos = {
        v.id: v
        for v in (
            (await db.execute(select(Video).where(Video.id.in_(candidate_ids[: DAILY_CHECK_MAX_VIDEOS * 2]))))
            .scalars()
            .all()
        )
    }

    pool: list[dict] = []
    for vid in candidate_ids[:DAILY_CHECK_MAX_VIDEOS]:
        video = videos.get(vid)
        if not video:
            continue
        try:
            items = await practice_service.build_unified_drill(db, vid, level, user)
        except (ValueError, PermissionError) as e:
            logger.debug("daily_check: skipping video %s: %s", vid, e)
            continue
        for it in _filter_gradable(items):
            it = {**it, "video_id": vid, "video_title": video.title}
            pool.append(it)
        if len(pool) >= DAILY_CHECK_SIZE:
            break

    random.shuffle(pool)
    return pool[:DAILY_CHECK_SIZE]


async def _video_exam_items(db: AsyncSession, user: User, level: str, video_id: str) -> list[dict]:
    """Items for a single-video exam."""
    video = await practice_service.get_accessible_video(db, video_id, user)
    items = await practice_service.build_unified_drill(db, video.id, level, user)
    items = _filter_gradable(items)
    for it in items:
        it["video_id"] = video.id
        it["video_title"] = video.title
    random.shuffle(items)
    return items[:VIDEO_EXAM_SIZE]


async def _wrong_redo_items(db: AsyncSession, user: User) -> list[dict]:
    """Re-present current wrong-book items (same snapshots, reshuffled)."""
    wrongs = await get_wrong_items(db, user, limit=WRONG_REDO_SIZE)
    items: list[dict] = []
    for w in wrongs:
        q = dict(w["question"])
        q.setdefault("video_title", w["from"])
        items.append(q)
    random.shuffle(items)
    return items


# ---------------------------------------------------------------------------
# Core: start / submit
# ---------------------------------------------------------------------------


async def start_exam(
    db: AsyncSession,
    user: User,
    mode: str,
    level: str | None = None,
    video_id: str | None = None,
) -> dict:
    """Create an exam session and its answer snapshots.

    Returns ``{session_id, mode, exam_level, video_id, time_limit_seconds,
    questions}`` where ``questions`` are answer-stripped items (each carrying
    the ExamAnswer row ``id`` for submit-time matching).

    Raises:
        ValueError: not enough items / missing video_id / video not ready
        PermissionError: no access to the video
    """
    resolved_level = await _resolve_level(db, user, level)

    if mode == MODE_DAILY_CHECK:
        items = await _daily_check_items(db, user, resolved_level)
        exam_video_id: str | None = None
    elif mode == MODE_VIDEO_EXAM:
        if not video_id:
            raise ValueError("video_exam 模式需要 video_id")
        items = await _video_exam_items(db, user, resolved_level, video_id)
        exam_video_id = video_id
    elif mode == MODE_WRONG_REDO:
        items = await _wrong_redo_items(db, user)
        exam_video_id = None
    else:
        raise ValueError(f"未知的考试模式：{mode}")

    if not items:
        raise ValueError("暂无足够题目，请先学习更多视频内容")

    session = ExamSession(
        user_id=user.id,
        mode=mode,
        exam_level=resolved_level,
        video_id=exam_video_id,
        question_count=len(items),
    )
    db.add(session)
    await db.flush()

    questions: list[dict] = []
    for it in items:
        row = ExamAnswer(session_id=session.id, question=it)
        db.add(row)
        await db.flush()
        questions.append({**_strip_answer(it), "id": row.id})

    await commit_refresh(db, session)
    return {
        "session_id": session.id,
        "mode": mode,
        "exam_level": resolved_level,
        "video_id": exam_video_id,
        "time_limit_seconds": EXAM_TIME_LIMIT_SECONDS,
        "questions": questions,
    }


async def submit_exam(
    db: AsyncSession,
    user: User,
    session_id: str,
    answers: list[dict],
) -> dict:
    """Grade a session server-side, persist results, update SM-2.

    ``answers`` is a list of ``{"id": <exam_answer_id>, "user_answer": str}``.
    Unanswered questions grade as wrong.

    Raises:
        PermissionError: session not found / belongs to another user
        ValueError: session already submitted
    """
    session = (await db.execute(select(ExamSession).where(ExamSession.id == session_id))).scalar_one_or_none()
    if not session or session.user_id != user.id:
        raise PermissionError("Not found")
    if session.submitted_at is not None:
        raise ValueError("该考试已提交")

    rows = (await db.execute(select(ExamAnswer).where(ExamAnswer.session_id == session.id))).scalars().all()
    by_id = {r.id: r for r in rows}
    submitted = {a["id"]: a.get("user_answer") for a in answers if a.get("id") in by_id}

    now = datetime.now(UTC)
    part_scores: dict[str, dict[str, int]] = {}
    correct_total = 0
    review: list[dict] = []
    sm2_results: list[dict] = []

    for row in rows:
        q = row.question or {}
        user_answer = submitted.get(row.id)
        correct = _grade(q, user_answer)
        row.user_answer = user_answer
        row.correct = correct
        row.answered_at = now

        category = q.get("category") or "context"
        part = part_scores.setdefault(category, {"total": 0, "correct": 0})
        part["total"] += 1
        if correct:
            part["correct"] += 1
            correct_total += 1

        review.append(
            {
                "id": row.id,
                "word": q.get("word", ""),
                "correct": correct,
                "user_answer": user_answer,
                "answer": q.get("answer"),
                "translation": q.get("translation", ""),
            }
        )
        if q.get("word"):
            sm2_results.append({"word": q["word"], "correct": correct})

    total = len(rows)
    score = round(correct_total / total * 100, 1) if total else 0.0
    session.submitted_at = now
    session.score = score
    session.part_scores = part_scores
    await db.commit()

    # SM-2 update + LearningEvents (non-blocking inside submit_practice_results).
    if sm2_results:
        try:
            await practice_service.submit_practice_results(db, user.id, sm2_results, session.video_id)
        except Exception:
            logger.exception("Failed to apply SM-2 updates for exam session %s", session.id)

    return {
        "session_id": session.id,
        "score": score,
        "correct": correct_total,
        "total": total,
        "part_scores": part_scores,
        "answers": review,
    }


# ---------------------------------------------------------------------------
# Wrong book (derived)
# ---------------------------------------------------------------------------


async def get_wrong_items(db: AsyncSession, user: User, limit: int = 50) -> list[dict]:
    """Current wrong book: wrong answers not yet cleared by a correct redo.

    A word is wrong when its latest wrong answer is newer than its latest
    correct answer inside a ``wrong_redo`` session.
    """
    rows = (
        await db.execute(
            select(ExamAnswer, ExamSession)
            .join(ExamSession, ExamAnswer.session_id == ExamSession.id)
            .where(ExamSession.user_id == user.id, ExamAnswer.correct.is_not(None))
            .order_by(ExamAnswer.answered_at.asc())
        )
    ).all()

    last_wrong: dict[str, tuple[datetime, ExamAnswer, ExamSession]] = {}
    last_redo_ok: dict[str, datetime] = {}
    for ans, sess in rows:
        word = (ans.question or {}).get("word")
        if not word:
            continue
        t = _aware(ans.answered_at) or _aware(sess.started_at) or datetime.now(UTC)
        if ans.correct:
            if sess.mode == MODE_WRONG_REDO and t >= last_redo_ok.get(word, datetime.min.replace(tzinfo=UTC)):
                last_redo_ok[word] = t
        else:
            last_wrong[word] = (t, ans, sess)

    wrongs: list[tuple[datetime, dict]] = []
    for word, (t, ans, sess) in last_wrong.items():
        if t <= last_redo_ok.get(word, datetime.min.replace(tzinfo=UTC)):
            continue
        q = ans.question or {}
        wrongs.append(
            (
                t,
                {
                    "word": word,
                    "category": q.get("category") or "context",
                    "type": q.get("type", ""),
                    "stem": _stem_for(q),
                    "from": q.get("video_title") or ("视频试卷" if sess.video_id else "每日检测"),
                    "answered_at": t,
                    "question": q,
                },
            )
        )

    wrongs.sort(key=lambda x: x[0], reverse=True)
    return [w for _, w in wrongs[:limit]]


# ---------------------------------------------------------------------------
# Practice hub stats
# ---------------------------------------------------------------------------


async def get_practice_hub(db: AsyncSession, user: User) -> dict:
    """Aggregate stats + per-video paper cards for the practice hub page."""
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

    submitted = (
        (
            await db.execute(
                select(ExamSession).where(ExamSession.user_id == user.id, ExamSession.submitted_at.is_not(None))
            )
        )
        .scalars()
        .all()
    )
    month_count = sum(1 for s in submitted if s.submitted_at and _aware(s.submitted_at) >= month_start)
    week_count = sum(1 for s in submitted if s.submitted_at and _aware(s.submitted_at) >= week_start)

    # Average accuracy across all graded answers.
    acc_row = (
        await db.execute(
            select(func.count(ExamAnswer.id), func.sum(func.coalesce(ExamAnswer.correct, 0).cast(Integer)))
            .join(ExamSession, ExamAnswer.session_id == ExamSession.id)
            .where(ExamSession.user_id == user.id, ExamAnswer.correct.is_not(None))
        )
    ).one()
    total_answered, total_correct = int(acc_row[0] or 0), int(acc_row[1] or 0)
    avg_accuracy = round(total_correct / total_answered * 100, 1) if total_answered else None

    daily_checks = sorted(
        (s for s in submitted if s.mode == MODE_DAILY_CHECK),
        key=lambda s: _aware(s.submitted_at) or _aware(s.started_at) or now,
        reverse=True,
    )
    last_check = None
    if daily_checks:
        lc = daily_checks[0]
        last_check = {"score": lc.score, "date": (lc.submitted_at or lc.started_at)}

    wrong_count = len(await get_wrong_items(db, user, limit=500))

    # --- Video paper cards: videos the user examined or favorited. ---
    paper_video_ids: list[str] = []
    for s in submitted:
        if s.video_id and s.video_id not in paper_video_ids:
            paper_video_ids.append(s.video_id)
    fav_ids = (await db.execute(select(UserFavorite.video_id).where(UserFavorite.user_id == user.id))).scalars().all()
    for vid in fav_ids:
        if vid not in paper_video_ids:
            paper_video_ids.append(vid)

    papers: list[dict] = []
    if paper_video_ids:
        videos = {
            v.id: v for v in (await db.execute(select(Video).where(Video.id.in_(paper_video_ids)))).scalars().all()
        }
        for vid in paper_video_ids:
            video = videos.get(vid)
            if not video:
                continue
            # Real question count = target-level words in the video subtitles.
            question_count = 0
            try:
                subs = await fetch_subtitles(db, vid)
                if subs:
                    level = next((s.exam_level for s in submitted if s.video_id == vid and s.exam_level), None)
                    question_count = len(collect_target_words(subs, level or "cet4"))
            except Exception:
                question_count = 0

            # Aggregate latest per-word outcome for this video.
            answered_words: dict[str, bool] = {}
            ans_rows = (
                (
                    await db.execute(
                        select(ExamAnswer)
                        .join(ExamSession, ExamAnswer.session_id == ExamSession.id)
                        .where(ExamSession.user_id == user.id, ExamSession.video_id == vid)
                        .order_by(ExamAnswer.answered_at.asc())
                    )
                )
                .scalars()
                .all()
            )
            for ans in ans_rows:
                if ans.correct is None:
                    continue
                word = (ans.question or {}).get("word")
                if word:
                    answered_words[word] = ans.correct
            correct_words = sum(1 for ok in answered_words.values() if ok)
            progress = round(correct_words / question_count * 100) if question_count else 0

            vid_sessions = sorted(
                (s for s in submitted if s.video_id == vid),
                key=lambda s: _aware(s.submitted_at) or _aware(s.started_at) or now,
                reverse=True,
            )
            last_score = vid_sessions[0].score if vid_sessions else None
            papers.append(
                {
                    "video_id": vid,
                    "title": video.title,
                    "thumbnail_url": video.thumbnail_url,
                    "question_count": question_count,
                    "progress": min(progress, 100),
                    "last_score": last_score,
                }
            )

    return {
        "month_count": month_count,
        "week_count": week_count,
        "avg_accuracy": avg_accuracy,
        "last_check": last_check,
        "wrong_count": wrong_count,
        "papers": papers,
    }


# ---------------------------------------------------------------------------
# Video paper (instant mode)
# ---------------------------------------------------------------------------


async def get_video_paper(db: AsyncSession, user: User, video_id: str, level: str) -> dict:
    """Paper for the watch-page embedded / paper-column instant mode.

    Grading is client-side here (like the existing /videos/{id}/practice), so
    items keep their answers; submissions reuse POST /videos/practice/submit.

    Raises:
        ValueError: video not found / subtitles not ready
        PermissionError: no access to the video
    """
    await practice_service.get_accessible_video(db, video_id, user)
    items = await practice_service.build_unified_drill(db, video_id, level, user)
    random.shuffle(items)
    return {
        "video_id": video_id,
        "exam_level": level,
        "items": items[:PAPER_SIZE],
    }
