"""User content discovery. Reads never create learning records or invoke AI."""

import logging
import re
from datetime import UTC, datetime

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.exam_levels import normalize_word_levels
from app.models.channel import Channel
from app.models.learning import LearningRecord
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.user_content import ChannelSubscription, SentenceFavorite
from app.models.video import Video, VideoStatus
from app.services import ecdict
from app.services.video_access import check_video_access

logger = logging.getLogger(__name__)

# Home "本周精听" card: only CET / 考研 / 雅思 / 托福 / GRE words are "worth
# remembering" — a zhongkao/gaoKao-only token like "they" is too basic for the
# design. ``levels`` stay canonical keys; the frontend maps them to labels.
SAMPLE_WORD_LEVELS = frozenset({"cet4", "cet6", "ky", "ielts", "toefl", "gre"})
SAMPLE_WORD_LIMIT = 3


def _preview_intro(text: str) -> bool:
    """Skip recognizable credits and greetings, without inventing an excerpt."""
    return bool(
        not text.strip()
        or re.search(r"(?:^|\b)(?:translator|reviewer)\s*[:：]?\s*$", text, re.IGNORECASE)
        or re.match(r"\s*(?:translator|reviewer)\s*[:：]", text, re.IGNORECASE)
        or re.match(
            r"\s*(?:hello\s+(?:everyone|everybody)|hi\s+(?:everyone|everybody)|"
            r"welcome\s+(?:back|to)|my\s+name\s+is|thank\s+you\s+for\s+watching)\b",
            text,
            re.IGNORECASE,
        )
    )


def _preview_quality(text: str) -> int:
    if _preview_intro(text):
        return 0
    # Prefer a complete thought over a segmentation fragment like "So in college,".
    # When none exists, retain the first real subtitle rather than inventing one.
    complete = re.search(r"[.!?][\"'\u201d\u2019]*$", text.strip())
    return 2 if complete and len(re.findall(r"[A-Za-z]+", text)) >= 4 else 1


def public_video_filters():
    return (
        Video.is_official.is_(True),
        Video.is_published.is_(True),
        Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        Video.storage_mode != "offline",
    )


def page_items(items: list, page: int, page_size: int) -> dict:
    offset = (page - 1) * page_size
    return {
        "items": items[offset : offset + page_size],
        "total": len(items),
        "page": page,
        "page_size": page_size,
        "has_more": offset + page_size < len(items),
    }


def dictionary_words(query: str = "", exam_level: str | None = None, page: int = 1, page_size: int = 20) -> dict:
    query = query.strip().lower()
    words = [
        entry
        for entry in ecdict.entries()
        if (not exam_level or exam_level in entry["levels"])
        and (not query or query in entry["lemma"].lower() or query in (entry.get("translation") or ""))
    ]
    words.sort(key=lambda entry: (entry["lemma"].lower() != query, entry["lemma"]))
    return page_items(words, page, page_size)


def _sample_words(sub: Subtitle) -> list[dict]:
    """Words worth remembering from the subtitle that ``sample_text_en`` came from.

    Candidates are the subtitle's ``word_levels`` tokens, ordered by their first
    occurrence in the sentence (tokens absent from the text go last). Tokens in
    :data:`SAMPLE_WORD_LEVELS` — 四级/六级/考研/雅思/托福/GRE — win; when none
    qualify (e.g. "Kick. Flick. Skip.") every token falls back in so the card
    still shows phonetics and translations. ECDICT supplies the glosses: an
    unknown token stays in the list with ``None`` glosses, while an unavailable
    or failing dictionary degrades the whole list to empty — this batch endpoint
    must never 500 because the local dictionary is missing.
    """
    word_levels = normalize_word_levels(sub.word_levels)
    if not word_levels:
        return []
    text = (sub.text_en or "").lower()

    def position(token: str) -> tuple[bool, int]:
        index = text.find(token.lower())
        return (index < 0, index)

    ordered = sorted(word_levels, key=position)
    selected = [token for token in ordered if SAMPLE_WORD_LEVELS.intersection(word_levels[token])]
    if not selected:
        selected = ordered
    try:
        if not ecdict.is_available():
            return []
        entries: list[dict] = []
        for token in selected[:SAMPLE_WORD_LIMIT]:
            entry = ecdict.lookup(token)
            entries.append(
                {
                    "word": token,
                    "phonetic": entry.get("phonetic") if entry else None,
                    "translation": entry.get("translation") if entry else None,
                    "levels": word_levels[token],
                }
            )
        return entries
    except Exception:
        logger.exception("learning metadata sample words failed", extra={"subtitle_id": sub.id})
        return []


