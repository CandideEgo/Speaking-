"""Persistent task conversations alongside existing recoverable runs.

Revision ID: 9f2c8a7d6b10
Revises: e0f1a2b3c4d5
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9f2c8a7d6b10"
down_revision: str | None = "e0f1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agent_runs", sa.Column("response_mode", sa.String(20), nullable=False, server_default="cards"))
    op.create_table(
        "teaching_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("session_id", sa.String(36), nullable=False),
        sa.Column("content_revision_id", sa.String(36), nullable=False),
        sa.Column("run_id", sa.String(36), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("session_revision", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("body", sa.JSON(), nullable=False),
        sa.Column("requires_reveal", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["teaching_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["content_revision_id"], ["exam_analysis_revisions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("session_id", "sequence", name="uq_teaching_message_sequence"),
        sa.UniqueConstraint("run_id", "role", name="uq_teaching_message_run_role"),
    )
    op.create_index("ix_teaching_messages_user_id", "teaching_messages", ["user_id"])
    op.create_index("ix_teaching_messages_session_id", "teaching_messages", ["session_id"])


def downgrade() -> None:
    op.drop_table("teaching_messages")
    op.drop_column("agent_runs", "response_mode")
