from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.core.redis import get_redis
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.core.token_blacklist import blacklist_token, is_token_blacklisted
from app.models.user import User
from app.schemas.user import (
    ChangePasswordRequest,
    ChangePhoneRequest,
    LogoutRequest,
    MessageResponse,
    PhoneLoginRequest,
    RefreshRequest,
    RefreshResponse,
    SendSmsCodeRequest,
    SmsLoginRequest,
    SmsRegisterRequest,
    SmsResetPasswordRequest,
    TokenResponse,
    UserResponse,
)
from app.services.sms_service import send_verify_code
from app.services.sms_service import verify_code as verify_sms_code

logger = structlog.get_logger(__name__)
settings = get_settings()

security = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/auth", tags=["auth"])


# Per-phone-per-purpose send cooldown (seconds). Redis key
# sms:cooldown:{phone}:{purpose} is set on send and its existence blocks
# resends. Aliyun also rate-limits server-side; this is a local first line
# of defense against billing abuse.
_SMS_COOLDOWN_SECONDS = 60


@router.post("/sms/send-code", response_model=MessageResponse)
@rate_limit("5/minute")
async def sms_send_code(request: Request, data: SendSmsCodeRequest):
    """Send an SMS verification code to the given phone number.

    A 60s per-phone-per-purpose cooldown (Redis) prevents rapid resends.
    In dev-fake mode (no Aliyun credentials) the code is logged instead of sent.
    """
    redis = get_redis()
    cooldown_key = f"sms:cooldown:{data.phone}:{data.purpose}"
    if await redis.exists(cooldown_key):
        raise HTTPException(status_code=429, detail="发送过于频繁，请稍后再试")

    try:
        await send_verify_code(data.phone, purpose=data.purpose)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Set the cooldown only after a successful send.
    try:
        await redis.setex(cooldown_key, _SMS_COOLDOWN_SECONDS, "1")
    except Exception:
        # Fail-open: Redis outage must not block login. Aliyun's own rate
        # limit still protects us.
        logger.warning("sms_cooldown_set_failed", phone=data.phone, purpose=data.purpose)

    logger.info("sms_code_sent", phone=data.phone, purpose=data.purpose)
    return MessageResponse(message="验证码已发送")


@router.post("/sms/login", response_model=TokenResponse)
@rate_limit("10/minute")
async def sms_login(request: Request, data: SmsLoginRequest, db: AsyncSession = Depends(get_db)):
    """Log in via phone number + SMS code.

    Login-only — does NOT auto-create accounts. Registration is via
    /auth/sms/register (which sets a password).
    """
    if not await verify_sms_code(data.phone, data.code, purpose="register"):
        raise HTTPException(status_code=400, detail="验证码错误或已失效")

    result = await db.execute(select(User).where(User.phone == data.phone))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=404, detail="该手机号未注册")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="账户已被封禁")

    token = create_token(user.id)
    refresh_token = create_token(user.id, token_type="refresh")
    logger.info("sms_login_success", user_id=user.id, phone=data.phone)
    return TokenResponse(token=token, refresh_token=refresh_token, user=UserResponse.model_validate(user))


