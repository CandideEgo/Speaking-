"""add_phone_login

Revision ID: a9c1d2e3f4b5
Revises: 87140393fa0e
Create Date: 2026-07-02 05:40:00.000000

Adds a nullable ``phone`` column to ``users`` and loosens ``email`` /
``hashed_password`` to nullable so phone-only (SMS) accounts can exist. The
plain unique index on ``email`` is replaced with partial unique indexes
(WHERE col IS NOT NULL) so multiple NULL emails/phones coexist while
non-NULL values stay unique.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a9c1d2e3f4b5"
down_revision: str | None = "87140393fa0e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=20), nullable=True))
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    # Replace the plain unique index on email with partial unique indexes that
    # allow NULLs (phone-only accounts have NULL email).
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.create_index(
        "uq_users_email_partial",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )
    op.create_index(
        "uq_users_phone_partial",
        "users",
        ["phone"],
        unique=True,
        postgresql_where=sa.text("phone IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_phone_partial", table_name="users")
    op.drop_index("uq_users_email_partial", table_name="users")
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.drop_column("users", "phone")
