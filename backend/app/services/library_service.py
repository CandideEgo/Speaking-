"""Non-video vocab sets reuse Vocabulary and the existing sieve lifecycle."""

from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequestError, NotFoundError
from app.core.exam_levels import EXAM_LEVELS
from app.models.learning import Vocabulary
from app.models.user import User
from app.models.vocab_set import VocabSet, VocabSetWord
from app.services import ecdict, vocab_set_service


async def create_set(db: AsyncSession, user: User, source_type: str, name: str, exam_level: str | None) -> VocabSet:
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    if source_type == "exam":
        if exam_level not in EXAM_LEVELS:
            raise BadRequestError("请选择有效的考试词库")
        existing = (
            await db.execute(
                select(VocabSet).where(
                    VocabSet.user_id == user.id, VocabSet.source_type == "exam", VocabSet.exam_level == exam_level
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing
        name = str(EXAM_LEVELS[exam_level]["label"]) + "词单"
    if not name.strip():
        raise BadRequestError("请填写词单名称")
    row = VocabSet(
        user_id=user.id,
        source_type=source_type,
        name=name.strip(),
        exam_level=exam_level,
        video_id=None,
        last_activity_at=datetime.now(UTC),
    )
    db.add(row)
    await db.flush()
    return row


async def owned_set(db: AsyncSession, user: User, set_id: str) -> VocabSet:
    row = (
        await db.execute(select(VocabSet).where(VocabSet.id == set_id, VocabSet.user_id == user.id).with_for_update())
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("词单不存在")
    return row


async def add_words(db: AsyncSession, user: User, set_id: str, vocabulary_ids: list[str], words: list[str]) -> dict:
    row = await owned_set(db, user, set_id)
    if row.source_type == "video":
        raise BadRequestError("视频词单请从原视频收词")
    vocab = list(
        (await db.execute(select(Vocabulary).where(Vocabulary.id.in_(vocabulary_ids), Vocabulary.user_id == user.id)))
        .scalars()
        .all()
    )
    if len(vocab) != len(set(vocabulary_ids)):
        raise NotFoundError("所选生词不存在")
    if words and row.source_type != "exam":
        raise BadRequestError("自建词单请从已有生词中选词")
    for token in dict.fromkeys(w.strip().lower() for w in words):
        entry = ecdict.lookup(token)
        if not entry or row.exam_level not in entry["levels"]:
            raise BadRequestError(f"{token} 不在所选考试词库中")
        vocab.append(await vocab_set_service._find_or_create_vocab(db, user.id, token, None))
    existing = set(
        (await db.execute(select(VocabSetWord.vocabulary_id).where(VocabSetWord.set_id == set_id))).scalars().all()
    )
    position = (
        await db.execute(select(func.max(VocabSetWord.position)).where(VocabSetWord.set_id == set_id))
    ).scalar_one() or 0
    added = 0
    for word in vocab:
        if word.id in existing:
            continue
        position += 1
        db.add(
            VocabSetWord(
                set_id=set_id,
                vocabulary_id=word.id,
                position=position,
                status="known" if word.mastery_level == "mastered" else "pending",
            )
        )
        existing.add(word.id)
        added += 1
    row.last_activity_at = datetime.now(UTC)
    await db.flush()
    return {"added": added}


async def remove_word(db: AsyncSession, user: User, set_id: str, set_word_id: str) -> None:
    row = await owned_set(db, user, set_id)
    if row.source_type == "video":
        raise BadRequestError("视频词单请使用快速筛词")
    await db.execute(delete(VocabSetWord).where(VocabSetWord.id == set_word_id, VocabSetWord.set_id == set_id))
    row.last_activity_at = datetime.now(UTC)
