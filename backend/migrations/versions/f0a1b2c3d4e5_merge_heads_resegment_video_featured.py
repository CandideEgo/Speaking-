"""merge divergent heads resegment_snapshots + video_featured

Revision ID: f0a1b2c3d4e5
Revises: b2c3d4e5f6g7, c3d4e5f6g7h8
Create Date: 2026-07-06 11:00:00.000000

Merges the two heads that diverged after the phone-login merge:
``b2c3d4e5f6g7`` (add_subtitle_resegment_snapshots) and
``c3d4e5f6g7h8`` (add_video_featured_admin_notes). Empty upgrade — this only
re-joins the branches so the behavior_events migration can build on a single
head.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "f0a1b2c3d4e5"
down_revision: str | None = ("b2c3d4e5f6g7", "c3d4e5f6g7h8")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
