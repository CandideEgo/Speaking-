"""add videos.step_started_at

Revision ID: h7i8j9k0l1m2
Revises: g6h7i8j9k0l1
Create Date: 2026-07-30 00:01:00.000000

Per-step watchdog timing (阶段 1 of PIPELINE-QUALITY-IMPROVEMENTS-2026-07).
``step_started_at`` is refreshed at each pipeline step boundary so the
watchdog can detect a single stuck step (translate/download/transcode) rather
than measuring from ``processing_started_at`` (which spans the whole pipeline,
including the GPU transcription gap, and forces an over-wide timeout). Cleared
on ready/error by finalize_video / commit_error_state.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "h7i8j9k0l1m2"
down_revision: str | None = "g6h7i8j9k0l1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "step_started_at" not in videos_cols:
        op.add_column("videos", sa.Column("step_started_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "step_started_at" in videos_cols:
        op.drop_column("videos", "step_started_at")
