"""Practice questions generated from a video's subtitles, one set per exam level.

The CET/高考/考研 practice mode generates a mix of content-Q&A and word
fill-in-the-blank questions from the full subtitle transcript. A separate set
is generated per exam level (cet4/cet6/...) so the user drills the words
matching their target. Filled-in-blank gaps use words of the target level,
closing the "practice = review vocab" loop.

Generated on demand (first GET) and cached in this table; the unique
(video_id, exam_level) constraint dedupes regeneration.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VideoPracticeQuestion(Base):
    __tablename__ = "video_practice_questions"
    __table_args__ = (UniqueConstraint("video_id", "exam_level", name="uq_video_practice_video_level"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Canonical exam level key (see app.core.exam_levels), e.g. "cet4".
    exam_level: Mapped[str] = mapped_column(String(20), nullable=False)
    # list of {type: "qa"|"fill_blank", question, answer, options?, source_subtitle_ids[], cet_words[]}
    questions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    video = relationship("Video", back_populates="practice_questions")
