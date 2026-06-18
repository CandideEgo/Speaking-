"""Email service for password reset and other transactional emails.

In production, sends email via aiosmtplib.
In development (SMTP_HOST empty), logs the reset URL to stdout as a fallback.
"""
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import structlog

from app.core.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


async def send_password_reset_email(email: str, reset_url: str) -> None:
    """Send a password reset email with the given reset URL.

    If SMTP_HOST is not configured, logs the URL to stdout instead.
    """
    if not settings.smtp_host:
        logger.info(
            "password_reset_email_skipped_smtp_not_configured",
            email=email,
            reset_url=reset_url,
        )
        print(f"[DEV] Password reset for {email}: {reset_url}")
        return

    subject = "Speaking — Password Reset"
    text_body = (
        f"You requested a password reset for your Speaking account.\n\n"
        f"Click the link below to set a new password (valid for {settings.password_reset_expire_minutes} minutes):\n\n"
        f"{reset_url}\n\n"
        f"If you did not request this, ignore this email — your password will remain unchanged."
    )
    html_body = (
        f"<p>You requested a password reset for your Speaking account.</p>"
        f"<p>Click the link below to set a new password "
        f"(valid for {settings.password_reset_expire_minutes} minutes):</p>"
        f'<p><a href="{reset_url}">{reset_url}</a></p>'
        f"<p>If you did not request this, ignore this email — your password will remain unchanged.</p>"
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        import aiosmtplib

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            start_tls=settings.smtp_use_tls,
        )
        logger.info("password_reset_email_sent", email=email)
    except Exception:
        logger.exception("password_reset_email_failed", email=email)
        # Do not raise — we don't want email failures to leak information
        # about whether an account exists. The endpoint always returns 200.
