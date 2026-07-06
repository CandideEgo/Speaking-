"""add video_scores table + videos.score / score_updated_at

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-07-06 15:00:00.000000

P1 learning_score (ADR-0011, LAUNCH-SPRINT-2026-07 阶段 4):
- ``video_scores``: one row per (re)compute of a video's 0-100 score, with the
  per-factor breakdown (ctr/retention/watch_time/topic_match/quality/bonus) so
  the score is auditable + explainable via the admin debug endpoint.
- ``videos.score`` / ``videos.score_updated_at``: denormalized current total +
  staleness stamp, so list_public_videos can sort by score without a join.

Scores are computed by scoring_service.compute_video_score and refreshed by the
scoring beat tasks (hourly Top200 + daily full). No backfill is performed —
existing videos get scored on the next beat tick; new videos are scored at the
end of finalize_video.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "d6e7f8a9b0c1"
down_revision: str | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.create_table(
        "video_scores",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "video_id",
            sa.String(length=36),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("total_score", sa.Float(), nullable=False),
        sa.Column("ctr", sa.Float(), nullable=False, server_default="0"),
        sa.Column("retention", sa.Float(), nullable=False, server_default="0"),
        sa.Column("watch_time", sa.Float(), nullable=False, server_default="0"),
        sa.Column("topic_match", sa.Float(), nullable=False, server_default="0"),
        sa.Column("quality", sa.Float(), nullable=False, server_default="0"),
        sa.Column("bonus", sa.Float(), nullable=False, server_default="0"),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_video_scores_video_computed", "video_scores", ["video_id", "computed_at"])

    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "score" not in videos_cols:
        op.add_column("videos", sa.Column("score", sa.Float(), nullable=True))
    if "score_updated_at" not in videos_cols:
        op.add_column("videos", sa.Column("score_updated_at", sa.DateTime(timezone=True), nullable=True))
    # Index videos.score for the list_public_videos ORDER BY score DESC.
    if "ix_videos_score" not in {i["name"] for i in inspector.get_indexes("videos")}:
        op.create_index("ix_videos_score", "videos", ["score"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "ix_videos_score" in {i["name"] for i in inspector.get_indexes("videos")}:
        op.drop_index("ix_videos_score", table_name="videos")
    videos_cols = {c["name"] for c in inspector.get_columns("videos")}
    if "score_updated_at" in videos_cols:
        op.drop_column("videos", "score_updated_at")
    if "score" in videos_cols:
        op.drop_column("videos", "score")

    op.drop_index("ix_video_scores_video_computed", table_name="video_scores")
    op.drop_table("video_scores")
