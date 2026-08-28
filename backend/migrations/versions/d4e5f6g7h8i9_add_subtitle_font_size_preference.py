"""add user_preferences.subtitle_font_size

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-08-28 15:00:00.000000

D1 player controls: subtitle font-size preference (small/medium/large),
rendered by the watch page subtitle list. Speed/subtitle-mode persistence
lives client-side (localStorage) per 产品设计规划 §D1.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "d4e5f6g7h8i9"
down_revision: str | None = "c3d4e5f6g7h8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("subtitle_font_size", sa.String(10), nullable=False, server_default="medium"),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "subtitle_font_size")
