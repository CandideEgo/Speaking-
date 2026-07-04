"""drop daily_activities table

Revision ID: c4d5e6f7a8b9
Revises: w4x5y6z7a8b9
Create Date: 2026-07-04 10:00:00.000000

Drops the ``daily_activities`` snapshot table. Its writers (the four
``record_*_activity`` recorders + ``update_streak`` in ``activity_service``)
became orphans when AI speaking scoring was removed (ADR-0002) and were deleted
along with the activity service in Phase 4 backlog B2 (Route A). With no
runtime code reading or writing the table, the frozen historical speaking
snapshots it held have no consumers — admin stats were rewired to query
``SpeakingAttempt`` / ``LearningRecord`` directly.

Downgrade reconstructs the table empty (historical snapshot data is not
restorable — it was derived, not original).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "w4x5y6z7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ix_daily_activities_date was added by q6r7s8t9u0v1_add_missing_indexes;
    # drop it explicitly so the downgrade can faithfully recreate it.
    op.drop_index("ix_daily_activities_date", table_name="daily_activities")
    op.drop_index(op.f("ix_daily_activities_user_id"), table_name="daily_activities")
    op.drop_table("daily_activities")


def downgrade() -> None:
    op.create_table(
        "daily_activities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("speaking_attempts", sa.Integer(), nullable=False),
        sa.Column("words_reviewed", sa.Integer(), nullable=False),
        sa.Column("words_added", sa.Integer(), nullable=False),
        sa.Column("videos_watched", sa.Integer(), nullable=False),
        sa.Column("quizzes_taken", sa.Integer(), nullable=False),
        sa.Column("avg_accuracy", sa.Float(), nullable=True),
        sa.Column("avg_fluency", sa.Float(), nullable=True),
        sa.Column("avg_completeness", sa.Float(), nullable=True),
        sa.Column("time_spent_seconds", sa.Integer(), nullable=False),
        sa.Column("goal_met", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_activity_user_date"),
    )
    op.create_index(op.f("ix_daily_activities_user_id"), "daily_activities", ["user_id"], unique=False)
    op.create_index("ix_daily_activities_date", "daily_activities", ["date"])
