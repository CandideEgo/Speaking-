"""add feedbacks table

Revision ID: a9b0c1d2e3f4
Revises: k8l9m0n1o2p3
Create Date: 2026-08-03 00:00:00.000000

Stage 4 (POST-FRONTEND-2026-08) feedback/announcement system. The feedbacks
table stores user-submitted feedback (suggestion/bug/other) with an admin
workflow (open -> in_progress -> resolved) and an admin reply. Announcements
reuse the existing notifications table (type='announcement'), so no migration
is needed for them - only the NotificationType enum gains a member (pure code,
the DB column is already a plain string).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a9b0c1d2e3f4"
down_revision: str | None = "k8l9m0n1o2p3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "feedbacks" not in existing_tables:
        op.create_table(
            "feedbacks",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("category", sa.String(length=20), nullable=False, server_default="suggestion"),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("contact", sa.String(length=200), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
            sa.Column("admin_reply", sa.Text(), nullable=True),
            sa.Column(
                "handled_by",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index("ix_feedbacks_user_id", "feedbacks", ["user_id"])
        op.create_index("ix_feedbacks_status_created", "feedbacks", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_feedbacks_status_created", table_name="feedbacks")
    op.drop_index("ix_feedbacks_user_id", table_name="feedbacks")
    op.drop_table("feedbacks")
