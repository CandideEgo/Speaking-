"""add subtitle.words (word-level timestamps)

Revision ID: a1b2c3d4e5f6
Revises: c4d5e6f7a8b9
Create Date: 2026-07-05 14:00:00.000000

Adds ``subtitles.words`` (JSON): per-subtitle list of word tokens
``[{word, start, end}, ...]`` from WhisperX forced alignment. Populated at
ingest (transcription callback) so the subtitle editor split/merge and the
re-segmentation API can re-cut segments precisely without re-running
alignment on the audio. Null for legacy rows and the faster-whisper fallback.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Guard add_column with an inspector check — some DBs were stamped to head
    # without receiving physical columns (see d4e5f6g7h8i9 migration note).
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    subtitles_cols = {c["name"] for c in inspector.get_columns("subtitles")}
    if "words" not in subtitles_cols:
        op.add_column("subtitles", sa.Column("words", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("subtitles", "words")
