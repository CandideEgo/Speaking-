"""add video_quality_reports table

Revision ID: f5g6h7i8j9k0
Revises: e3f4g5h6i7j8
Create Date: 2026-07-30 00:00:00.000000

Persisted quality metrics for the video pipeline (改进 2 / 阶段 0 of
PIPELINE-QUALITY-IMPROVEMENTS-2026-07).

Each transcription / translation quality check writes one append-only row so the
admin panel can show quality flags, triage low-coverage videos, and see quality
trends across re-runs. Previously these metrics only went to structlog and were
unqueryable.

- ``stage``: "transcription" | "translation" (plain string; not a DB enum so
  migrations backfill cleanly across SQLite/test and Postgres/prod).
- ``metrics``: full breakdown (coverage/short/mixed/length for translation;
  per-check pass+detail for transcription).
- ``issues``: human-readable issue strings (empty when passed).
- ``coverage_ratio`` / ``segment_count``: denormalized for cheap filtering
  (e.g. "low_coverage < 0.9" admin query) without unpacking the JSON column.

Rows are append-only: a re-trigger leaves a new row rather than mutating the
old one, so history is preserved and resume logic stays simple.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "f5g6h7i8j9k0"
down_revision: str | None = "e3f4g5h6i7j8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "video_quality_reports",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "video_id",
            sa.String(length=36),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(length=20), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("coverage_ratio", sa.Float(), nullable=True),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("issues", sa.JSON(), nullable=False),
        sa.Column("segment_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_video_quality_reports_video_id", "video_quality_reports", ["video_id"])
    op.create_index("ix_vqr_video_stage", "video_quality_reports", ["video_id", "stage"])


def downgrade() -> None:
    op.drop_index("ix_vqr_video_stage", table_name="video_quality_reports")
    op.drop_index("ix_video_quality_reports_video_id", table_name="video_quality_reports")
    op.drop_table("video_quality_reports")
