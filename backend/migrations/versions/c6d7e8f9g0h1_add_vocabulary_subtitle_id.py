"""add vocabulary.subtitle_id for Phase 1 D3b drill back-to-context

B0 of the Phase 1 plan (产品设计规划-2026-08 §4):
- vocabulary.subtitle_id  — nullable FK to subtitles; the drill "回看原句"
  feature (D3b) needs to know the exact subtitle that produced a word.
  Old words stay NULL → no source shown (matches PRD "无来源不显示").

Note: vocabulary_reminder_time and streak_warning_enabled are stored
inside user_preferences.notification_preferences JSON (see app.models.
preferences.DEFAULT_NOTIFICATION_PREFS) — no new column needed.

Revision ID: c6d7e8f9g0h1
Revises: q7r8s9t0u1v2
Create Date: 2026-08-29 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "c6d7e8f9g0h1"
down_revision: str | None = "q7r8s9t0u1v2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # vocabulary.subtitle_id: nullable, ondelete SET NULL so deleting a
    # subtitle does not cascade-delete the user's word history.
    op.add_column(
        "vocabulary",
        sa.Column(
            "subtitle_id",
            sa.String(36),
            sa.ForeignKey("subtitles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_vocabulary_subtitle_id", "vocabulary", ["subtitle_id"])


def downgrade() -> None:
    op.drop_index("ix_vocabulary_subtitle_id", table_name="vocabulary")
    op.drop_column("vocabulary", "subtitle_id")
