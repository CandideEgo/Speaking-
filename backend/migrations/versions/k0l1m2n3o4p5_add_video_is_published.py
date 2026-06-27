"""add video is_published

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
Create Date: 2026-06-27 16:00:00.000000

Adds ``is_published`` boolean column to the ``videos`` table, separating the
"official" source attribution (``is_official``) from public visibility
(``is_published``). This lets official videos go through a draft → review →
publish flow before appearing on the homepage.

Defaults to ``false``; existing official videos are back-filled to published so
the homepage doesn't go empty on upgrade.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "k0l1m2n3o4p5"
down_revision: str | None = "j9k0l1m2n3o4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
    )
    # Back-fill: keep existing official videos visible. Without this the homepage
    # and browse feed would be empty after upgrade.
    op.execute("UPDATE videos SET is_published = is_official")


def downgrade() -> None:
    op.drop_column("videos", "is_published")
