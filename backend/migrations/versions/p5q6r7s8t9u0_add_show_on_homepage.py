"""add show_on_homepage to videos

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
Create Date: 2026-07-01 00:01:00.000000

Adds ``show_on_homepage`` (Boolean, default False) to ``videos``.
This field controls whether a video appears on the homepage, independent
of ``is_featured`` (which is auto-set when like/favorite counts reach
the threshold). Admins manually curate which featured videos appear on
the homepage by toggling this field.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "p5q6r7s8t9u0"
down_revision: str | None = "o4p5q6r7s8t9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("show_on_homepage", sa.Boolean(), nullable=False, server_default="false"))
    # Backfill: existing official+published videos should show on homepage
    op.execute("UPDATE videos SET show_on_homepage = true WHERE is_official = true AND is_published = true")


def downgrade() -> None:
    op.drop_column("videos", "show_on_homepage")
