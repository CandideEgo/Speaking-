"""add comment_quality_score to videos

Revision ID: a1c2e3f4g5h6
Revises: 80e681bd554d
Create Date: 2026-06-24 10:00:00.000000

The comment-analysis pipeline (app.services.comment_service.analyze) writes
``video.comment_quality_score`` and the comments ``/top-videos`` endpoint
orders by it, but the column was never defined on the Video model or in the
initial migration. This adds the missing nullable Float column.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a1c2e3f4g5h6"
down_revision: str | None = "80e681bd554d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("comment_quality_score", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("videos", "comment_quality_score")
