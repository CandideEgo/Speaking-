"""add video_scores.viral + freshness factor columns

Revision ID: u3v4w5x6y7z8
Revises: t2u3v4w5x6y7
Create Date: 2026-08-04 06:00:00.000000

阶段 2 of the video feature-collection plan: two external-signal factors join
the learning_score breakdown — ``viral`` (log-normalized ext_view_count vs
channel average) and ``freshness`` (views-per-day vs benchmark). Historical
rows get 0.0 (the factors didn't exist when they were computed).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "u3v4w5x6y7z8"
down_revision: str | None = "t2u3v4w5x6y7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("video_scores")}
    for name in ("viral", "freshness"):
        if name not in existing:
            op.add_column(
                "video_scores",
                sa.Column(name, sa.Float(), nullable=False, server_default="0.0"),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("video_scores")}
    for name in ("freshness", "viral"):
        if name in existing:
            op.drop_column("video_scores", name)
