"""User presence heartbeat (DEV-FLOW 2026-07 Phase B2).

A video-watching app is mostly passive: the user watches a video and makes
few API calls, so "last_active_at" undercounts who is actually online. The
frontend pings ``POST /presence/heartbeat`` every 60s while the tab is
visible; the handler sets a Redis key ``presence:{uid}`` with a 5-minute TTL.
The admin dashboard counts these keys for the real-time online number.

Fails open: presence is best-effort and never blocks the user.
"""

from fastapi import APIRouter, Depends, Request

from app.api.dependencies import get_current_user
from app.core.limiter import rate_limit
from app.models.user import User

# presence:{uid} TTL. Must exceed the frontend's heartbeat interval (60s) so a
# briefly-delayed heartbeat doesn't flap the user offline, but short enough that
# a closed tab drops them within ~5 min.
PRESENCE_TTL_SECONDS = 300  # 5 minutes

router = APIRouter(prefix="/presence", tags=["presence"])


@router.post("/heartbeat")
@rate_limit("60/minute")
async def heartbeat(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Record that the user's tab is visible. Called every ~60s by the client."""
    try:
        from app.core.redis import get_redis

        redis = get_redis()
        await redis.setex(f"presence:{current_user.id}", PRESENCE_TTL_SECONDS, "1")
    except Exception:
        # Fail-open: presence is best-effort; never block the user.
        pass
    return {"ok": True}
