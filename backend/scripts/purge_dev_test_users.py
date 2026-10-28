"""Purge synthetic / test accounts from a local development database.

The dev database accumulates throw-away accounts every time the e2e suite or a
browser probe registers a user (``frontend/e2e/helpers.ts`` generates a fresh
phone number per worker). They inflate every admin metric (signups, pro users,
funnel) and make the admin console useless for judging real numbers.

This script is deliberately **dev-only** and dry-run by default:

    # 1. Inspect the candidates (no writes):
    cd backend
    PYTHONUTF8=1 .venv/Scripts/python.exe scripts/purge_dev_test_users.py

    # 2. After taking a backup, delete them:
    docker exec speaking-db-1 pg_dump -U seeword -d seeword -F c -f /tmp/pre.dump
    PYTHONUTF8=1 .venv/Scripts/python.exe scripts/purge_dev_test_users.py --apply

Deletion is a normal ``DELETE FROM users``; every user-scoped table has an
``ON DELETE CASCADE`` (or ``SET NULL`` for audit references) in PostgreSQL, so
the DB performs the cascade. Admins are always kept, as are accounts created
before ``--cutoff`` (default: 2026-10-19, the start of the e2e/audit seeding
window). Use ``--keep-phone`` to pin extra accounts.

It refuses to run when ``ENV`` is ``production``; there is no override. Cleaning
production user data is a separate, reviewed operation — not this tool.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime

from sqlalchemy import delete, func, select

from app.core.config import get_settings
from app.core.database import async_session
from app.models.user import RoleType, User

DEFAULT_CUTOFF = "2026-10-19T00:00:00+00:00"


def _parse_cutoff(raw: str) -> datetime:
    value = raw.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:  # pragma: no cover - argparse surfaces this
        raise SystemExit(f"invalid --cutoff: {raw!r}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


async def _run(cutoff: datetime, keep_phones: set[str], apply: bool) -> int:
    settings = get_settings()
    if settings.env == "production":
        print("ERROR: refusing to purge users in production (dev-only tool).")
        return 2

    async with async_session() as db:
        conditions = [User.role != RoleType.admin, User.created_at >= cutoff]
        if keep_phones:
            conditions.append(User.phone.is_(None) | User.phone.notin_(keep_phones))

        candidates = (await db.execute(select(User).where(*conditions).order_by(User.created_at.asc()))).scalars().all()
        total_users = (await db.execute(select(func.count(User.id)))).scalar_one()

        print(f"env={settings.env} cutoff={cutoff.isoformat()} total_users={total_users}")
        print(f"candidates={len(candidates)}")
        for user in candidates[:10]:
            print(
                f"  - {user.phone or user.id} {user.created_at.isoformat()} plan={user.plan.value} name={user.name!r}"
            )
        if len(candidates) > 10:
            print(f"  ... and {len(candidates) - 10} more")

        if not apply:
            print("\nDry run. Re-run with --apply after taking a database backup.")
            return 0
        if not candidates:
            print("Nothing to delete.")
            return 0

        result = await db.execute(delete(User).where(*conditions))
        await db.commit()
        deleted = result.rowcount or 0
        remaining = (await db.execute(select(func.count(User.id)))).scalar_one()
        print(f"deleted={deleted} remaining_users={remaining}")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge synthetic test accounts from a local dev database.")
    parser.add_argument(
        "--cutoff",
        default=DEFAULT_CUTOFF,
        help=f"accounts created at/after this instant are candidates (default {DEFAULT_CUTOFF})",
    )
    parser.add_argument(
        "--keep-phone",
        action="append",
        default=[],
        help="phone number to keep even if it matches the cutoff (repeatable)",
    )
    parser.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    args = parser.parse_args()

    raise SystemExit(asyncio.run(_run(_parse_cutoff(args.cutoff), set(args.keep_phone), args.apply)))


if __name__ == "__main__":
    main()
