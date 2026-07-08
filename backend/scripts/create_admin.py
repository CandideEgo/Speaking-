"""Bootstrap an admin user after a fresh deploy.

Cold-start problem: after `alembic upgrade head` on an empty database, no
account has role='admin', so the /admin console and all seed/invite endpoints
are unreachable. This script creates (or promotes) an admin account.

Idempotent: if the phone already exists, it only ensures the role is 'admin'
and (with --reset-password) updates the password. Run once per deploy.

Usage:
    # Inside the backend container (DATABASE_URL is set):
    python scripts/create_admin.py --phone 13900139000 --password 'S3cret!'

    # Or via env vars (handy for docker-compose / CI):
    ADMIN_PHONE=13900139000 ADMIN_PASSWORD='S3cret!' python scripts/create_admin.py

    # Reset an existing admin's password:
    python scripts/create_admin.py --phone 13900139000 --password 'S3cret!' --reset-password

Exits 0 on success, 1 on usage/DB error.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from sqlalchemy import select

from app.core.database import async_session
from app.core.security import hash_password
from app.models.user import RoleType, User


async def _create_or_promote(phone: str, password: str | None, reset: bool) -> None:
    async with async_session() as db:
        result = await db.execute(select(User).where(User.phone == phone))
        user = result.scalar_one_or_none()

        if user is None:
            if not password:
                print(f"ERROR: user {phone!r} does not exist and no --password given.", file=sys.stderr)
                sys.exit(1)
            user = User(
                phone=phone,
                hashed_password=hash_password(password),
                name="Admin",
                role=RoleType.admin,
                onboarding_completed=True,
            )
            db.add(user)
            await db.commit()
            print(f"Created admin user: {phone}")
            return

        # Existing user — promote to admin.
        changed = False
        if user.role != RoleType.admin:
            user.role = RoleType.admin
            changed = True
            print(f"Promoted {phone} to admin.")
        if reset and password:
            user.hashed_password = hash_password(password)
            changed = True
            print(f"Reset password for {phone}.")
        if not changed:
            print(f"{phone} is already an admin; no changes. (use --reset-password to change the password)")
        if changed:
            await db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap or promote an admin user.")
    parser.add_argument(
        "--phone", default=os.environ.get("ADMIN_PHONE"), help="Admin phone number (or ADMIN_PHONE env)."
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("ADMIN_PASSWORD"),
        help="Password for a new admin, or with --reset-password (or ADMIN_PASSWORD env).",
    )
    parser.add_argument("--reset-password", action="store_true", help="Reset the password of an existing admin.")
    args = parser.parse_args()

    if not args.phone:
        parser.error("--phone (or ADMIN_PHONE env) is required.")

    asyncio.run(_create_or_promote(args.phone, args.password, args.reset_password))


if __name__ == "__main__":
    main()
