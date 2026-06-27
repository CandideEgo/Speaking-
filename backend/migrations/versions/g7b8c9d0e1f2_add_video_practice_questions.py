"""add video_practice_questions

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-25 14:00:00.000000

Adds the ``video_practice_questions`` table: AI-generated practice questions
(content Q&A + word fill-in-the-blank) cached per (video, exam_level) for the
CET/高考/考研 practice mode.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "g7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "video_practice_questions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("exam_level", sa.String(length=20), nullable=False),
        sa.Column("questions", sa.JSON(), nullable=False),
        sa.Column("question_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("video_id", "exam_level", name="uq_video_practice_video_level"),
    )
    op.create_index("ix_video_practice_questions_video_id", "video_practice_questions", ["video_id"])


def downgrade() -> None:
    op.drop_index("ix_video_practice_questions_video_id", table_name="video_practice_questions")
    op.drop_table("video_practice_questions")
