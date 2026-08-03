"""add exam_sessions and exam_answers tables

Revision ID: b1c2d3e4f5a6
Revises: a9b0c1d2e3f4
Create Date: 2026-08-04 00:00:00.000000

Exam system (prototype-driven full-stack refactor, Phase B). exam_sessions
records one exam attempt (daily_check | video_exam | wrong_redo) with its
final score; exam_answers stores the per-question snapshot + user answer so
grading stays server-side and the wrong book is a derived query (correct=false
rows without a later correct wrong_redo answer) instead of a separate table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "a9b0c1d2e3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "exam_sessions" not in existing_tables:
        op.create_table(
            "exam_sessions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("mode", sa.String(length=20), nullable=False),
            sa.Column("exam_level", sa.String(length=20), nullable=True),
            sa.Column(
                "video_id",
                sa.String(length=36),
                sa.ForeignKey("videos.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("question_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "started_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("score", sa.Float(), nullable=True),
            sa.Column("part_scores", sa.JSON(), nullable=True),
        )
        op.create_index("ix_exam_sessions_user_id", "exam_sessions", ["user_id"])
        op.create_index("ix_exam_sessions_mode", "exam_sessions", ["mode"])
        op.create_index("ix_exam_sessions_video_id", "exam_sessions", ["video_id"])

    if "exam_answers" not in existing_tables:
        op.create_table(
            "exam_answers",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "session_id",
                sa.String(length=36),
                sa.ForeignKey("exam_sessions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("question", sa.JSON(), nullable=False),
            sa.Column("user_answer", sa.Text(), nullable=True),
            sa.Column("correct", sa.Boolean(), nullable=True),
            sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_exam_answers_session_id", "exam_answers", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_exam_answers_session_id", table_name="exam_answers")
    op.drop_table("exam_answers")
    op.drop_index("ix_exam_sessions_video_id", table_name="exam_sessions")
    op.drop_index("ix_exam_sessions_mode", table_name="exam_sessions")
    op.drop_index("ix_exam_sessions_user_id", table_name="exam_sessions")
    op.drop_table("exam_sessions")
