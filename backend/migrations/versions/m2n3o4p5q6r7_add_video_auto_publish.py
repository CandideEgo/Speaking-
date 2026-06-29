"""add video auto_publish

Revision ID: m2n3o4p5q6r7
Revises: l0m1n2o3p4q5
Create Date: 2026-06-29 04:10:00.000000

Adds ``auto_publish`` boolean column to ``videos`` for the one-click admin
seed flow: when set, ``finalize_video`` auto-publishes the video (sets
``is_published=True``) at the ready step instead of waiting for a manual
PATCH. Defaults to ``false`` so the existing review-then-publish flow is
unchanged.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "m2n3o4p5q6r7"
down_revision: str | None = "l0m1n2o3p4q5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("auto_publish", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("videos", "auto_publish")