async def learning_metadata(db: AsyncSession, ids: list[str]) -> dict:
    rows = (
        (
            await db.execute(
                select(Subtitle)
                .join(Video)
                .where(Video.id.in_(ids), *public_video_filters())
                .order_by(Subtitle.sentence_index)
            )
        )
        .scalars()
        .all()
    )
    metadata: dict[str, dict] = {}
    words: dict[str, set[str]] = {}
    first_subtitles: dict[str, Subtitle] = {}
    for sub in rows:
        item = metadata.setdefault(
            sub.video_id,
            {"subtitle_count": 0, "exam_word_count": 0, "sample_text_en": sub.text_en, "sample_text_zh": sub.text_zh},
        )
        item["subtitle_count"] += 1
        words.setdefault(sub.video_id, set()).update(str(w).lower() for w in (sub.word_levels or {}))
        previous = first_subtitles.setdefault(sub.video_id, sub)
        if _preview_quality(sub.text_en or "") > _preview_quality(previous.text_en or ""):
            first_subtitles[sub.video_id] = sub
    for video_id, item in metadata.items():
        item["exam_word_count"] = len(words[video_id])
        sample = first_subtitles[video_id]
        item["sample_text_en"] = sample.text_en
        item["sample_text_zh"] = sample.text_zh
        item["sample_words"] = _sample_words(sample)
        # The preview and every sentence-focus link must refer to this same
        # subtitle. Additive fields keep existing metadata consumers intact.
        item["sample_subtitle_id"] = sample.id
        item["sample_start_time"] = sample.start_time
        item["sample_end_time"] = sample.end_time
        item["sample_word_timestamps"] = sample.words or []
    return metadata


