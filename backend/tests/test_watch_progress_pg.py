"""Real PostgreSQL insert-race coverage. Run only against a disposable test DB."""

import asyncio
import uuid

import pytest
from sqlalchemy import event, func, select

from app.core.database import get_async_session_maker
from app.models.learning import LearningRecord
from app.models.user import User
from app.models.video import Video, VideoSource, VideoStatus
from app.services.watch_progress_service import save_position

pytestmark = pytest.mark.integration


async def test_first_save_losing_unique_insert_still_applies_its_position():
    maker = get_async_session_maker()
    async with maker() as setup:
        user = User(phone="139" + str(uuid.uuid4().int)[:8], name="Watch race", hashed_password="test")
        video = Video(
            title="Watch race",
            source_url="https://example.com/race.mp4",
            is_official=True,
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            duration=100,
        )
        setup.add_all([user, video])
        await setup.commit()
        uid, vid = user.id, video.id

    async with maker() as winner, maker() as loser:
        # Hold an uncommitted first insert. The other transaction sees no row,
        # then loses its INSERT to the unique constraint after we commit.
        winner.add(LearningRecord(user_id=uid, video_id=vid, position_seconds=5))
        await winner.flush()
        reached_insert = asyncio.Event()
        connection = await loser.connection()

        def before_insert(conn, cursor, statement, parameters, context, executemany):
            if statement.lstrip().startswith("INSERT INTO learning_records"):
                reached_insert.set()

        event.listen(connection.sync_connection, "before_cursor_execute", before_insert)
        task = asyncio.create_task(save_position(loser, uid, vid, 70))
        try:
            await asyncio.wait_for(reached_insert.wait(), 5)
            await winner.commit()
            record = await asyncio.wait_for(task, 5)
            assert record.position_seconds == 70
            assert record.progress_percentage == 70
            assert not record.completed
        finally:
            if not task.done():
                task.cancel()
            event.remove(connection.sync_connection, "before_cursor_execute", before_insert)

    async with maker() as check:
        records = (await check.execute(select(LearningRecord).where(LearningRecord.user_id == uid))).scalars().all()
        assert len(records) == 1
        assert records[0].position_seconds == 70


async def test_many_first_saves_have_one_record_and_consistent_percentage():
    maker = get_async_session_maker()
    async with maker() as setup:
        user = User(phone="139" + str(uuid.uuid4().int)[:8], name="Parallel watch", hashed_password="test")
        video = Video(
            title="Parallel watch",
            source_url="https://example.com/parallel.mp4",
            is_official=True,
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            duration=100,
        )
        setup.add_all([user, video])
        await setup.commit()
        uid, vid = user.id, video.id

    async def write(position):
        async with maker() as db:
            await save_position(db, uid, vid, position)

    await asyncio.gather(*(write(position) for position in [10, 20, 30, 40]))
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(LearningRecord)) == 1
        record = (await db.execute(select(LearningRecord))).scalar_one()
        assert record.position_seconds in [10, 20, 30, 40]
        assert record.progress_percentage == record.position_seconds
