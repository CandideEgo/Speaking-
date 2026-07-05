"""add behavior_events table + videos.view_count

Revision ID: c5d6e7f8a9b0
Revises: f0a1b2c3d4e5
Create Date: 2026-07-06 12:00:00.000000

Creates ``behavior_events`` for the P0 behavior-collection pipeline (see
ADR-0011). Each row is one user interaction (click/play/pause/seek/complete/
watch_time). Adds ``videos.view_count`` (play-completion counter, distinct
from like_count) used by the scoring/recommendation system.

This also closes the LearningRecord write gap: behavior_service mirrors
time_spent_seconds / completed onto LearningRecord on ingest — previously
those two fields had no write path at all (position/progress go through the
existing /learning/progress endpoint, which the frontend now calls for
resume + periodic position saves).
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "c5d6e7f8a9b0"
down_revision: str | None = "f0a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "behavior_events" not in inspector.get_table_names():
        op.create_table(
            "behavior_events",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column(
                "user_id",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
                index=True,
            ),
            sa.Column(
                "video_id",
                sa.String(length=36),
                sa.ForeignKey("videos.id", ondelete="SET NULL"),
                nullable=True,
                index=True,
            ),
            sa.Column("event_type", sa.String(length=32), nullable=False),
            sa.Column("event_payload", sa.JSON(), nullable=True),
            sa.Column("session_id", sa.String(length=36), nullable=True),
            sa.Column("client_ts", sa.BigInteger(), nullable=True),
            sa.Column(
                "server_ts",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index(
            "ix_behavior_events_user_server",
            "behavior_events",
            ["user_id", "server_ts"],
        )
        op.create_index(
            "ix_behavior_events_video_type",
            "behavior_events",
            ["video_id", "event_type"],
        )

    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "view_count" not in videos_cols:
        op.add_column(
            "videos",
            sa.Column("view_count", sa.BigInteger(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    op.drop_column("videos", "view_count")
    op.drop_index("ix_behavior_events_video_type", table_name="behavior_events")
    op.drop_index("ix_behavior_events_user_server", table_name="behavior_events")
    op.drop_table("behavior_events")
