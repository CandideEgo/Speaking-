"""Home feed recommendation service — P2 (ADR-0011).

Builds a 40/30/20/10 mix (high-score / potential / cold-start / long-form)
from the public video pool, then applies diversity (same first ``topic_tags``
≤N consecutive) and soft personalization (history-click ``topic_tags`` weight
+ CEFR level / target_exam band match).

Personalization is a **soft boost, never a hard filter**: videos have no
``exam_level`` field (only CEFR ``difficulty_level``), and a hard filter would
empty a 13-video pool. ``target_exam`` (cet4/cet6/…) maps to a CEFR band and
only nudges ranking. When the pool is too small to mix, or the user has too
few clicks to personalize, we fall back to plain score-desc with
``is_featured`` as a tiebreaker.

This is the ranking layer. Per-video quality signal comes from
``scoring_service`` (P1), behavior data from ``behavior_events`` (P0). See
LAUNCH-SPRINT-2026-07 阶段 5.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get_json, cache_set_json
from app.core.config import get_settings
from app.models.behavior import BehaviorEvent
from app.models.preferences import UserPreferences
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.schemas.video import VideoResponse

# target_exam → CEFR band (soft boost only; videos carry no exam_level field).
# Used to nudge videos of a matching difficulty upward for the user's goal.
_EXAM_CEFR_BAND: dict[str, set[str]] = {
    "cet4": {"A2", "B1"},
    "gaokao": {"A2", "B1"},
    "zhuan4": {"A1", "A2"},
    "cet6": {"B1", "B2"},
    "kaoyan": {"B1", "B2"},
    "zhuan8": {"B2", "C1"},
    "ielts": {"B2", "C1"},
    "toefl": {"B2", "C1"},
}

_BUCKET_ORDER = ("top", "potential", "cold", "long")


def _ensure_aware(dt: datetime) -> datetime:
    """Tag a naive datetime with UTC (SQLite returns naive, Postgres aware)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _first_tag(video: Video) -> str:
    """Lowercased first topic tag of a video, or ``''`` if none."""
    if not video.topic_tags:
        return ""
    return video.topic_tags.split(",")[0].strip().lower()


def _to_response(v: Video) -> dict:
    return VideoResponse.model_validate(v).model_dump()


def _score_ordered(pool: list[Video]) -> list[Video]:
    """score desc (nulls last) → is_featured → created_at desc.

    Stable two-pass sort: created_at desc first, then score desc preserves the
    created_at ordering among equal scores.
    """
    by_created = sorted(pool, key=lambda v: v.created_at, reverse=True)
    return sorted(
        by_created,
        key=lambda v: (v.score is None, -(v.score or 0), 0 if v.is_featured else 1),
    )


