"""widen word_ai_notes.context_source

Revision ID: l0m1n2o3p4q5
Revises: k0l1m2n3o4p5
Create Date: 2026-06-27 22:05:00.000000

Widens ``word_ai_notes.context_source`` from varchar(40) to varchar(50).

The ``prewarm_notes`` pipeline step writes ``f"video:{video.id}"`` (= "video:"
+ a 36-char UUID = 42 chars) into this column, but varchar(40) truncated it
with ``StringDataRightTruncationError``, aborting the transaction and crashing
``finalize_video`` so no video could ever reach ``ready``. 50 chars fits the
42-char value with headroom. The model docstring already documented
``video:{id}`` as a legal value — the column width was the bug.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "l0m1n2o3p4q5"
down_revision: str | None = "k0l1m2n3o4p5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "word_ai_notes",
        "context_source",
        existing_type=sa.String(length=40),
        type_=sa.String(length=50),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "word_ai_notes",
        "context_source",
        existing_type=sa.String(length=50),
        type_=sa.String(length=40),
        existing_nullable=False,
    )
