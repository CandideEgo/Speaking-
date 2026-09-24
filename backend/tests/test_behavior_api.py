"""Behavior event API tests (ADR-0011 P0 collection channel).

Covers the anonymous + authenticated ingest paths, batch flush, the
LearningRecord / Video.view_count side-effects, and the LearningEvent mirror
(completed video) — the collection channel feeding scoring + recommendations
had zero coverage before.
"""

import pytest_asyncio
from sqlalchemy import select, text

from app.models.behavior import BehaviorEvent
from app.models.learning import LearningRecord
from app.models.learning_plan import LearningEvent
from app.models.video import Video, VideoSource, VideoStatus

# Not a row in `videos` — stands in for a video deleted between page load and
# the analytics flush.
_BOGUS_VIDEO_ID = "00000000-0000-4000-8000-0000000000ff"


def _session_maker():
    from app.core.database import async_session

    return async_session


@pytest_asyncio.fixture
async def fk_enforced(db_session):
    """Turn SQLite foreign-key enforcement on for one test.

    SQLite defaults to ``foreign_keys=OFF``, while production Postgres always
    enforces FKs, so a dangling ``video_id`` silently inserts under the test
    harness. The test engine uses StaticPool (one shared connection), so the
    PRAGMA set here also applies to the session the request handler opens.
    """
    await db_session.execute(text("PRAGMA foreign_keys=ON"))
    await db_session.commit()
    yield
    await db_session.execute(text("PRAGMA foreign_keys=OFF"))
    await db_session.commit()


async def _video(db, vid: str) -> Video:
    video = Video(
        id=vid,
        title="Behavior Test",
        source_url="https://example.com/v.mp4",
        video_source=VideoSource.imported,
        status=VideoStatus.ready,
        is_official=True,
        review_status="published",
    )
    db.add(video)
    await db.commit()
    return video