async def _candidate_pool(db: AsyncSession) -> list[Video]:
    """Official published ready videos — the recommendation universe.

    Mirrors ``list_public_videos`` filtering; recommendation reuses the same
    visibility gate so nothing unpublished surfaces here.
    """
    result = await db.execute(
        select(Video).where(
            Video.is_official == True,
            Video.is_published == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
    )
    return list(result.scalars().all())


async def _user_topic_weights(db: AsyncSession, user: User | None) -> dict[str, float]:
    """Aggregate ``topic_tags`` weights from the user's recent click history.

    Returns ``{tag: weight}`` (weight = click count). Empty when the user is
    anonymous or has fewer clicks than ``recommend_min_clicks_for_personalization``
    — too little signal to personalize on.
    """
    if user is None:
        return {}
    s = get_settings()
    rows = await db.execute(
        select(Video.topic_tags)
        .join(BehaviorEvent, BehaviorEvent.video_id == Video.id)
        .where(
            BehaviorEvent.user_id == user.id,
            BehaviorEvent.event_type == "click",
        )
        .order_by(BehaviorEvent.server_ts.desc())
        .limit(100)
    )
    tags_lists = [r[0] for r in rows.all() if r[0]]
    if len(tags_lists) < s.recommend_min_clicks_for_personalization:
        return {}
    weights: dict[str, float] = {}
    for tags in tags_lists:
        for tag in tags.split(","):
            tag = tag.strip().lower()
            if tag:
                weights[tag] = weights.get(tag, 0.0) + 1.0
    return weights


def _exam_band(prefs: UserPreferences | None) -> set[str]:
    """CEFR band for the user's ``target_exam`` (soft boost only)."""
    exam = prefs.target_exam if prefs and prefs.target_exam else None
    return _EXAM_CEFR_BAND.get(exam, set()) if exam else set()


def _personalization_boost(
    video: Video,
    topic_weights: dict[str, float],
    exam_band: set[str],
    user_level: str | None,
) -> float:
    """Soft rank boost for a video matching the user's interests/level.

    ``topic_tags`` match is the main signal (weighted by click frequency);
    level + exam-band matches are small tiebreakers. Returns a non-negative
    delta added to the video's effective score — never excludes.
    """
    boost = 0.0
    if topic_weights and video.topic_tags:
        for tag in video.topic_tags.split(","):
            tag = tag.strip().lower()
            if tag in topic_weights:
                boost += topic_weights[tag]
    if user_level and video.difficulty_level == user_level:
        boost += 0.5
    if exam_band and video.difficulty_level in exam_band:
        boost += 0.5
    return boost


def _rank_sort(
    videos: list[Video],
    *,
    personalized: bool,
    topic_weights: dict[str, float],
    exam_band: set[str],
    user_level: str | None,
) -> list[Video]:
    """Stable sort by effective score (``score + boost``) desc, nulls last.

    When not personalized, effective score = raw score. ``is_featured`` and
    ``created_at`` are tiebreakers (created_at desc via the pre-sort).
    """
    by_created = sorted(videos, key=lambda v: v.created_at, reverse=True)

    def key(v: Video):
        eff = v.score or 0
        if personalized:
            eff += _personalization_boost(v, topic_weights, exam_band, user_level)
        return (v.score is None and not personalized, -eff, 0 if v.is_featured else 1)

    return sorted(by_created, key=key)


def _split_into_buckets(by_score: list[Video], page_size: int) -> dict[str, list[Video]]:
    """Pick disjoint 40/30/20/10 buckets from a score-ordered pool.

    Buckets are disjoint by video id. Top is filled first (score desc), then
    potential (engagement desc), cold (recent), long (long + score > floor).
    Each bucket is capped at its ratio share of ``page_size``; unfilled
    capacity backfills from the top-order remainder so the mix always returns
    ``page_size`` items when the pool allows.
    """
    s = get_settings()
    n = page_size
    quotas = {
        "top": max(1, round(s.recommend_ratio_top * n)),
        "potential": max(1, round(s.recommend_ratio_potential * n)),
        "cold": max(1, round(s.recommend_ratio_cold * n)),
        "long": max(1, round(s.recommend_ratio_long * n)),
    }
    # Normalize the sum to exactly n (rounding can overshoot or undershoot).
    total_q = sum(quotas.values())
    if total_q > n:
        keys = sorted(quotas, key=lambda k: quotas[k], reverse=True)
        i = 0
        while total_q > n and i < 1000:
            k = keys[i % len(keys)]
            if quotas[k] > 1:
                quotas[k] -= 1
                total_q -= 1
            i += 1
    elif total_q < n:
        quotas["top"] += n - total_q

    used: set[str] = set()
    buckets: dict[str, list[Video]] = {k: [] for k in _BUCKET_ORDER}

    buckets["top"] = [v for v in by_score if v.id not in used][: quotas["top"]]
    used.update(v.id for v in buckets["top"])

    remaining = [v for v in by_score if v.id not in used]
    by_engagement = sorted(
        remaining,
        key=lambda v: -((v.like_count or 0) + (v.favorite_count or 0) + int(v.view_count or 0)),
    )
    buckets["potential"] = by_engagement[: quotas["potential"]]
    used.update(v.id for v in buckets["potential"])

    cold_cutoff = datetime.now(UTC) - timedelta(days=s.recommend_cold_start_days)
    cold = [
        v
        for v in by_score
        if v.id not in used and v.created_at is not None and _ensure_aware(v.created_at) > cold_cutoff
    ]
    cold.sort(key=lambda v: _ensure_aware(v.created_at), reverse=True)
    buckets["cold"] = cold[: quotas["cold"]]
    used.update(v.id for v in buckets["cold"])

    long_candidates = [
        v
        for v in by_score
        if v.id not in used
        and v.duration is not None
        and v.duration > s.recommend_long_duration_min
        and (v.score or 0) > s.recommend_min_score_for_long
    ]
    long_candidates.sort(key=lambda v: (v.score is None, -(v.score or 0)))
    buckets["long"] = long_candidates[: quotas["long"]]
    used.update(v.id for v in buckets["long"])

    # Backfill any unfilled bucket from the score-ordered remainder so the
    # mix reaches page_size when the pool is large enough.
    for k in _BUCKET_ORDER:
        if len(buckets[k]) < quotas[k]:
            need = quotas[k] - len(buckets[k])
            extra = [v for v in by_score if v.id not in used][:need]
            buckets[k].extend(extra)
            used.update(v.id for v in extra)

    return buckets


def _diversify(items: list[Video], max_consecutive: int) -> list[Video]:
    """Reorder so the same first ``topic_tags`` doesn't appear >N times in a row.

    Frequency-greedy: group by first tag, then repeatedly pick from the
    largest non-empty group that wouldn't breach the cap. This distributes
    the majority tag across the stream instead of clustering it at the tail
    (which a naive head-swap greedy does). No videos dropped; when the ratio
    is too skewed to satisfy the cap (e.g. 15 of one tag, 5 of another), the
    tail degrades gracefully — best effort. No-op when ``max_consecutive`` ≤ 0.
    """
    if max_consecutive <= 0 or not items:
        return list(items)

    groups: dict[str, list[Video]] = {}
    no_tag: list[Video] = []
    for v in items:
        tag = _first_tag(v)
        if tag:
            groups.setdefault(tag, []).append(v)
        else:
            no_tag.append(v)

    result: list[Video] = []
    last_tag = ""
    run = 0
    placed = 0
    total = len(items)

    while placed < total:
        # Candidate groups: non-empty, and not at the cap for the current tag.
        candidates = [(t, g) for t, g in groups.items() if g and not (t == last_tag and run >= max_consecutive)]
        if candidates:
            # Pick from the largest group — uses up the majority tag first so
            # it doesn't all pile up at the end.
            candidates.sort(key=lambda tg: len(tg[1]), reverse=True)
            tag, g = candidates[0]
            picked = g.pop(0)
            if tag == last_tag:
                run += 1
            else:
                last_tag = tag
                run = 1
            result.append(picked)
        elif no_tag:
            # No tagged candidate — a no-tag item resets the run.
            result.append(no_tag.pop())
            last_tag = ""
            run = 0
        else:
            # All remaining groups are at cap (skewed pool) — best effort.
            for t, g in groups.items():
                if g:
                    picked = g.pop(0)
                    if t == last_tag:
                        run += 1
                    else:
                        last_tag = t
                        run = 1
                    result.append(picked)
                    break
        placed += 1

    return result


def _build_mix(
    by_score: list[Video],
    page_size: int,
    *,
    personalized: bool,
    topic_weights: dict[str, float],
    exam_band: set[str],
    user_level: str | None,
) -> list[Video]:
    """Assemble the page-1 mix: effective-score sort → buckets → diversify.

    When personalized, the whole pool is re-sorted by effective score
    (``score + boost``) BEFORE bucketing, so a high-boost video can enter the
    top bucket instead of being locked out by its raw score. Buckets are then
    sliced from that effective ordering (potential still re-sorts by
    engagement, cold/long preserve it). Finally diversity reshuffles runs.
    """
    s = get_settings()
    pool = (
        _rank_sort(
            by_score,
            personalized=True,
            topic_weights=topic_weights,
            exam_band=exam_band,
            user_level=user_level,
        )
        if personalized
        else by_score
    )
    buckets = _split_into_buckets(pool, page_size)
    display: list[Video] = []
    for k in _BUCKET_ORDER:
        display.extend(buckets[k])
    return _diversify(display, s.recommend_consecutive_tag_max)


async def _personalization_signals(
    db: AsyncSession, user: User | None
) -> tuple[dict[str, float], set[str], str | None]:
    """Collect (topic_weights, exam_band, user_level) for a user.

    All empty/None for anonymous users. ``topic_weights`` is also empty when
    the user has too few clicks to personalize.
    """
    if user is None:
        return {}, set(), None
    topic_weights = await _user_topic_weights(db, user)
    prefs = await db.scalar(select(UserPreferences).where(UserPreferences.user_id == user.id))
    exam_band = _exam_band(prefs)
    user_level = user.level if user.level else None
    return topic_weights, exam_band, user_level


async def get_home_feed(db: AsyncSession, user: User | None, page: int, page_size: int) -> dict:
    """Page-1 mix (40/30/20/10 + diversity + personalization); page>1 = score-desc tail.

    The mix is only meaningful for page 1 (it's a curated ``page_size``-item
    window). Page > 1 falls back to plain score-desc pagination over the pool
    — recommendation mixes aren't globally ordered beyond page 1, and the
    homepage only fetches page 1 anyway. Cached per user/page under
    ``recommend:home:{user_key}:{page}:{page_size}`` (60s TTL, fail-open).
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    s = get_settings()
    user_key = user.id if user else "anon"
    cache_key = f"recommend:home:{user_key}:{page}:{page_size}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return cached

    pool = await _candidate_pool(db)
    total = len(pool)

    personalized = False
    if page == 1 and total >= page_size:
        topic_weights, exam_band, user_level = await _personalization_signals(db, user)
        personalized = bool(topic_weights or exam_band or user_level)
        by_score = _score_ordered(pool)
        display = _build_mix(
            by_score,
            page_size,
            personalized=personalized,
            topic_weights=topic_weights,
            exam_band=exam_band,
            user_level=user_level,
        )
    else:
        # page>1 or a pool too small to mix: plain score-desc + featured tiebreak.
        display = _score_ordered(pool)

    offset = (page - 1) * page_size
    page_items = display[offset : offset + page_size]
    has_more = total > page * page_size

    result = {
        "items": [_to_response(v) for v in page_items],
        "page": page,
        "page_size": page_size,
        "has_more": has_more,
        "total": total,
        "personalized": personalized,
    }
    await cache_set_json(cache_key, result, ttl=s.recommend_home_ttl_seconds)
    return result


async def get_category_feed(db: AsyncSession, user: User | None, tag: str, page: int, page_size: int) -> dict:
    """Videos filtered by ``topic_tags`` ILIKE tag, score-ranked + soft personalization.

    No 40/30/20/10 mix here — category browsing is exhaustive ranking within a
    tag, so we rank by effective score (score + personalization boost) with the
    featured/created_at tiebreakers. Cached per user/tag/page (60s, fail-open).
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    s = get_settings()
    tag_lower = (tag or "").strip().lower()
    user_key = f"{user.id if user else 'anon'}:cat:{tag_lower}"
    cache_key = f"recommend:category:{user_key}:{page}:{page_size}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return cached

    escaped = tag_lower.replace("%", "\\%").replace("_", "\\_")
    result = await db.execute(
        select(Video).where(
            Video.is_official == True,
            Video.is_published == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
            Video.topic_tags.ilike(f"%{escaped}%", escape="\\"),
        )
    )
    pool = list(result.scalars().all())
    total = len(pool)

    topic_weights, exam_band, user_level = await _personalization_signals(db, user)
    personalized = bool(topic_weights or exam_band or user_level)
    ordered = _rank_sort(
        pool,
        personalized=personalized,
        topic_weights=topic_weights,
        exam_band=exam_band,
        user_level=user_level,
    )

    offset = (page - 1) * page_size
    page_items = ordered[offset : offset + page_size]
    has_more = total > page * page_size

    result_dict = {
        "items": [_to_response(v) for v in page_items],
        "tag": tag_lower,
        "page": page,
        "page_size": page_size,
        "has_more": has_more,
        "total": total,
        "personalized": personalized,
    }
    await cache_set_json(cache_key, result_dict, ttl=s.recommend_home_ttl_seconds)
    return result_dict


async def invalidate_home_cache() -> None:
    """Invalidate all home/category recommendation caches.

    Best-effort SCAN+DEL; fail-open. Called after video publish/score changes
    so the feed picks up new content without waiting for the 60s TTL.
    """
    from app.core.cache import cache_delete

    await cache_delete("recommend:home:*")
    await cache_delete("recommend:category:*")
