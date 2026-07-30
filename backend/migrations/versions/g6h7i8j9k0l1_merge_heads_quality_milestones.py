"""merge heads: video_quality_reports + milestones/mastery_snapshots

Revision ID: g6h7i8j9k0l1
Revises: f4g5h6i7j8k9, f5g6h7i8j9k0
Create Date: 2026-07-30 00:00:00.000000

Merge the two heads that diverged from ``e3f4g5h6i7j8``:
- ``f4g5h6i7j8k9``: user_milestones + mastery_snapshots (AI 学习计划)
- ``f5g6h7i8j9k0``: video_quality_reports (管线质量门持久化)

No schema changes - just joins the branches.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers
revision: str = "g6h7i8j9k0l1"
down_revision: str | Sequence[str] | None = ("f4g5h6i7j8k9", "f5g6h7i8j9k0")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
