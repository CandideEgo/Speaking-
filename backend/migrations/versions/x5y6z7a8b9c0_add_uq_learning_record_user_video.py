"""Add unique constraint on learning_records(user_id, video_id)

The model already declared UniqueConstraint("user_id", "video_id",
name="uq_learning_record_user_video") but the constraint was never
present in the database.  Without it, concurrent requests could insert
duplicate rows, causing scalar_one_or_none() to raise
MultipleResultsFound and return HTTP 500 on the video detail endpoint.

Revision ID: x5y6z7a8b9c0
Revises: w4x5y6z7a8b9
Create Date: 2026-07-07
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "x5y6z7a8b9c0"
down_revision = "w4x5y6z7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Deduplicate first — keep the earliest row per (user_id, video_id).
    op.execute(
        """
        DELETE FROM learning_records
        WHERE ctid IN (
            SELECT ctid FROM (
                SELECT ctid,
                       ROW_NUMBER() OVER (
                           PARTITION BY user_id, video_id
                           ORDER BY created_at ASC
                       ) AS rn
                FROM learning_records
            ) t
            WHERE rn > 1
        )
        """
    )
    # Idempotent: skip if constraint already exists (e.g. applied manually
    # on the server before this migration ran).
    from sqlalchemy import inspect

    bind = op.get_bind()
    constraints = inspect(bind).get_unique_constraints("learning_records")
    names = {c["name"] for c in constraints}
    if "uq_learning_record_user_video" not in names:
        op.create_unique_constraint(
            "uq_learning_record_user_video",
            "learning_records",
            ["user_id", "video_id"],
        )


def downgrade() -> None:
    op.drop_constraint(
        "uq_learning_record_user_video",
        "learning_records",
        type_="unique",
    )
