"""Celery tasks for the redeem-code / Pro-membership lifecycle (ADR-0007).

- ``downgrade_expired_pro``: write back plan=free for users whose Pro has
  expired. ``require_pro_user`` only *blocks* expired Pro on access; it never
  wrote back ``free``, so the admin ``pro_users`` count was inflated and the
  profile page showed Pro indefinitely. This beat closes that gap.
- ``expire_unused_redeem_codes``: flip unused codes older than their
  ``expires_at`` to ``expired`` so stale inventory can't be redeemed.
"""

from datetime import UTC, datetime

import structlog

from app.tasks.async_helpers import run_async
from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task
def downgrade_expired_pro():
    """Downgrade users with plan=pro and plan_expires_at < now to free.

    Runs on a Celery beat schedule (hourly). Mirrors the expire-pending-orders
    pattern: lock rows with ``skip_locked`` so concurrent beats/workers don't
    contend.
    """
    from app.core.database import async_session
    from app.models.user import PlanType, User

    async def _process():
        from sqlalchemy import select

        now = datetime.now(UTC)
        async with async_session() as db:
            result = await db.execute(
                select(User)
                .where(
                    User.plan == PlanType.pro,
                    User.plan_expires_at.is_not(None),
                    User.plan_expires_at < now,
                )
                .with_for_update(skip_locked=True)
            )
            users = result.scalars().all()
            count = 0
            for u in users:
                # Re-check plan - a concurrent redeem may have extended it
                # past now while we waited for the row lock.
                if u.plan != PlanType.pro:
                    continue
                if u.plan_expires_at is not None and _to_aware(u.plan_expires_at) >= now:
                    continue
                u.plan = PlanType.free
                u.plan_expires_at = None
                count += 1
            if count:
                await db.commit()
            logger.info("downgraded_expired_pro", count=count)
            return count

    try:
        return run_async(_process())
    except Exception:
        logger.exception("downgrade_expired_pro failed")
        return 0


@celery_app.task
def expire_unused_redeem_codes():
    """Mark unused codes past their ``expires_at`` as expired.

    Runs on a Celery beat schedule (daily). ``expires_at`` is set at generation
    to ``created_at + redeem_code_unused_expiry_days`` (and backfilled for
    legacy codes by the r3e4d5e6e7m8 migration), so every unused code has one.
    """
    from app.core.config import get_settings
    from app.core.database import async_session
    from app.models.redeem import RedeemCode, RedeemStatus

    async def _process():
        from sqlalchemy import select

        now = datetime.now(UTC)
        async with async_session() as db:
            result = await db.execute(
                select(RedeemCode)
                .where(
                    RedeemCode.status == RedeemStatus.unused,
                    RedeemCode.expires_at.is_not(None),
                    RedeemCode.expires_at < now,
                )
                .with_for_update(skip_locked=True)
            )
            codes = result.scalars().all()
            count = 0
            for c in codes:
                # Re-check status - a concurrent redeem may have used it.
                if c.status != RedeemStatus.unused:
                    continue
                c.status = RedeemStatus.expired
                count += 1
            if count:
                await db.commit()
            logger.info("expired_unused_redeem_codes", count=count)
            return count

    # Touch the setting so it appears in config inventory / is overridable,
    # even though the per-code cutoff is precomputed into expires_at.
    _ = get_settings().redeem_code_unused_expiry_days

    try:
        return run_async(_process())
    except Exception:
        logger.exception("expire_unused_redeem_codes failed")
        return 0


def _to_aware(dt) -> datetime:
    """Normalise a possibly-naive datetime to aware UTC for comparison.

    Postgres returns aware datetimes for ``DateTime(timezone=True)``; SQLite
    (tests) may return naive. Mirrors ``app.api.dependencies._to_aware_utc``.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)
