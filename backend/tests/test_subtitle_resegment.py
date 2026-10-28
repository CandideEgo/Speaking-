"""Tests for the bulk re-segment endpoint + rollback.

resegment: snapshots current subtitles, re-cuts into sentences via the same
split/merge pipeline the ingest path uses, drops translations (segmentation
changed). rollback: restores the snapshot row-for-row, including text_zh.

ADM-01: the swap replaces every subtitle id, which used to let the DB cascades
delete users' sentence favorites, wipe the edit history and null out vocabulary
source links. The tests below assert the *side effects*: favorites / revisions /
vocabulary survive a resegment AND a rollback, still pointing at a subtitle row
that exists (and, after rollback, at the original sentence).
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.models.learning import Vocabulary
from app.models.subtitle import Subtitle
from app.models.subtitle_resegment_snapshot import SubtitleResegmentSnapshot
from app.models.subtitle_revision import SubtitleRevision
from app.models.user import User
from app.models.user_content import SentenceFavorite
from app.models.video import Video, VideoSource, VideoStatus
from app.services import subtitle_edit_service as edit_service
from tests.conftest import TestSessionLocal


async def _seed(subtitles: list[dict]) -> str:
    async with TestSessionLocal() as db:
        v = Video(
            title="Reseg",
            source_url="https://youtu.be/reseg",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
        )
        db.add(v)
        await db.flush()
        for i, s in enumerate(subtitles):
            db.add(
                Subtitle(
                    video_id=v.id,
                    start_time=s["start"],
                    end_time=s["end"],
                    text_en=s["text"],
                    text_zh=s.get("zh"),
                    sentence_index=i,
                    words=s.get("words"),
                )
            )
        await db.commit()
        return v.id


@pytest.mark.asyncio
async def test_resegment_splits_long_unsegmented_chunk(client: AsyncClient, admin_headers: dict):
    """A single 30s segment with sentence punctuation should be re-cut into
    multiple sentence-level segments."""
    vid = await _seed(
        [
            {
                "start": 0.0,
                "end": 30.0,
                "text": "Hello world. This is a test. Goodbye now.",
                "zh": "你好世界。这是一个测试。现在再见。",
                "words": [
                    {"word": "Hello", "start": 0.0, "end": 1.0},
                    {"word": "world.", "start": 1.0, "end": 2.0},
                    {"word": "This", "start": 2.0, "end": 3.0},
                    {"word": "is", "start": 3.0, "end": 4.0},
                    {"word": "a", "start": 4.0, "end": 5.0},
                    {"word": "test.", "start": 5.0, "end": 6.0},
                    {"word": "Goodbye", "start": 6.0, "end": 7.0},
                    {"word": "now.", "start": 7.0, "end": 8.0},
                ],
            }
        ]
    )
    resp = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["before_count"] == 1
    assert data["after_count"] >= 3  # split into the 3 sentences
    assert data["translations_cleared"] is True

    # Translations cleared on the new rows.
    async with TestSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    __import__("sqlalchemy")
                    .select(Subtitle)
                    .where(Subtitle.video_id == vid)
                    .order_by(Subtitle.sentence_index)
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == data["after_count"]
        assert all(r.text_zh is None for r in rows)
        # A snapshot was written.
        snaps = (await db.execute(__import__("sqlalchemy").select(SubtitleResegmentSnapshot))).scalars().all()
        assert len(snaps) == 1
        assert snaps[0].rolled_back is False


@pytest.mark.asyncio
async def test_resegment_works_without_words(client: AsyncClient, admin_headers: dict):
    """Legacy rows without word timestamps still re-cut (text + proportional
    fabricated timestamps)."""
    vid = await _seed(
        [
            {
                "start": 0.0,
                "end": 30.0,
                "text": "First sentence. Second sentence. Third one.",
                "zh": "第一句。第二句。第三句。",
            },
        ]
    )
    resp = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["after_count"] >= 2


@pytest.mark.asyncio
async def test_rollback_restores_snapshot(client: AsyncClient, admin_headers: dict):
    """Rollback restores the original subtitles (text + translations) from the
    latest snapshot."""
    vid = await _seed(
        [
            {"start": 0.0, "end": 30.0, "text": "Hello world. Goodbye now.", "zh": "你好世界。现在再见。"},
        ]
    )
    # Re-segment (clears translations).
    resp = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert resp.status_code == 200
    # Roll back.
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/resegment/rollback",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["restored_count"] == 1

    # Original row restored with its translation.
    async with TestSessionLocal() as db:
        rows = (
            (await db.execute(__import__("sqlalchemy").select(Subtitle).where(Subtitle.video_id == vid)))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].text_en == "Hello world. Goodbye now."
        assert rows[0].text_zh == "你好世界。现在再见。"


@pytest.mark.asyncio
async def test_rollback_without_snapshot_rejected(client: AsyncClient, admin_headers: dict):
    vid = await _seed([{"start": 0.0, "end": 2.0, "text": "Hello."}])
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/resegment/rollback",
        headers=admin_headers,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# ADM-01: user data (sentence favorites / revision history / vocabulary links)
# must survive re-segmentation and rollback
# ---------------------------------------------------------------------------


async def _seed_with_user_data() -> tuple[str, str, str]:
    """Video + one multi-sentence subtitles + favorite/revision/vocabulary on it.

    Returns ``(video_id, subtitle_id, user_id)``.
    """
    async with TestSessionLocal() as db:
        user = User(phone="13800138000")
        db.add(user)
        await db.flush()

        video = Video(
            title="Reseg user data",
            source_url="https://youtu.be/reseg-userdata",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
        )
        db.add(video)
        await db.flush()

        subtitle = Subtitle(
            video_id=video.id,
            start_time=0.0,
            end_time=30.0,
            text_en="Hello world. This is a test. Goodbye now.",
            text_zh="你好世界。这是一个测试。现在再见。",
            sentence_index=0,
            words=[
                {"word": "Hello", "start": 0.0, "end": 1.0},
                {"word": "world.", "start": 1.0, "end": 2.0},
                {"word": "This", "start": 2.0, "end": 3.0},
                {"word": "is", "start": 3.0, "end": 4.0},
                {"word": "a", "start": 4.0, "end": 5.0},
                {"word": "test.", "start": 5.0, "end": 6.0},
                {"word": "Goodbye", "start": 6.0, "end": 7.0},
                {"word": "now.", "start": 7.0, "end": 8.0},
            ],
        )
        db.add(subtitle)
        await db.flush()

        db.add(SentenceFavorite(user_id=user.id, subtitle_id=subtitle.id))
        db.add(
            SubtitleRevision(
                subtitle_id=subtitle.id,
                video_id=video.id,
                edited_by=None,
                scope="fork",
                before={"text_en": "Hello world."},
                after={"text_en": "Hello world. This is a test. Goodbye now."},
            )
        )
        db.add(Vocabulary(user_id=user.id, word="Goodbye", video_id=video.id, subtitle_id=subtitle.id))

        await db.commit()
        return video.id, subtitle.id, user.id


async def _subtitle_ids(video_id: str) -> set[str]:
    async with TestSessionLocal() as db:
        rows = (
            (await db.execute(select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index)))
            .scalars()
            .all()
        )
    return {row.id for row in rows}


@pytest.mark.asyncio
async def test_resegment_preserves_favorites_revisions_vocabulary(client: AsyncClient, admin_headers: dict):
    vid, old_sid, _uid = await _seed_with_user_data()

    resp = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["before_count"] == 1
    assert body["after_count"] >= 3
    assert body["favorites_total"] == 1
    assert body["favorites_remapped"] == 1
    assert body["favorites_unmatched"] == 0
    assert body["revisions_total"] == 1
    assert body["revisions_preserved"] == 1
    assert body["vocabulary_total"] == 1
    assert body["vocabulary_relinked"] == 1

    new_ids = await _subtitle_ids(vid)
    assert old_sid not in new_ids

    async with TestSessionLocal() as db:
        favorites = (await db.execute(select(SentenceFavorite))).scalars().all()
        assert len(favorites) == 1
        assert favorites[0].subtitle_id in new_ids  # 指向新字幕，而不是被级联删除

        revisions = (await db.execute(select(SubtitleRevision))).scalars().all()
        assert len(revisions) == 1
        assert revisions[0].subtitle_id in new_ids

        vocab = (await db.execute(select(Vocabulary))).scalars().all()
        assert len(vocab) == 1
        assert vocab[0].subtitle_id in new_ids  # 来源句链未断（不是 NULL）

        snapshot = (await db.execute(select(SubtitleResegmentSnapshot))).scalar_one()
        payload = snapshot.segments_json
        assert isinstance(payload, dict)
        assert payload["version"] == 2
        assert len(payload["segments"]) == 1
        assert old_sid in payload["mapping"]
        assert payload["mapping"][old_sid] in new_ids
        assert payload["user_data"]["captured"]["favorites"][0]["id"] == favorites[0].id
        assert payload["user_data"]["lost"]["favorites"] == []


@pytest.mark.asyncio
async def test_rollback_restores_user_data_onto_original_sentences(client: AsyncClient, admin_headers: dict):
    vid, old_sid, _uid = await _seed_with_user_data()

    resp = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert resp.status_code == 200, resp.text

    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/resegment/rollback",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["restored_count"] == 1
    assert body["favorites_remapped"] == 1
    assert body["revisions_preserved"] == 1
    assert body["vocabulary_relinked"] == 1

    async with TestSessionLocal() as db:
        restored = (
            (await db.execute(select(Subtitle).where(Subtitle.video_id == vid).order_by(Subtitle.sentence_index)))
            .scalars()
            .all()
        )
        assert len(restored) == 1
        restored_id = restored[0].id
        assert restored_id != old_sid  # rollback 重建行（历史实现），映射必须跟着走
        assert restored[0].text_en == "Hello world. This is a test. Goodbye now."

        favorites = (await db.execute(select(SentenceFavorite))).scalars().all()
        assert len(favorites) == 1
        assert favorites[0].subtitle_id == restored_id

        revisions = (await db.execute(select(SubtitleRevision))).scalars().all()
        assert len(revisions) == 1
        assert revisions[0].subtitle_id == restored_id

        vocab = (await db.execute(select(Vocabulary))).scalars().all()
        assert len(vocab) == 1
        assert vocab[0].subtitle_id == restored_id

        snapshot = (await db.execute(select(SubtitleResegmentSnapshot))).scalar_one()
        assert snapshot.rolled_back is True


# --- pure mapping helpers ----------------------------------------------------


def test_map_interval_prefers_containing_segment():
    segments = [{"id": "a", "start": 0.0, "end": 2.0}, {"id": "b", "start": 2.0, "end": 4.0}]

    assert edit_service._map_interval_to_segment(0.1, 1.9, segments) == 0
    assert edit_service._map_interval_to_segment(2.5, 3.5, segments) == 1
    # Boundary: an old start exactly on a segment end belongs to the next one.
    assert edit_service._map_interval_to_segment(2.0, 2.5, segments) == 1


def test_map_interval_falls_back_to_largest_overlap():
    segments = [{"id": "a", "start": 10.0, "end": 12.0}, {"id": "b", "start": 12.0, "end": 16.0}]

    # Old start is before every segment -> no containment; max-overlap decides.
    assert edit_service._map_interval_to_segment(8.0, 13.0, segments) == 0
    assert edit_service._map_interval_to_segment(8.0, 15.5, segments) == 1


def test_map_interval_without_overlap_is_unmatched():
    segments = [{"id": "a", "start": 100.0, "end": 101.0}]
    assert edit_service._map_interval_to_segment(0.0, 1.0, segments) is None


def test_remap_plan_marks_unmatched_and_merges_duplicates():
    capture = edit_service._UserDataCapture(
        favorites=[
            {"id": "f1", "user_id": "u1", "subtitle_id": "o1", "created_at": None},
            {"id": "f2", "user_id": "u1", "subtitle_id": "o2", "created_at": None},  # same user+new -> merged
            {"id": "f3", "user_id": "u2", "subtitle_id": "o3", "created_at": None},  # no mapping -> unmatched
        ],
        revisions=[{"id": "r1", "subtitle_id": "o1"}, {"id": "r2", "subtitle_id": "o3"}],
        vocabulary=[{"id": "v1", "subtitle_id": "o2"}, {"id": "v2", "subtitle_id": "o3"}],
    )

    plan = edit_service._build_remap_plan(capture, {"o1": "n1", "o2": "n1", "o3": None})
    counts = edit_service._remap_counts(plan)

    assert plan.favorites_move == {"n1": ["f1"]}
    assert counts["favorites_remapped"] == 1
    assert counts["favorites_merged"] == 1
    assert counts["favorites_unmatched"] == 1
    assert counts["revisions_preserved"] == 1
    assert counts["revisions_unmatched"] == 1
    assert counts["vocabulary_relinked"] == 1
    assert counts["vocabulary_unmatched"] == 1
    # Unmatched rows are kept in the snapshot payload, never dropped silently.
    assert plan.favorites_unmatched[0]["id"] == "f3"
    assert plan.revisions_unmatched[0]["id"] == "r2"
    assert plan.vocabulary_unmatched[0]["id"] == "v2"


def test_parse_snapshot_payload_accepts_old_list_shape():
    segments = [{"start_time": 0.0, "end_time": 1.0, "text_en": "a", "sentence_index": 0}]

    parsed, meta = edit_service._parse_snapshot_payload(segments)
    assert parsed == segments
    assert meta == {}

    payload = {"version": 2, "segments": segments, "mapping": {}, "user_data": {}}
    parsed, meta = edit_service._parse_snapshot_payload(payload)
    assert parsed == segments
    assert meta["version"] == 2


@pytest.mark.asyncio
async def test_restore_lost_user_data_reinserts_and_dedupes():
    """快照里无法映射的行，回滚时重新挂回恢复出的字幕；重复调用不产生重复行。"""
    from app.models.learning import Vocabulary as VocabModel

    async with TestSessionLocal() as db:
        db.add(VocabModel(user_id="user-1", word="lost", video_id="vid-1", subtitle_id=None))
        await db.commit()
        vocab_id = (await db.execute(select(VocabModel.id))).scalar_one()

    lost = {
        "favorites": [
            {"id": "fav-1", "user_id": "user-1", "subtitle_id": "old-1", "created_at": None},
            {"id": "fav-2", "user_id": "user-2", "subtitle_id": "old-1", "created_at": None},
            # 原字幕不在本次映射里 -> 保持未恢复（仍留在快照 JSON 中）
            {"id": "fav-3", "user_id": "user-3", "subtitle_id": "old-missing", "created_at": None},
        ],
        "revisions": [
            {
                "id": "rev-1",
                "subtitle_id": "old-1",
                "video_id": "vid-1",
                "edited_by": None,
                "scope": "fork",
                "before": {"text_en": "a"},
                "after": {"text_en": "b"},
                "created_at": None,
            }
        ],
        "vocabulary": [{"id": vocab_id, "user_id": "user-1", "subtitle_id": "old-1"}],
    }

    async with TestSessionLocal() as db:
        counts = await edit_service._restore_lost_user_data(db, lost, {"old-1": "new-sub"})
        await db.commit()

        assert counts == {"favorites": 2, "revisions": 1, "vocabulary": 1}
        favorites = (await db.execute(select(SentenceFavorite))).scalars().all()
        assert {fav.subtitle_id for fav in favorites} == {"new-sub"}
        revision = (await db.execute(select(SubtitleRevision))).scalar_one()
        assert revision.subtitle_id == "new-sub"
        vocab = (await db.execute(select(Vocabulary))).scalar_one()
        assert vocab.subtitle_id == "new-sub"

        # 幂等：同一份 lost 再恢复一次不应插入重复收藏。
        again = await edit_service._restore_lost_user_data(db, lost, {"old-1": "new-sub"})
        await db.commit()
        assert again["favorites"] == 0
        assert (await db.scalar(select(func.count()).select_from(SentenceFavorite))) == 2
