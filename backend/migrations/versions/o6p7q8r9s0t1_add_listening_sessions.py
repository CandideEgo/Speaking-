"""Add durable listening attempts; no existing rows or media are changed.

Revision ID: o6p7q8r9s0t1
Revises: n5o6p7q8r9s0
"""

import sqlalchemy as sa
from alembic import op

revision = "o6p7q8r9s0t1"
down_revision = "n5o6p7q8r9s0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "listening_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("video_id", sa.String(36), sa.ForeignKey("videos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("questions", sa.JSON(), nullable=False),
        sa.Column("answers", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=True),
        sa.Column("correct_count", sa.Integer(), nullable=True),
        sa.Column("current_index", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_listening_sessions_user_id", "listening_sessions", ["user_id"])
    op.create_index("ix_listening_sessions_video_id", "listening_sessions", ["video_id"])


def downgrade():
    op.drop_table("listening_sessions")
