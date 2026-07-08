"""Remove email auth, drop password_reset_tokens table.

- Drop table ``password_reset_tokens`` (email-based password reset, replaced by
  SMS reset-password flow).
- Drop index ``uq_users_email_partial`` on users.
- Drop column ``users.email_verified_at`` (email verification no longer exists).
- Drop column ``users.email`` (phone is now the sole identity).

Revision ID: a1b2c3d4e5f6
Revises: 3909bc9d97cd
Create Date: 2026-07-08 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "3909bc9d97cd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("password_reset_tokens")
    op.drop_index("uq_users_email_partial", table_name="users")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "email")


def downgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "uq_users_email_partial",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )
    # Recreate password_reset_tokens table (simplified — columns only, no FK
    # details needed for dev rollback).
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("token_lookup", sa.String(64), nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
