"""Vocab-set + quick-sieve service (词汇本「筛选 + 快速过筛」闭环, 产品需求 §4.6).

Owns the loop's backend lifecycle:
  * ``collect_set``     — build (or extend) a user's per-video exam-word set
                          from the subtitles' ``word_levels`` annotations,
                          creating ECDICT-enriched Vocabulary rows as needed
  * ``list_sets``       — set cards for the library page (unfinished first)
  * ``get_set_detail``  — ordered words with per-word learning state
  * ``get_sieve_state`` — the next pending word for the quick-sieve UI
  * ``sieve_judge``     — known/unknown verdict, mastery sync, and the
                          learned_words LearningEvent on set completion

Hard rule: word data comes from the local ECDICT service ONLY — no AI/LLM
calls happen anywhere in this module.

Services here never commit; the API handlers commit (see vocab_sets.py).
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exam_levels import EXAM_LEVELS
from app.models.learning import Vocabulary
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video
from app.models.vocab_set import VocabSet, VocabSetWord
from app.services import ecdict
from app.services.exam_service import user_target_level

logger = logging.getLogger(__name__)

# Quick-sieve tri-state (+ terminal "learned" reserved for later loops).
STATUS_PENDING = "pending"
STATUS_KNOWN = "known"
STATUS_UNKNOWN = "unknown"
STATUS_LEARNED = "learned"

# Vocabulary.mastery_level values touched by the sieve (mirrors
# app.services.vocabulary_service constants — kept literal here to avoid a
# service->service import; vocabulary_service owns the canonical set).
MASTERY_NEW = "new"
MASTERY_LEARNING = "learning"
MASTERY_MASTERED = "mastered"

# Detail scopes: which subset of set words to return.
SCOPE_ALL = "all"
SCOPE_UNMASTERED = "unmastered"
SCOPE_LEARNING = "learning"
SCOPES = {SCOPE_ALL, SCOPE_UNMASTERED, SCOPE_LEARNING}

_FALLBACK_LEVEL = "cet4"

# ECDICT's pos field carries frequency codes ("v:2/n:98") and can exceed the
# Vocabulary.part_of_speech column width — truncate defensively.
_POS_MAX_LEN = 20


def _level_label(level: str) -> str:
    """Chinese display name for a level key (raw key as fallback)."""
    info = EXAM_LEVELS.get(level)
    return str(info["label"]) if info else level


def _now() -> datetime:
    return datetime.now(UTC)


async def _load_tokens(db: AsyncSession, video_id: str, level: str) -> list[str]:
    """Ordered, deduped lowercase tokens from the video's subtitles whose
    ``word_levels`` include ``level``.

    Subtitles are walked in ``sentence_index`` order (their canonical
    presentation order) and each token enters the set at its first
    appearance — mirroring the watch-page annotation filter.
    """
    subtitles = (
        (
            await db.execute(
                select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index.asc())
            )
        )
        .scalars()
        .all()
    )

    tokens: list[str] = []
    seen: set[str] = set()
    for sub in subtitles:
        word_levels = sub.word_levels or {}
        if not isinstance(word_levels, dict):
            continue
        for raw_token, levels in word_levels.items():
            token = str(raw_token).strip().lower()
            if not token or token in seen:
                continue
            member = (isinstance(levels, list) and level in levels) or (isinstance(levels, str) and levels == level)
            if member:
                seen.add(token)
                tokens.append(token)
    return tokens


async def _progress_counts(db: AsyncSession, set_id: str) -> tuple[int, int, int, int]:
    """(total, mastered, pending, unknown) for a set.

    ``mastered`` counts sieve status IN (known, learned) — the set's progress
    numerator. A set is complete only when BOTH pending and unknown are zero:
    words judged 「不会」 sit in the 待学清单 (unknown) until the user marks
    them learned (产品需求 §4.5), so the first sieve pass alone never closes it.
    """
    total, mastered, pending, unknown = (
        await db.execute(
            select(
                func.count(VocabSetWord.id),
                func.sum(case((VocabSetWord.status.in_([STATUS_KNOWN, STATUS_LEARNED]), 1), else_=0)),
                func.sum(case((VocabSetWord.status == STATUS_PENDING, 1), else_=0)),
                func.sum(case((VocabSetWord.status == STATUS_UNKNOWN, 1), else_=0)),
            ).where(VocabSetWord.set_id == set_id)
        )
    ).one()
    return total or 0, mastered or 0, pending or 0, unknown or 0


async def _emit_closure_event(db: AsyncSession, user_id: str, vocab_set: VocabSet, total: int) -> None:
    """Emit the single learned_words event that closes a set (non-blocking)."""
    try:
        from app.services.learning_event_service import EVENT_LEARNED_WORDS, emit_event

        await emit_event(
            db,
            user_id,
            EVENT_LEARNED_WORDS,
            event_value=total,
            video_id=vocab_set.video_id,
            metadata={"source": "vocab_set", "set_id": vocab_set.id},
        )
    except Exception:
        logger.exception("Failed to emit learned_words event for set %s", vocab_set.id)


async def _find_or_create_vocab(db: AsyncSession, user_id: str, token: str, video_id: str) -> Vocabulary:
    """Find (or create + ECDICT-enrich) the user's Vocabulary row for a token.

    New rows are filled from ``ecdict.lookup`` — definition / translation /
    part_of_speech / ipa — with ``first_seen_at`` stamped on creation.
    ``mastery_level`` stays at its default "new"; lookups returning nothing
    still create the row (the sieve only needs the word itself).
    """
    vocab = (
        await db.execute(select(Vocabulary).where(Vocabulary.user_id == user_id, Vocabulary.word == token))
    ).scalar_one_or_none()
    if vocab is not None:
        return vocab

    vocab = Vocabulary(
        user_id=user_id,
        word=token,
        video_id=video_id,
        first_seen_at=_now(),
    )
    entry = ecdict.lookup(token)
    if entry:
        vocab.definition = entry.get("definition")
        vocab.translation = entry.get("translation")
        pos = entry.get("pos")
        vocab.part_of_speech = pos[:_POS_MAX_LEN] if pos else None
        vocab.ipa = entry.get("phonetic")
        if entry.get("example_sentences"):
            vocab.example_sentences = entry["example_sentences"]
    db.add(vocab)
    try:
        # SAVEPOINT around the insert: two concurrent collects for the same
        # (user, new token) can race past the initial SELECT and hit the
        # (user_id, word) unique constraint. Rolling back the savepoint
        # discards only this row - NOT the caller's pending VocabSet /
        # VocabSetWord rows (a full db.rollback() would blow those away).
        async with db.begin_nested():
            await db.flush()
    except IntegrityError:
        # The concurrent request won; reuse its row.
        vocab = (
            await db.execute(select(Vocabulary).where(Vocabulary.user_id == user_id, Vocabulary.word == token))
        ).scalar_one()
    return vocab


async def collect_set(db: AsyncSession, user: User, video_id: str, exam_level: str | None = None) -> dict:
    """Build or extend the user's vocab set for a video at the target level.

    Idempotent per (user, video, level): re-collecting only appends set words
    for tokens not already in the set (positions continue after the current
    max). Vocabulary rows are shared with the rest of the learning loop, so a
    token already in the user's vocabulary is reused, not recreated.

    Raises:
        ValueError: the video does not exist (API maps this to 404).
    """
    level = exam_level or (await user_target_level(db, user.id)) or _FALLBACK_LEVEL

    video = await db.get(Video, video_id)
    if video is None:
        raise ValueError("视频不存在")
    # 只对公开可见的视频收词：未发布/已下线的视频不应被收词接口拉取字幕 token。
    # （media 门控挡的是媒体流，这里挡的是字幕标注读取。）
    if not video.is_published or video.storage_mode == "offline":
        raise ValueError("视频不存在")

    vocab_set = (
        await db.execute(
            select(VocabSet).where(
                VocabSet.user_id == user.id,
                VocabSet.video_id == video_id,
                VocabSet.exam_level == level,
            )
        )
    ).scalar_one_or_none()
    is_new = vocab_set is None
    now = _now()
    if vocab_set is None:
        vocab_set = VocabSet(user_id=user.id, video_id=video_id, exam_level=level, last_activity_at=now)
        db.add(vocab_set)
        await db.flush()

    existing_rows = (
        await db.execute(
            select(VocabSetWord.vocabulary_id, VocabSetWord.position).where(VocabSetWord.set_id == vocab_set.id)
        )
    ).all()
    member_vocab_ids = {row[0] for row in existing_rows}
    next_position = max((row[1] for row in existing_rows), default=0)

    added = 0
    for token in await _load_tokens(db, video_id, level):
        vocab = await _find_or_create_vocab(db, user.id, token, video_id)
        if vocab.id in member_vocab_ids:
            continue
        next_position += 1
        db.add(VocabSetWord(set_id=vocab_set.id, vocabulary_id=vocab.id, position=next_position))
        member_vocab_ids.add(vocab.id)
        added += 1

    vocab_set.last_activity_at = now
    await db.flush()

    total = (
        await db.execute(select(func.count(VocabSetWord.id)).where(VocabSetWord.set_id == vocab_set.id))
    ).scalar_one()

    label = _level_label(level)
    if is_new or added > 0:
        message = f"已按{label}筛选，{added} 个单词加入词汇本"
    else:
        message = f"集合已存在，{total} 个单词"

    return {
        "id": vocab_set.id,
        "user_id": vocab_set.user_id,
        "video_id": vocab_set.video_id,
        "exam_level": vocab_set.exam_level,
        "total": total,
        "added": added,
        "existed": not is_new,
        "message": message,
        "last_activity_at": vocab_set.last_activity_at,
        "created_at": vocab_set.created_at,
        "updated_at": vocab_set.updated_at,
    }


async def list_sets(db: AsyncSession, user: User) -> list[dict]:
    """The user's vocab-set cards: unfinished first, then most recent activity.

    ``mastered_count`` counts sieve status IN (known, learned) — the words
    the user has already cleared in the quick sieve.
    """
    sets = (await db.execute(select(VocabSet).where(VocabSet.user_id == user.id))).scalars().all()
    if not sets:
        return []

    set_ids = [s.id for s in sets]
    stat_rows = (
        await db.execute(
            select(
                VocabSetWord.set_id,
                func.count(VocabSetWord.id),
                func.sum(case((VocabSetWord.status.in_([STATUS_KNOWN, STATUS_LEARNED]), 1), else_=0)),
            )
            .where(VocabSetWord.set_id.in_(set_ids))
            .group_by(VocabSetWord.set_id)
        )
    ).all()
    stats = {row[0]: (row[1] or 0, row[2] or 0) for row in stat_rows}

    video_ids = [s.video_id for s in sets]
    videos = (await db.execute(select(Video).where(Video.id.in_(video_ids)))).scalars().all()
    video_map = {v.id: v for v in videos}

    items: list[dict] = []
    for s in sets:
        total, mastered_count = stats.get(s.id, (0, 0))
        video = video_map.get(s.video_id)
        items.append(
            {
                "id": s.id,
                "video_id": s.video_id,
                "exam_level": s.exam_level,
                "title": video.title if video else None,
                "thumbnail_url": video.thumbnail_url if video else None,
                "total": total,
                "mastered_count": mastered_count,
                "last_activity_at": s.last_activity_at,
                "created_at": s.created_at,
            }
        )

    items.sort(
        key=lambda x: (
            x["mastered_count"] >= x["total"],
            -(x["last_activity_at"].timestamp() if x["last_activity_at"] else 0),
        )
    )
    return items


async def _get_owned_set(db: AsyncSession, user: User, set_id: str) -> VocabSet | None:
    """The set only if it belongs to the user — None otherwise (caller 404s,
    so existence is never leaked across users)."""
    return (
        await db.execute(select(VocabSet).where(VocabSet.id == set_id, VocabSet.user_id == user.id))
    ).scalar_one_or_none()


def _scope_filter(scope: str):
    if scope == SCOPE_UNMASTERED:
        return VocabSetWord.status.in_([STATUS_PENDING, STATUS_UNKNOWN])
    if scope == SCOPE_LEARNING:
        return VocabSetWord.status == STATUS_UNKNOWN
    return None


async def get_set_detail(db: AsyncSession, user: User, set_id: str, scope: str = SCOPE_ALL) -> dict | None:
    """Ordered set words joined with their Vocabulary learning state.

    scope: all | unmastered (pending+unknown) | learning (unknown only).
    Returns None when the set doesn't exist or isn't the user's.
    """
    vocab_set = await _get_owned_set(db, user, set_id)
    if vocab_set is None:
        return None

    stmt = (
        select(VocabSetWord, Vocabulary)
        .join(Vocabulary, VocabSetWord.vocabulary_id == Vocabulary.id)
        .where(VocabSetWord.set_id == vocab_set.id)
        .order_by(VocabSetWord.position.asc())
    )
    filter_ = _scope_filter(scope)
    if filter_ is not None:
        stmt = stmt.where(filter_)
    rows = (await db.execute(stmt)).all()

    words = [
        {
            "set_word_id": sw.id,
            "position": sw.position,
            "status": sw.status,
            "word": v.word,
            "ipa": v.ipa,
            "translation": v.translation,
            "part_of_speech": v.part_of_speech,
            "definition": v.definition,
            "mastery_level": v.mastery_level,
            "context_sentence": v.context_sentence,
        }
        for sw, v in rows
    ]

    total, mastered_count, _pending, _unknown = await _progress_counts(db, vocab_set.id)
    video = await db.get(Video, vocab_set.video_id)

    return {
        "id": vocab_set.id,
        "video_id": vocab_set.video_id,
        "exam_level": vocab_set.exam_level,
        "title": video.title if video else None,
        "thumbnail_url": video.thumbnail_url if video else None,
        "total": total,
        "mastered_count": mastered_count,
        "last_activity_at": vocab_set.last_activity_at,
        "created_at": vocab_set.created_at,
        "words": words,
    }


async def get_sieve_state(db: AsyncSession, user: User, set_id: str) -> dict | None:
    """The quick-sieve resume point: next pending word + progress counters.

    ``completed`` means the whole set is done — no pending words AND no
    unknown words left in the 待学清单 (产品需求 §4.5: 学完待学清单才算闭环).
    ``pending_count`` / ``unknown_count`` let the UI show the two stages.
    """
    vocab_set = await _get_owned_set(db, user, set_id)
    if vocab_set is None:
        return None

    row = (
        await db.execute(
            select(VocabSetWord, Vocabulary)
            .join(Vocabulary, VocabSetWord.vocabulary_id == Vocabulary.id)
            .where(VocabSetWord.set_id == vocab_set.id, VocabSetWord.status == STATUS_PENDING)
            .order_by(VocabSetWord.position.asc())
        )
    ).first()

    total, mastered_count, pending_count, unknown_count = await _progress_counts(db, vocab_set.id)

    word_payload = None
    if row is not None:
        _, v = row
        word_payload = {
            "word": v.word,
            "ipa": v.ipa,
            "translation": v.translation,
            "part_of_speech": v.part_of_speech,
            "definition": v.definition,
        }

    return {
        "set_word_id": row[0].id if row else None,
        "position": row[0].position if row else None,
        "sieved_count": mastered_count + unknown_count,
        "total": total,
        "mastered_count": mastered_count,
        "pending_count": pending_count,
        "unknown_count": unknown_count,
        "completed": pending_count == 0 and unknown_count == 0,
        "word": word_payload,
    }


async def sieve_judge(db: AsyncSession, user: User, set_id: str, set_word_id: str, known: bool) -> dict | None:
    """Record a known/unknown verdict for one set word.

    Mastery sync (tri-state semantics):
      * known   -> set word "known"; vocabulary mastered (upgrade only)
      * unknown -> set word "unknown"; vocabulary new -> learning, and never
                   downgraded when already reviewing/mastered

    A 「不会」 verdict drops the word into the 待学清单 (unknown) — it becomes
    mastered later via ``mark_learned``, which is what closes the set
    (产品需求 §4.5). Emits the single learned_words event on closure.

    Returns None when the set/word doesn't exist or isn't the user's.
    """
    vocab_set = await _get_owned_set(db, user, set_id)
    if vocab_set is None:
        return None
    sw = (
        await db.execute(
            select(VocabSetWord).where(
                VocabSetWord.id == set_word_id,
                VocabSetWord.set_id == vocab_set.id,
            )
        )
    ).scalar_one_or_none()
    if sw is None:
        return None
    vocab = await db.get(Vocabulary, sw.vocabulary_id)

    was_completed = (await _progress_counts(db, vocab_set.id))[2:] == (0, 0)

    now = _now()
    if known:
        sw.status = STATUS_KNOWN
        sw.sieved_at = now
        if vocab is not None:
            vocab.mastery_level = MASTERY_MASTERED
    else:
        sw.status = STATUS_UNKNOWN
        sw.sieved_at = now
        if vocab is not None and vocab.mastery_level == MASTERY_NEW:
            vocab.mastery_level = MASTERY_LEARNING
    vocab_set.last_activity_at = now
    await db.flush()

    total, mastered_count, pending_count, unknown_count = await _progress_counts(db, vocab_set.id)
    completed = pending_count == 0 and unknown_count == 0

    # Closure caused by THIS verdict — emit exactly one event (the
    # was_completed guard makes re-judging after completion a no-op).
    if completed and not was_completed:
        await _emit_closure_event(db, user.id, vocab_set, total)

    return {
        "status": sw.status,
        "completed": completed,
        "mastered_count": mastered_count,
        "total": total,
    }


async def mark_learned(db: AsyncSession, user: User, set_id: str, set_word_id: str) -> dict | None:
    """Mark a 待学清单 word as learned — the set's closure step (§4.5).

    Allowed from any non-mastered state (unknown or pending). Sets the set word
    to "learned", stamps ``learned_at``, promotes the vocabulary word to
    mastered, and emits the closure event when this was the last open word.

    Returns None when the set/word doesn't exist or isn't the user's.
    """
    vocab_set = await _get_owned_set(db, user, set_id)
    if vocab_set is None:
        return None
    sw = (
        await db.execute(
            select(VocabSetWord).where(
                VocabSetWord.id == set_word_id,
                VocabSetWord.set_id == vocab_set.id,
            )
        )
    ).scalar_one_or_none()
    if sw is None:
        return None

    was_completed = (await _progress_counts(db, vocab_set.id))[2:] == (0, 0)

    now = _now()
    sw.status = STATUS_LEARNED
    sw.learned_at = now
    if sw.sieved_at is None:
        sw.sieved_at = now
    vocab = await db.get(Vocabulary, sw.vocabulary_id)
    if vocab is not None:
        vocab.mastery_level = MASTERY_MASTERED
        if vocab.first_seen_at is None:
            vocab.first_seen_at = now
    vocab_set.last_activity_at = now
    await db.flush()

    total, mastered_count, pending_count, unknown_count = await _progress_counts(db, vocab_set.id)
    completed = pending_count == 0 and unknown_count == 0

    if completed and not was_completed:
        await _emit_closure_event(db, user.id, vocab_set, total)

    return {
        "status": sw.status,
        "completed": completed,
        "mastered_count": mastered_count,
        "total": total,
    }