async def channel_subscriptions(db: AsyncSession, user: User) -> list[dict]:
    """Subscribed channels as *entry points*, not just names.

    Each row carries only facts the user can act on right now:
    - ``latest_video``: newest public video in the channel;
    - ``continue_video``: the most recently touched in-progress video;
    - ``unlearned_count``: public videos without any learning record (called
      "未学" in the UI; it is not an unread/new badge and has no update cadence).
    No dates are invented: ``latest_video.published_at`` is the real upstream
    publish time, and channels with no public videos keep null/0 values.
    """
    from app.services import channel_service

    rows = (
        (
            await db.execute(
                select(Channel)
                .join(ChannelSubscription)
                .where(ChannelSubscription.user_id == user.id, Channel.is_visible.is_(True))
                .order_by(ChannelSubscription.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return []

    channel_ids = [channel.id for channel in rows]
    latest_videos = await channel_service.latest_public_videos(db, channel_ids)
    counts = await channel_service.public_video_counts(db, channel_ids)

    learning_rows = (
        await db.execute(
            select(LearningRecord, Video)
            .join(Video, LearningRecord.video_id == Video.id)
            .where(
                LearningRecord.user_id == user.id,
                Video.channel_ref.in_(channel_ids),
                *public_video_filters(),
            )
            .order_by(
                LearningRecord.last_accessed_at.desc().nulls_last(),
                LearningRecord.created_at.desc(),
            )
        )
    ).all()

    touched_video_ids: dict[str, set[str]] = {}
    continue_by_channel: dict[str, tuple[LearningRecord, Video]] = {}
    for record, video in learning_rows:
        if not video.channel_ref:
            continue
        touched_video_ids.setdefault(video.channel_ref, set()).add(video.id)
        if (
            video.channel_ref not in continue_by_channel
            and not record.completed
            and (record.progress_percentage or 0) > 0
        ):
            continue_by_channel[video.channel_ref] = (record, video)

    result: list[dict] = []
    for channel in rows:
        latest_video = latest_videos.get(channel.id)
        continuation = continue_by_channel.get(channel.id)
        result.append(
            {
                "id": channel.id,
                "slug": channel.slug,
                "name": channel.name,
                "description": channel.description,
                "cover_url": channel.cover_url or (latest_video.thumbnail_url if latest_video else None),
                "video_count": counts.get(channel.id, 0),
                "latest_video": channel_service.latest_video_payload(latest_video),
                "continue_video": (
                    {
                        **(channel_service.latest_video_payload(continuation[1]) or {}),
                        "id": continuation[1].id,
                        "title": continuation[1].title,
                        "title_zh": continuation[1].title_zh,
                        "thumbnail_url": continuation[1].thumbnail_url,
                        "duration": continuation[1].duration,
                        "progress_percentage": round(continuation[0].progress_percentage or 0, 1),
                        "position_seconds": continuation[0].position_seconds,
                    }
                    if continuation
                    else None
                ),
                "unlearned_count": max(
                    0,
                    counts.get(channel.id, 0) - len(touched_video_ids.get(channel.id, set())),
                ),
            }
        )
    return result


async def set_channel_subscription(db: AsyncSession, user: User, slug: str, subscribed: bool) -> dict:
    # Serialise duplicate requests before checking the unique membership.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    channel = (await db.execute(select(Channel).where(Channel.slug == slug))).scalar_one_or_none()
    if channel is None or (subscribed and not channel.is_visible):
        raise NotFoundError("频道不存在")
    row = (
        await db.execute(
            select(ChannelSubscription).where(
                ChannelSubscription.user_id == user.id, ChannelSubscription.channel_id == channel.id
            )
        )
    ).scalar_one_or_none()
    if subscribed and row is None:
        db.add(ChannelSubscription(user_id=user.id, channel_id=channel.id))
    elif not subscribed and row is not None:
        await db.delete(row)
    return {"subscribed": subscribed}


async def sentence_favorites(db: AsyncSession, user: User, page: int, page_size: int) -> dict:
    rows = (
        await db.execute(
            select(SentenceFavorite, Subtitle, Video)
            .join(Subtitle, SentenceFavorite.subtitle_id == Subtitle.id)
            .join(Video, Subtitle.video_id == Video.id)
            .where(SentenceFavorite.user_id == user.id)
            .order_by(SentenceFavorite.created_at.desc())
        )
    ).all()
    items = []
    for favorite, sub, video in rows:
        available = check_video_access(video, user) and video.is_published and video.storage_mode != "offline"
        items.append(
            {
                "id": favorite.id,
                "subtitle_id": sub.id,
                "video_id": video.id,
                "title": video.title if available else "原视频已不可用",
                "text_en": sub.text_en if available else "这条收藏的原视频已下架或不再公开。",
                "text_zh": sub.text_zh if available else None,
                "start_time": sub.start_time if available else None,
                "available": available,
                "created_at": favorite.created_at,
            }
        )
    return page_items(items, page, page_size)


async def set_sentence_favorite(db: AsyncSession, user: User, subtitle_id: str, saved: bool) -> dict:
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    if saved:
        row = (
            await db.execute(
                select(Subtitle, Video).join(Video).where(Subtitle.id == subtitle_id, *public_video_filters())
            )
        ).first()
        if row is None:
            raise NotFoundError("句子不存在或视频不可用")
    favorite = (
        await db.execute(
            select(SentenceFavorite).where(
                SentenceFavorite.user_id == user.id, SentenceFavorite.subtitle_id == subtitle_id
            )
        )
    ).scalar_one_or_none()
    if saved and favorite is None:
        db.add(SentenceFavorite(user_id=user.id, subtitle_id=subtitle_id, created_at=datetime.now(UTC)))
    elif not saved:
        await db.execute(
            delete(SentenceFavorite).where(
                SentenceFavorite.user_id == user.id, SentenceFavorite.subtitle_id == subtitle_id
            )
        )
    return {"saved": saved}


async def search(db: AsyncSession, query: str, group: str, page: int, page_size: int, user: User) -> dict:
    """Each group has an independent page. No unpublished metadata is exposed."""
    from app.services import search_service
    from app.services.video_card import serialize_video_card

    result = {}
    offset = (page - 1) * page_size
    if group in ("all", "videos"):
        items = await search_service.search_videos(db, query, limit=page_size + 1, user_id=user.id, offset=offset)
        result["videos"] = {"items": items[:page_size], "has_more": len(items) > page_size}
    if group in ("all", "subtitles"):
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        rows = (
            await db.execute(
                select(Subtitle, Video)
                .join(Video)
                .where(
                    *public_video_filters(),
                    or_(
                        Subtitle.text_en.ilike(f"%{escaped}%", escape="\\"),
                        Subtitle.text_zh.ilike(f"%{escaped}%", escape="\\"),
                    ),
                )
                .order_by(Video.created_at.desc(), Subtitle.sentence_index)
                .offset(offset)
                .limit(page_size + 1)
            )
        ).all()
        result["subtitles"] = {
            "items": [
                {
                    "id": sub.id,
                    "text_en": sub.text_en,
                    "text_zh": sub.text_zh,
                    "start_time": sub.start_time,
                    "video": serialize_video_card(video, scope="feed"),
                }
                for sub, video in rows[:page_size]
            ],
            "has_more": len(rows) > page_size,
        }
    if group in ("all", "words"):
        result["words"] = dictionary_words(query, page=page, page_size=page_size)
    if group in ("all", "channels"):
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        channel_rows = (
            (
                await db.execute(
                    select(Channel)
                    .where(
                        Channel.is_visible.is_(True),
                        or_(
                            Channel.name.ilike(f"%{escaped}%", escape="\\"),
                            Channel.description.ilike(f"%{escaped}%", escape="\\"),
                        ),
                    )
                    .order_by(Channel.name, Channel.id)
                    .offset(offset)
                    .limit(page_size + 1)
                )
            )
            .scalars()
            .all()
        )
        from app.services.channel_service import search_channel_cards

        result["channels"] = {
            "items": await search_channel_cards(db, list(channel_rows[:page_size]), user.id),
            "has_more": len(channel_rows) > page_size,
        }
    return result
