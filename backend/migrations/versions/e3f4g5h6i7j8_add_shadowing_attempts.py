"""Add shadowing_attempts table and profile shadowing counter

New table for lightweight sentence read-along (shadowing) recordings:
  shadowing_attempts — one row per user recording attempt per subtitle sentence

Also adds total_shadowing_count to user_learning_profiles for cumulative
tracking in the learning loop north-star metric.

Revision ID: e3f4g5h6i7j8
Revises: d2e3f4g5h6i7
Create Date: 2026-07-25 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "e3f4g5h6i7j8"
down_revision: str | None = "d2e3f4g5h6i7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shadowing_attempts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "video_id",
            sa.String(length=36),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "subtitle_id",
            sa.String(length=36),
            sa.ForeignKey("subtitles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("audio_url", sa.String(length=2000), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("is_satisfied", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
    )

    op.add_column(
        "user_learning_profiles",
        sa.Column("total_shadowing_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("user_learning_profiles", "total_shadowing_count")
    op.drop_table("shadowing_attempts")
