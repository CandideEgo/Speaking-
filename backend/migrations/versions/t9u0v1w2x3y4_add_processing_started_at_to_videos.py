"""add processing_started_at to videos

Revision ID: t9u0v1w2x3y4
Revises: s8t9u0v1w2x3
Create Date: 2026-07-02 20:00:00.000000

Adds a nullable ``processing_started_at`` column to the videos table.
This records when processing actually started (set by start_processing or
seed_video), which is more accurate than ``created_at`` for the watchdog
that detects stale transcriptions — because admin may delay triggering
start_processing, making created_at far earlier than the actual enqueue time.
"""

import sqlalchemy as sa
from alembic import op

revision = "t9u0v1w2x3y4"
down_revision = "s8t9u0v1w2x3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("videos", "processing_started_at")
