"""add videos.quality_flag

Revision ID: i8j9k0l1m2n3
Revises: h7i8j9k0l1m2
Create Date: 2026-07-30 00:02:00.000000

Translation quality flag (阶段 2 of PIPELINE-QUALITY-IMPROVEMENTS-2026-07).
Set by ``finalize_video`` after the translation quality gate:
- NULL: passed (coverage >= warn threshold)
- ``quality_warning``: coverage between block and warn (video still ready)
- ``quality_blocked``: coverage below block (video error, admin re-translates)

Plain string (not a DB enum) so it backfills cleanly across SQLite/test and
Postgres/prod, mirroring ``review_status``.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "i8j9k0l1m2n3"
down_revision: str | None = "h7i8j9k0l1m2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "quality_flag" not in videos_cols:
        op.add_column("videos", sa.Column("quality_flag", sa.String(length=20), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "quality_flag" in videos_cols:
        op.drop_column("videos", "quality_flag")
