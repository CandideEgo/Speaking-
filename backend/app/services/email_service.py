import logging
from datetime import UTC, datetime, timedelta, timezone

from jose import jwt

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _create_verification_token(user_id: str) -> str:
    """Generate a JWT token for email verification (24h expiry)."""
    expire = datetime.now(UTC) + timedelta(hours=24)
    payload = {"sub": user_id, "exp": expire, "type": "email_verification"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def send_verification_email(user_id: str, email: str, name: str | None = None) -> None:
    """Send a verification email to the user.

    In development mode, logs the verification URL instead of sending an email.
    """
    token = _create_verification_token(user_id)
    verification_url = f"{settings.frontend_url}/verify-email?token={token}"

    if settings.env == "development":
        logger.info(
            "DEV MODE — Email verification for %s: %s",
            email,
            verification_url,
        )
        return

    # Production: send actual email
    # TODO: integrate with an email provider (e.g. SendGrid, SES, SMTP)
    # For now, log as a placeholder
    logger.info(
        "Verification email would be sent to %s: %s",
        email,
        verification_url,
    )


async def send_password_reset_email(email: str, reset_url: str) -> None:
    """Send a password reset email.

    In development mode, logs the reset URL instead of sending an email.
    """
    if settings.env == "development":
        logger.info("DEV MODE — Password reset for %s: %s", email, reset_url)
        return

    # Production: send actual email
    # TODO: integrate with an email provider (e.g. SendGrid, SES, SMTP)
    logger.info("Password reset email would be sent to %s: %s", email, reset_url)
