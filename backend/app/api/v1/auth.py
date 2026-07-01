import secrets
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.core.security import create_token, decode_token, hash_password, token_lookup_hash, verify_password
from app.core.token_blacklist import blacklist_token, is_token_blacklisted
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.user import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    RefreshResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services.email_service import send_password_reset_email, send_verification_email

logger = structlog.get_logger(__name__)
settings = get_settings()

security = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("3/minute")
async def register(request: Request, data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        name=data.name,
    )
    db.add(user)
    try:
        await db.commit()
    except Exception as exc:
        # Concurrent registration with the same email can race past the check
        # above and hit the unique constraint — convert to a clean 409.
        await db.rollback()
        if "uq_users_email" in str(exc) or "unique" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered") from exc
        raise
    await db.refresh(user)

    token = create_token(user.id)
    refresh_token = create_token(user.id, token_type="refresh")
    return TokenResponse(token=token, refresh_token=refresh_token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
@rate_limit("5/minute")
async def login(request: Request, data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账户已被封禁")

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


@router.post("/forgot-password", response_model=MessageResponse)
@rate_limit("3/hour")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Request a password reset link.

    Always returns 200 with the same message to prevent email enumeration.
    """
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user:
        # Generate a cryptographically secure random token
        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_password(raw_token)
        # Deterministic lookup key — indexed so reset can find the candidate
        # row in O(1) instead of bcrypt-verifying every unexpired token.
        lookup = token_lookup_hash(raw_token)
        expires_at = datetime.now(UTC) + timedelta(minutes=settings.password_reset_expire_minutes)

        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            token_lookup=lookup,
            expires_at=expires_at,
        )
        db.add(reset_token)
        await db.commit()

        # Build the reset URL — frontend route that will present the reset form
        reset_url = f"{settings.frontend_url}/reset-password?token={raw_token}"

        # Send email (or log to stdout in dev)
        await send_password_reset_email(email=user.email, reset_url=reset_url)

        logger.info("password_reset_requested", user_id=user.id)
    else:
        # Deliberately do nothing — same response prevents enumeration
        logger.info("password_reset_requested_email_not_found", email=data.email)

    return MessageResponse(message="If that email is registered, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
@rate_limit("5/minute")
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reset a user's password using a valid reset token."""
    now = datetime.now(UTC)

    # Indexed lookup by the token's deterministic hash — O(1) query + a single
    # bcrypt verify, instead of loading every unexpired token and bcrypt-checking
    # each (O(n) slow + timing leak).
    # Lock the token row to prevent double-use race (two concurrent reset
    # requests with the same token could both pass the used_at check).
    lookup = token_lookup_hash(data.token)
    result = await db.execute(
        select(PasswordResetToken)
        .where(
            PasswordResetToken.token_lookup == lookup,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .with_for_update()
    )
    matched_token = result.scalar_one_or_none()

    if matched_token is not None:
        # Candidate found by index — confirm with the authoritative bcrypt check.
        if not verify_password(data.token, matched_token.token_hash):
            matched_token = None
    else:
        # Legacy fallback: tokens without a token_lookup (created before this
        # column existed) can't be found by index. Scan unexpired tokens lacking
        # a lookup. Empty for fresh deployments; disappears once old tokens
        # expire (password_reset_expire_minutes, default 30).
        legacy_result = await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_lookup.is_(None),
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
        )
        for t in legacy_result.scalars().all():
            if verify_password(data.token, t.token_hash):
                matched_token = t
                break

    if matched_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Look up the user (lock row to serialize concurrent password changes)
    result = await db.execute(select(User).where(User.id == matched_token.user_id).with_for_update())
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Update password and mark token as used
    user.hashed_password = hash_password(data.new_password)
    # Invalidate all sessions issued before this moment (tokens with an earlier
    # ``iat`` are rejected by the auth dependency).
    user.password_changed_at = now
    matched_token.used_at = now
    db.add(user)
    db.add(matched_token)
    await db.commit()

    logger.info("password_reset_completed", user_id=user.id)
    return MessageResponse(message="Password has been reset successfully.")


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


@router.post("/verify-email", response_model=MessageResponse)
@rate_limit("5/minute")
async def verify_email(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Verify a user's email address using the token from the verification link."""
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    if payload.get("type") != "email_verification":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not a verification token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    if user.email_verified_at is not None:
        return MessageResponse(message="Email already verified")

    from datetime import UTC

    user.email_verified_at = datetime.now(UTC)
    await db.commit()

    logger.info("email_verified", user_id=user.id)
    return MessageResponse(message="Email verified successfully")


@router.post("/resend-verification", response_model=MessageResponse)
@rate_limit("3/hour")
async def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Resend the email verification link to the current user."""
    if current_user.email_verified_at is not None:
        return MessageResponse(message="Email already verified")

    await send_verification_email(
        user_id=current_user.id,
        email=current_user.email,
        name=current_user.name,
    )

    logger.info("verification_resent", user_id=current_user.id)
    return MessageResponse(message="Verification email sent")
