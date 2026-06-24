"""add is_featured and admin_notes to videos

Revision ID: c3d4e5f6g7h8
Revises: b2d3f4g5h6i7
Create Date: 2026-06-24 12:00:00.000000

Adds ``is_featured`` (admin-curated highlight, default false) and
``admin_notes`` (freeform admin-only annotation) to the ``videos`` table to
support the admin video content-management panel.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "c3d4e5f6g7h8"
down_revision: Union[str, None] = "b2d3f4g5h6i7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("videos", sa.Column("admin_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("videos", "admin_notes")
    op.drop_column("videos", "is_featured")
