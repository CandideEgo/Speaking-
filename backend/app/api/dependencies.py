from datetime import UTC, datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decode_token
from app.core.time_utils import to_aware_utc
from app.core.token_blacklist import is_token_blacklisted
from app.models.user import RoleType, User

security = HTTPBearer(auto_error=False)
settings = get_settings()


def _token_issued_before_password_change(payload: dict, user: User) -> bool:
    """Return True if the token was issued before the user's last password change.

    Used to invalidate sessions after a password reset/change: tokens minted
    before ``password_changed_at`` are treated as stale. Tokens without an
    ``iat`` claim (issued before this feature shipped) are allowed through to
    avoid a mass logout on deploy.

    A 2-second leeway absorbs sub-second clock differences and the fact that
    JWT ``iat`` is encoded as an integer (truncated) while ``password_changed_at``
    retains microsecond precision — otherwise a token issued in the same second
    as the password change could be spuriously rejected.
    """
    iat = payload.get("iat")
    if iat is None or user.password_changed_at is None:
        return False
    issued_at = datetime.fromtimestamp(float(iat), tz=UTC)
    changed_at = to_aware_utc(user.password_changed_at)
    return issued_at + timedelta(seconds=2) < changed_at


class _AuthenticationError(Exception):
    """没有可用的身份 —— 只在 **本模块内** 流转，不会逃到 handler。

    存在的理由：``get_current_user`` 与 ``get_optional_user`` 走同一条校验链，
    但结尾不一样（一个 raise、一个 return None）。把「哪一步没过」和「传什么
    状态码」都放进这个异常，两个依赖就各自退回成三行：一个转成 HTTPException，
    一个转成 None。

    带上 ``status_code`` 是为了保住封禁的 403：封禁在必选依赖上是 403、在可选
    依赖上是「当匿名」。若把它折成一个统一的 401，就等于**动了状态码**，而
    批 1d 是搬运，不是改契约。
    """

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


async def _authenticate(
    credentials: HTTPAuthorizationCredentials | None,
    db: AsyncSession,
) -> User:
    """把一次请求的 token 解析成 User，失败一律抛 `_AuthenticationError`。

    这是**唯一**一份登录校验链：token 类型、黑名单、``password_changed_at``、
    用户是否还在、是否被封禁。过去它有两份拷贝（必选 / 可选两个依赖），于是
    每加一条规则都得改两处，漏一处不报错，只让可选鉴权端点静默地少一道门。
    """
    if credentials is None:
        raise _AuthenticationError(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise _AuthenticationError(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    # Prevent refresh tokens from being used as access tokens
    if payload.get("type") not in ("access", None):
        raise _AuthenticationError(status.HTTP_401_UNAUTHORIZED, "Invalid token type")

    # Token blacklist check (skip if feature disabled)
    if settings.jwt_blacklist_enabled and await is_token_blacklisted(payload.get("jti")):
        raise _AuthenticationError(status.HTTP_401_UNAUTHORIZED, "Token has been revoked")

    user_id = payload.get("sub")
    if user_id is None:
        raise _AuthenticationError(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise _AuthenticationError(status.HTTP_401_UNAUTHORIZED, "User not found")

    # Reject tokens issued before the last password change/reset.
    if _token_issued_before_password_change(payload, user):
        raise _AuthenticationError(
            status.HTTP_401_UNAUTHORIZED,
            "Session expired due to password change. Please log in again.",
        )

    # Reject banned users — their tokens may still be valid but access is revoked.
    if user.is_banned:
        raise _AuthenticationError(status.HTTP_403_FORBIDDEN, "账户已被封禁")

    return user


async def resolve_token_user(token: str, db: AsyncSession) -> User | None:
    """Resolve a raw ``?token=`` string through the single auth chain.

    Media/PDF endpoints cannot send an Authorization header, so they accept the
    token as a query parameter. They must still honour the same rules as
    ``get_current_user`` (blacklist, password-change revocation, banned users);
    this helper is the one place that turns a raw string into a User.
    """
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    try:
        return await _authenticate(credentials, db)
    except _AuthenticationError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        return await _authenticate(credentials, db)
    except _AuthenticationError as exc:
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        raise HTTPException(status_code=exc.status_code, detail=exc.message, headers=headers) from exc


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Same chain as `get_current_user`; every rejection degrades to "anonymous".

    A banned user is rejected here too (not just on required endpoints) — the
    difference is only that this dependency answers ``None`` instead of 403.
    """
    try:
        return await _authenticate(credentials, db)
    except _AuthenticationError:
        return None


async def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != RoleType.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