@router.post("/sms/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("3/minute")
async def sms_register(request: Request, data: SmsRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register with phone + SMS code + password (phone-only registration).

    The SMS code proves phone ownership; the password is set now (used for
    subsequent /auth/phone-login).
    """
    if not await verify_sms_code(data.phone, data.code, purpose="register"):
        raise HTTPException(status_code=400, detail="验证码错误或已失效")

    existing = await db.execute(select(User).where(User.phone == data.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="该手机号已注册")

    user = User(
        phone=data.phone,
        hashed_password=hash_password(data.password),
        name=data.name,
        onboarding_completed=False,
    )
    db.add(user)
    try:
        await db.commit()
    except Exception as exc:
        # Concurrent registration with the same phone can race past the check
        # above and hit the partial unique index — convert to a clean 409.
        await db.rollback()
        if "uq_users_phone_partial" in str(exc) or "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="该手机号已注册") from exc
        raise
    await db.refresh(user)

    token = create_token(user.id)
    refresh_token = create_token(user.id, token_type="refresh")
    logger.info("sms_register_success", user_id=user.id, phone=data.phone)
    return TokenResponse(token=token, refresh_token=refresh_token, user=UserResponse.model_validate(user))


@router.post("/phone-login", response_model=TokenResponse)
@rate_limit("5/minute")
async def phone_login(request: Request, data: PhoneLoginRequest, db: AsyncSession = Depends(get_db)):
    """Log in with phone + password (the password set at /auth/sms/register)."""
    result = await db.execute(select(User).where(User.phone == data.phone))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="手机号或密码错误")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="账户已被封禁")

    token = create_token(user.id)
    refresh_token = create_token(user.id, token_type="refresh")
    return TokenResponse(token=token, refresh_token=refresh_token, user=UserResponse.model_validate(user))


@router.post("/refresh", response_model=RefreshResponse)
@rate_limit("20/minute")
async def refresh_token(request: Request, data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a valid refresh token for a new access token.

    The refresh token must have type='refresh' in its payload.
    Returns a new access token (and optionally a new refresh token).
    """
    payload = decode_token(data.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Verify this is actually a refresh token
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a refresh token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload",
        )

    # Verify user still exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Reject refresh tokens that have already been used (blacklisted). A
    # rotated refresh token is blacklisted at the end of this handler; without
    # this check, a stolen/old refresh token could mint access tokens forever.
    if settings.jwt_blacklist_enabled and await is_token_blacklisted(payload.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    # Reject refresh tokens issued before the last password change/reset, so a
    # compromised refresh token becomes useless once the user resets their password.
    from app.api.dependencies import _token_issued_before_password_change

    if _token_issued_before_password_change(payload, user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired due to password change. Please log in again.",
        )

    # Blacklist the old refresh token to prevent reuse
    if settings.jwt_blacklist_enabled:
        old_jti = payload.get("jti")
        old_exp = payload.get("exp")
        if old_jti:
            if old_exp:
                remaining = int(old_exp - datetime.now(UTC).timestamp())
            else:
                remaining = settings.jwt_expire_minutes * 60 * 4  # refresh token TTL
            await blacklist_token(old_jti, max(remaining, 0))

    new_token = create_token(user.id)
    new_refresh_token = create_token(user.id, token_type="refresh")
    return RefreshResponse(token=new_token, refresh_token=new_refresh_token)


@router.post("/sms/reset-password", response_model=MessageResponse)
@rate_limit("5/minute")
async def sms_reset_password(
    request: Request,
    data: SmsResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reset password via phone + SMS code.

    Returns the same message whether or not the phone is registered, to prevent
    enumeration.
    """
    if not await verify_sms_code(data.phone, data.code, purpose="reset_password"):
        raise HTTPException(status_code=400, detail="验证码错误或已失效")

    result = await db.execute(select(User).where(User.phone == data.phone).with_for_update())
    user = result.scalar_one_or_none()

    if user is not None:
        user.hashed_password = hash_password(data.new_password)
        # Invalidate all sessions issued before this moment (tokens with an
        # earlier ``iat`` are rejected by the auth dependency).
        user.password_changed_at = datetime.now(UTC)
        db.add(user)
        await db.commit()
        logger.info("sms_password_reset", user_id=user.id, phone=data.phone)

    return MessageResponse(message="如果该手机号已注册，密码已重置。")


@router.post("/sms/change-phone", response_model=UserResponse)
@rate_limit("5/minute")
async def change_phone(
    request: Request,
    data: ChangePhoneRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's phone number.

    Requires: current password (re-authentication) + SMS code sent to the NEW
    phone (proves ownership of the new number).
    """
    # 1. Verify current password
    if not current_user.hashed_password or not verify_password(data.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="密码错误")

    # 2. Verify SMS code sent to the new phone
    if not await verify_sms_code(data.new_phone, data.code, purpose="change_phone"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码错误或已失效")

    # 3. Check new phone is not already registered
    existing = await db.execute(select(User).where(User.phone == data.new_phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该手机号已被注册")

    # 4. Update phone number
    current_user.phone = data.new_phone
    await db.commit()
    await db.refresh(current_user)

    logger.info("phone_changed", user_id=current_user.id, new_phone=data.new_phone)
    return UserResponse.model_validate(current_user)


@router.post("/logout", response_model=MessageResponse)
@rate_limit("10/minute")
async def logout(
    request: Request,
    data: LogoutRequest = None,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Invalidate the current JWT by adding its JTI to the Redis blacklist.
    Optionally also blacklists the refresh token if provided in the request body.
    """
    if not settings.jwt_blacklist_enabled:
        return MessageResponse(message="Logged out successfully")

    payload = decode_token(credentials.credentials)
    if payload is None:
        return MessageResponse(message="Logged out successfully")

    jti = payload.get("jti")
    if jti is None:
        return MessageResponse(message="Logged out successfully")

    # Calculate remaining TTL from the exp claim.
    exp = payload.get("exp")
    if exp:
        remaining = int(exp - datetime.now(UTC).timestamp())
    else:
        remaining = settings.jwt_expire_minutes * 60

    await blacklist_token(jti, remaining)
    logger.info("user_logged_out", user_id=current_user.id, jti=jti)

    # Also blacklist the refresh token if provided
    if data and data.refresh_token:
        refresh_payload = decode_token(data.refresh_token)
        if refresh_payload:
            refresh_jti = refresh_payload.get("jti")
            if refresh_jti:
                refresh_exp = refresh_payload.get("exp")
                if refresh_exp:
                    refresh_remaining = int(refresh_exp - datetime.now(UTC).timestamp())
                else:
                    refresh_remaining = settings.jwt_expire_minutes * 60 * 4
                await blacklist_token(refresh_jti, max(refresh_remaining, 0))
                logger.info("refresh_token_blacklisted", user_id=current_user.id, jti=refresh_jti)

    return MessageResponse(message="Logged out successfully")


@router.post("/change-password", response_model=MessageResponse)
@rate_limit("5/minute")
async def change_password(
    request: Request,
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password for an already-authenticated user."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.hashed_password = hash_password(data.new_password)
    # Invalidate all sessions issued before this moment.
    current_user.password_changed_at = datetime.now(UTC)
    await db.commit()

    logger.info("password_changed", user_id=current_user.id)
    return MessageResponse(message="Password changed successfully")
