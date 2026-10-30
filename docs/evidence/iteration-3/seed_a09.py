"""Seed a throwaway Postgres with representative rows for the A09 drill.

Run with the backend venv and DATABASE_URL pointing at the isolated database
(after `alembic upgrade head`):

    PYTHONUTF8=1 DATABASE_URL=postgresql+asyncpg://seeword:seeword_dev@localhost:15433/seeword \
        .venv/Scripts/python.exe ../docs/evidence/iteration-3/seed_a09.py
"""

import asyncio

from app.core.database import get_async_session_maker
from app.models.exam_test import ExamPaper, ExamQuestion
from app.models.learning import LearningRecord, Vocabulary
from app.models.subtitle import Subtitle
from app.models.user import PlanType, RoleType, User
from app.models.video import Video, VideoSource, VideoStatus


async def main() -> None:
    async with get_async_session_maker()() as db:
        users = [
            User(phone=f"1390000000{i}", hashed_password="hashed", name=f"seed{i}", plan=PlanType.free, role=RoleType.user)
            for i in range(2)
        ]
        db.add_all(users)
        await db.flush()

        videos = [
            Video(
                title=f"seed video {i}",
                source_url=f"https://example.com/seed-{i}.mp4",
                video_source=VideoSource.imported,
                status=VideoStatus.ready,
            )
            for i in range(2)
        ]
        db.add_all(videos)
        await db.flush()

        for i, video in enumerate(videos):
            for j, start in enumerate((0.0, 3.0, 6.0)):
                db.add(
                    Subtitle(
                        video_id=video.id,
                        start_time=start,
                        end_time=start + 2.5,
                        text_en=f"Seed subtitle {i}-{j}.",
                        text_zh=f"种子字幕 {i}-{j}。",
                        sentence_index=j,
                    )
                )
            db.add(Vocabulary(user_id=users[0].id, word=f"seedword{i}", translation="种子词", video_id=video.id))
            db.add(
                LearningRecord(
                    user_id=users[0].id,
                    video_id=video.id,
                    progress_percentage=50.0,
                    time_spent_seconds=120,
                )
            )

        paper = ExamPaper(
            level="cet4",
            year=2024,
            month=6,
            set_no=1,
            title="seed paper",
            source="a09-drill",
            total_questions=2,
        )
        db.add(paper)
        await db.flush()
        for number in (1, 2):
            db.add(
                ExamQuestion(
                    paper_id=paper.id,
                    section="reading_C",
                    number=number,
                    question_type="reading",
                    passage="Seed passage.",
                    question=f"Question {number}",
                    options={"A": "alpha", "B": "beta"},
                    answer="A",
                )
            )

        await db.commit()
    print("seeded: 2 users, 2 videos, 6 subtitles, 2 vocabulary, 2 learning_records, 1 paper, 2 questions")


if __name__ == "__main__":
    asyncio.run(main())
