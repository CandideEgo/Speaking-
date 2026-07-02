"""add_subtitle_video_id_sentence_index_composite

Revision ID: f92a8f2617d9
Revises: b6c7d8e9f0a1
Create Date: 2026-07-02 03:11:19.849077
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "f92a8f2617d9"
down_revision: str | None = "b6c7d8e9f0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_subtitles_video_id_sentence_index",
        "subtitles",
        ["video_id", "sentence_index"],
    )


def downgrade() -> None:
    op.drop_index("ix_subtitles_video_id_sentence_index", table_name="subtitles")