async def test_anonymous_single_event(client):
    resp = await client.post(
        "/api/v1/behavior/events",
        json={"event_type": "video_click", "video_id": None, "event_payload": {"source": "home"}},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ingested": 1}

    async with _session_maker()() as db:
        row = (await db.execute(select(BehaviorEvent))).scalars().first()
        assert row is not None
        assert row.user_id is None  # anonymous events keep user_id NULL
        assert row.event_type == "video_click"
        assert row.event_payload == {"source": "home"}


async def test_authenticated_event_has_user_id(client, auth_headers):
    resp = await client.post(
        "/api/v1/behavior/events",
        headers=auth_headers,
        json={"event_type": "video_click", "video_id": None},
    )
    assert resp.status_code == 200, resp.text

    async with _session_maker()() as db:
        row = (await db.execute(select(BehaviorEvent))).scalars().first()
        assert row is not None and row.user_id is not None


async def test_batch_ingest(client, auth_headers):
    events = [{"event_type": f"type_{i}", "event_payload": {"i": i}} for i in range(3)]
    resp = await client.post(
        "/api/v1/behavior/events/batch",
        headers=auth_headers,
        json={"events": events},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ingested": 3}

    async with _session_maker()() as db:
        rows = (await db.execute(select(BehaviorEvent))).scalars().all()
        assert len(rows) == 3
        assert {r.event_type for r in rows} == {"type_0", "type_1", "type_2"}


async def test_watch_time_mirrors_learning_record(client, auth_headers, db_session):
    from datetime import UTC, datetime

    from app.models.user import User

    vid = "00000000-0000-4000-8000-000000000001"
    await _video(db_session, vid)
    # The side-effect requires a logged-in user matching the record owner.
    user = (await db_session.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
    record = LearningRecord(
        user_id=user.id,
        video_id=vid,
        time_spent_seconds=0,
        last_accessed_at=datetime.now(UTC),
    )
    db_session.add(record)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/behavior/events",
        headers=auth_headers,
        json={"event_type": "watch_time", "video_id": vid, "event_payload": {"delta_s": 42}},
    )
    assert resp.status_code == 200, resp.text

    async with _session_maker()() as db:
        row = (await db.execute(select(LearningRecord).where(LearningRecord.user_id == user.id))).scalars().first()
        assert row is not None
        assert row.time_spent_seconds == 42


async def test_complete_mirrors_view_count_and_learning_event(client, auth_headers, db_session):
    from datetime import UTC, datetime

    from app.models.user import User

    vid = "00000000-0000-4000-8000-000000000002"
    video = await _video(db_session, vid)
    assert video.view_count == 0
    # Both side-effects (view_count + the completed_video learning event) only
    # fire for a user who actually had the video open — the LearningRecord is
    # created by video_service on first open.
    user = (await db_session.execute(select(User).where(User.phone == "13800138000"))).scalar_one()
    db_session.add(
        LearningRecord(user_id=user.id, video_id=vid, time_spent_seconds=0, last_accessed_at=datetime.now(UTC))
    )
    await db_session.commit()

    resp = await client.post(
        "/api/v1/behavior/events",
        headers=auth_headers,
        json={"event_type": "complete", "video_id": vid, "event_payload": {}},
    )
    assert resp.status_code == 200, resp.text

    async with _session_maker()() as db:
        video_row = (await db.execute(select(Video).where(Video.id == vid))).scalars().first()
        assert video_row is not None and video_row.view_count == 1
        # The completed-video LearningEvent (ADR-0012) must be emitted.
        ev = (await db.execute(select(LearningEvent))).scalars().first()
        assert ev is not None
        assert ev.event_type == "completed_video"
        assert ev.video_id == vid


async def test_complete_without_learning_record_does_not_inflate_view_count(client, auth_headers, db_session):
    """A `complete` event only counts when the user actually had the video open.

    Without a LearningRecord (nothing was ever opened) the event must stay a
    raw analytics row and leave view_count alone — otherwise any logged-in
    user can inflate a video's counter by POSTing a bare complete event.
    """
    from datetime import UTC, datetime

    from app.models.user import User

    vid = "00000000-0000-4000-8000-000000000003"
    await _video(db_session, vid)
    user = (await db_session.execute(select(User).where(User.phone == "13800138000"))).scalar_one()

    resp = await client.post(
        "/api/v1/behavior/events",
        headers=auth_headers,
        json={"event_type": "complete", "video_id": vid, "event_payload": {}},
    )
    assert resp.status_code == 200, resp.text

    async with _session_maker()() as db:
        video_row = (await db.execute(select(Video).where(Video.id == vid))).scalars().first()
        assert video_row is not None
        assert video_row.view_count == 0  # never opened -> not a play-completion

    db_session.add(
        LearningRecord(user_id=user.id, video_id=vid, time_spent_seconds=0, last_accessed_at=datetime.now(UTC))
    )
    await db_session.commit()

    resp = await client.post(
        "/api/v1/behavior/events",
        headers=auth_headers,
        json={"event_type": "complete", "video_id": vid, "event_payload": {}},
    )
    assert resp.status_code == 200, resp.text

    async with _session_maker()() as db:
        video_row = (await db.execute(select(Video).where(Video.id == vid))).scalars().first()
        assert video_row is not None and video_row.view_count == 1


async def test_complete_without_learning_record_emits_no_learning_event(client, auth_headers, db_session):
    """No open-video marker -> no completed_video learning event either.

    Same gate as view_count: otherwise a bare `complete` event manufactures an
    ADR-0012 event for a video the user never opened, and with it the daily
    minutes counter, streak and milestone awards `emit_event` drives.
    """
    vid = "00000000-0000-4000-8000-000000000005"
    await _video(db_session, vid)

    resp = await client.post(
        "/api/v1/behavior/events",
        headers=auth_headers,
        json={"event_type": "complete", "video_id": vid, "event_payload": {}},
    )
    assert resp.status_code == 200, resp.text

    async with _session_maker()() as db:
        assert (await db.execute(select(LearningEvent))).scalars().first() is None


async def test_single_event_with_unknown_video_id_is_stored_with_null(client, auth_headers, fk_enforced):
    """A dangling video_id must degrade to NULL, not fail the insert."""
    resp = await client.post(
        "/api/v1/behavior/events",
        headers=auth_headers,
        json={"event_type": "complete", "video_id": _BOGUS_VIDEO_ID, "event_payload": {}},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ingested": 1}

    async with _session_maker()() as db:
        row = (await db.execute(select(BehaviorEvent))).scalars().first()
        assert row is not None
        assert row.event_type == "complete"
        assert row.video_id is None


async def test_batch_drops_only_unknown_video_ids(client, auth_headers, db_session, fk_enforced):
    """One bogus video_id must not cost the whole flush — only that id is dropped."""
    vid = "00000000-0000-4000-8000-000000000004"
    await _video(db_session, vid)

    events = [
        {"event_type": "watch_time", "video_id": vid, "event_payload": {"delta_s": 5}},
        {"event_type": "complete", "video_id": _BOGUS_VIDEO_ID, "event_payload": {}},
        {"event_type": "pause", "video_id": None, "event_payload": {}},
    ]
    resp = await client.post(
        "/api/v1/behavior/events/batch",
        headers=auth_headers,
        json={"events": events},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ingested": 3}

    async with _session_maker()() as db:
        rows = (await db.execute(select(BehaviorEvent))).scalars().all()
        assert len(rows) == 3
        by_type = {r.event_type: r for r in rows}
        assert by_type["watch_time"].video_id == vid  # known id survives
        assert by_type["pause"].video_id is None
        assert by_type["complete"].video_id is None  # bogus id dropped
