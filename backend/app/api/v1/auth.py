import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import hash_password, verify_password, create_token, decode_token
from app.core.token_blacklist import blacklist_token
from app.core.limiter import limiter, rate_limit
from app.models.user import User
from app.models.password_reset import PasswordResetToken
from app.schemas.user import (
    UserCreate,
    UserLogin,
    TokenResponse,
    UserResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    MessageResponse,
)
from app.services.email_service import send_password_reset_email
from app.api.dependencies import get_current_user

import structlog

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
    await db.commit()
    await db.refresh(user)

    token = create_token(user.id)
    return TokenResponse(token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
@rate_limit("5/minute")
async def login(request: Request, data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_token(user.id)
    return TokenResponse(token=token, user=UserResponse.model_validate(user))


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
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.password_reset_expire_minutes
        )

        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
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

    return MessageResponse(
        message="If that email is registered, a reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
@rate_limit("5/minute")
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reset a user's password using a valid reset token.

    Finds the token by brute-matching the provided token against all
    unexpired, unused token hashes for the user, then updates the password.
    """
    now = datetime.now(timezone.utc)

    # Find all unexpired, unused tokens
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    tokens = result.scalars().all()

    matched_token = None
    for t in tokens:
        if verify_password(data.token, t.token_hash):
            matched_token = t
            break

    if not matched_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Look up the user
    result = await db.execute(select(User).where(User.id == matched_token.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Update password and mark token as used
    user.hashed_password = hash_password(data.new_password)
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
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Invalidate the current JWT by adding its JTI to the Redis blacklist.

    The blacklist key TTL equals the token's remaining validity so it
    auto-expires when the token would have expired anyway.
    """
    if not settings.jwt_blacklist_enabled:
        return MessageResponse(message="Logged out successfully")

    payload = decode_token(credentials.credentials)
    if payload is None:
        # Should not happen — get_current_user already validated the token.
        return MessageResponse(message="Logged out successfully")

    jti = payload.get("jti")
    if jti is None:
        # Token issued before the JTI feature was added — nothing to blacklist.
        return MessageResponse(message="Logged out successfully")

    # Calculate remaining TTL from the exp claim.
    exp = payload.get("exp")
    if exp:
        remaining = int(exp - datetime.now(timezone.utc).timestamp())
    else:
        # Fallback: use the configured JWT expiry as TTL.
        remaining = settings.jwt_expire_minutes * 60

    await blacklist_token(jti, remaining)
    logger.info("user_logged_out", user_id=current_user.id, jti=jti)

    return MessageResponse(message="Logged out successfully")
