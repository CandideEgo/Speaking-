"""Redeem-code lifecycle: rename invite_codes->redeem_codes + status machine.

ADR-0007. Adds a 4-state status machine (unused/redeemed/revoked/expired) with
revoked_reason and expires_at, backfilling the old is_used boolean. Drops
is_used (superseded by status). Renames the table + its index/constraints to
the new redeem_codes vocabulary.

Revision ID: r3e4d5e6e7m8
Revises: e1m2a3i4l5r6
Create Date: 2026-07-09 00:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "r3e4d5e6e7m8"
down_revision: str | None = "e1m2a3i4l5r6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Rename table invite_codes -> redeem_codes (constraints/indexes keep
    #    their old names until we rename them below).
    op.rename_table("invite_codes", "redeem_codes")

    # 2. Create the enum types explicitly. op.add_column does NOT auto-create
    #    PG enum types (only op.create_table does), so create them first and
    #    reference them with create_type=False below.
    op.execute("CREATE TYPE redeemstatus AS ENUM ('unused', 'redeemed', 'revoked', 'expired')")
    op.execute("CREATE TYPE revokedreason AS ENUM ('leak', 'error', 'refund')")

    # 3. Add the status-machine columns. status is nullable first so we can
    #    backfill, then tightened to NOT NULL.
    op.add_column(
        "redeem_codes",
        sa.Column(
            "status",
            sa.Enum(
                "unused",
                "redeemed",
                "revoked",
                "expired",
                name="redeemstatus",
                create_type=False,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "redeem_codes",
        sa.Column(
            "revoked_reason",
            sa.Enum("leak", "error", "refund", name="revokedreason", create_type=False),
            nullable=True,
        ),
    )
    op.add_column(
        "redeem_codes",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 4. Backfill status from the legacy is_used boolean.
    op.execute("UPDATE redeem_codes SET status = 'redeemed' WHERE is_used")
    op.execute("UPDATE redeem_codes SET status = 'unused' WHERE NOT is_used")

    # 5. Tighten status to NOT NULL with a server default for future inserts.
    op.alter_column(
        "redeem_codes",
        "status",
        nullable=False,
        server_default=sa.text("'unused'"),
    )

    # 6. Drop the superseded is_used column.
    op.drop_column("redeem_codes", "is_used")

    # 7. Rename index + constraints to the new vocabulary.
    op.execute("ALTER INDEX ix_invite_codes_code RENAME TO ix_redeem_codes_code")
    op.execute("ALTER TABLE redeem_codes RENAME CONSTRAINT invite_codes_pkey TO redeem_codes_pkey")
    op.execute(
        "ALTER TABLE redeem_codes RENAME CONSTRAINT fk_invite_codes_used_by_users TO fk_redeem_codes_used_by_users"
    )


def downgrade() -> None:
    # Reverse the status machine back to the legacy is_used boolean.

    # 1. Re-add is_used (nullable first), backfill from status, tighten.
    op.add_column("redeem_codes", sa.Column("is_used", sa.Boolean(), nullable=True))
    op.execute("UPDATE redeem_codes SET is_used = (status = 'redeemed')")
    op.alter_column(
        "redeem_codes",
        "is_used",
        nullable=False,
        server_default=sa.text("false"),
    )

    # 2. Drop the status-machine columns + enum types.
    op.drop_column("redeem_codes", "expires_at")
    op.drop_column("redeem_codes", "revoked_reason")
    op.drop_column("redeem_codes", "status")
    op.execute("DROP TYPE revokedreason")
    op.execute("DROP TYPE redeemstatus")

    # 3. Rename index + constraints back to the invite_codes vocabulary.
    op.execute("ALTER INDEX ix_redeem_codes_code RENAME TO ix_invite_codes_code")
    op.execute("ALTER TABLE redeem_codes RENAME CONSTRAINT redeem_codes_pkey TO invite_codes_pkey")
    op.execute(
        "ALTER TABLE redeem_codes RENAME CONSTRAINT fk_redeem_codes_used_by_users TO fk_invite_codes_used_by_users"
    )

    # 4. Rename table back.
    op.rename_table("redeem_codes", "invite_codes")
