"""Add videos.published_at (home rankings 「最新」 sort key).

Revision ID: g2h3i4j5k6l7
Revises: f1g2h3i4j5k6
Create Date: 2026-09-19 00:00:00.000000

Adds a nullable, indexed ``published_at`` column recording when a video was
first published. Written once by video_publish._publish_video (idempotent —
later re-reviews never move it). Existing rows are backfilled as
COALESCE(reviewed_at, created_at) so pre-column publishes keep a sensible
ordering. Powers the homepage latest ranking
(GET /api/v1/videos/rankings?scope=latest, NULLs last).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "g2h3i4j5k6l7"
down_revision: str | None = "f1g2h3i4j5k6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE videos SET published_at = COALESCE(reviewed_at, created_at)")
    op.create_index("ix_videos_published_at", "videos", ["published_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_videos_published_at", table_name="videos")
    op.drop_column("videos", "published_at")
