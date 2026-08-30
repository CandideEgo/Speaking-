"""Auto-channels: is_auto flag + unique upstream id (ADR-0014 rev. 2026-08-30)

Full author pages: ingest now auto-creates a channel for any scraped upstream
channel id. ``is_auto`` separates admin-curated channels from auto-created
ones, and the unique index on ``upstream_channel_id`` prevents concurrent
ingests from double-creating a channel for the same author. Existing
duplicates are merged (videos re-pointed to the first channel per upstream id)
before the index is made unique.

Revision ID: e0f1g2h3i4j5
Revises: d9e0f1g2h3i4
Create Date: 2026-08-30 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "e0f1g2h3i4j5"
down_revision: str | None = "d9e0f1g2h3i4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Merge duplicate channels sharing an upstream id: re-point member videos
    # to the keeper (smallest id per upstream id), then drop the duplicates.
    # Correlated-subquery form - runs on both PostgreSQL and SQLite.
    op.execute(
        """
        UPDATE videos SET channel_ref = (
            SELECT MIN(c2.id) FROM channels c2
            WHERE c2.upstream_channel_id = (
                SELECT c1.upstream_channel_id FROM channels c1
                WHERE c1.id = videos.channel_ref
            )
        )
        WHERE channel_ref IS NOT NULL
          AND channel_ref IN (SELECT c1.id FROM channels c1 WHERE c1.upstream_channel_id IS NOT NULL)
          AND channel_ref NOT IN (
              SELECT MIN(c2.id) FROM channels c2
              WHERE c2.upstream_channel_id IS NOT NULL
              GROUP BY c2.upstream_channel_id
          )
        """
    )
    op.execute(
        """
        DELETE FROM channels WHERE id IN (
            SELECT c1.id FROM channels c1
            WHERE c1.upstream_channel_id IS NOT NULL
              AND c1.id != (
                  SELECT MIN(c2.id) FROM channels c2
                  WHERE c2.upstream_channel_id = c1.upstream_channel_id
              )
        )
        """
    )
    op.drop_index("ix_channels_upstream_channel_id", table_name="channels")
    op.create_index("ix_channels_upstream_channel_id", "channels", ["upstream_channel_id"], unique=True)

    op.add_column(
        "channels",
        sa.Column("is_auto", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("channels", "is_auto")
    op.drop_index("ix_channels_upstream_channel_id", table_name="channels")
    op.create_index("ix_channels_upstream_channel_id", "channels", ["upstream_channel_id"], unique=False)
