"""add video external metadata + speech metric columns

Revision ID: t2u3v4w5x6y7
Revises: s1e2t3t4i5n6
Create Date: 2026-08-04 00:00:00.000000

阶段 1 + 阶段 3 of the video feature-collection plan:

- External (YouTube) metadata captured by ``_extract_video_info`` at the
  pipeline's extracting step (backfilled by ``scripts/backfill_external_meta.py``).
  ``ext_view_count``/``ext_like_count`` are the YouTube-side counts, strictly
  separated from the in-app ``view_count`` completion counter.
- Subtitle-derived speech metrics (``wpm``/``vocabulary_density``) computed
  best-effort at the finalize tail by ``subtitle_metrics_service``.

All columns are nullable — purely additive.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "t2u3v4w5x6y7"
down_revision: str | None = "s1e2t3t4i5n6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_COLUMNS: list[tuple[str, sa.types.TypeEngine]] = [
    ("yt_video_id", sa.String(length=32)),
    ("channel_id", sa.String(length=64)),
    ("channel_name", sa.String(length=255)),
    ("upload_date", sa.DateTime(timezone=True)),
    ("ext_view_count", sa.BigInteger()),
    ("ext_like_count", sa.BigInteger()),
    ("external_meta", sa.JSON()),
    ("wpm", sa.Float()),
    ("vocabulary_density", sa.Float()),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("videos")}
    for name, col_type in _NEW_COLUMNS:
        if name not in existing:
            op.add_column("videos", sa.Column(name, col_type, nullable=True))

    index_names = {ix["name"] for ix in inspector.get_indexes("videos")}
    if "ix_videos_yt_video_id" not in index_names:
        op.create_index("ix_videos_yt_video_id", "videos", ["yt_video_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    index_names = {ix["name"] for ix in inspector.get_indexes("videos")}
    if "ix_videos_yt_video_id" in index_names:
        op.drop_index("ix_videos_yt_video_id", table_name="videos")

    existing = {c["name"] for c in inspector.get_columns("videos")}
    for name, _col_type in reversed(_NEW_COLUMNS):
        if name in existing:
            op.drop_column("videos", name)
