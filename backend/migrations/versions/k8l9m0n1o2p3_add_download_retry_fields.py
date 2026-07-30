"""add videos.download_failed_at + download_fail_count

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2026-07-30 00:03:00.000000

Download retry tracking (阶段 3 of PIPELINE-QUALITY-IMPROVEMENTS-2026-07).
``retry_failed_downloads`` beat task re-attempts failed YouTube downloads for
ready videos that fell back to embed playback, up to ``download_retry_max_attempts``
times. ``download_failed_at`` marks the last failure; ``download_fail_count``
accumulates strikes so the beat task can stop retrying permanent failures
(region block / video removed).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "k8l9m0n1o2p3"
down_revision: str | None = "i8j9k0l1m2n3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "download_failed_at" not in videos_cols:
        op.add_column("videos", sa.Column("download_failed_at", sa.DateTime(timezone=True), nullable=True))
    if "download_fail_count" not in videos_cols:
        op.add_column(
            "videos",
            sa.Column("download_fail_count", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "download_fail_count" in videos_cols:
        op.drop_column("videos", "download_fail_count")
    if "download_failed_at" in videos_cols:
        op.drop_column("videos", "download_failed_at")
