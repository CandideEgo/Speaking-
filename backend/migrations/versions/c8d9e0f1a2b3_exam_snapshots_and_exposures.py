"""Freeze exams at creation and retain cross-session answer exposure facts.

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: str | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("exam_sessions", sa.Column("snapshot_schema_version", sa.Integer(), nullable=True))
    op.add_column("exam_sessions", sa.Column("snapshot_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "user_question_exposures",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("question_key", sa.String(160), primary_key=True),
        sa.Column("max_hint_level", sa.Integer(), nullable=False),
        sa.Column("feedback_count", sa.Integer(), nullable=False),
        sa.Column("first_answer_available_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("origin", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "user_exposure_mapping_states",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("user_exposure_mapping_states")
    op.drop_table("user_question_exposures")
    op.drop_column("exam_sessions", "snapshot_completed_at")
    op.drop_column("exam_sessions", "snapshot_schema_version")
