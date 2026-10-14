from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_serializer, field_validator

from app.core.exam_levels import EXAM_LEVEL_KEYS
from app.core.security import validate_password_strength


class SendSmsCodeRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    # "auth" is the canonical purpose for both login and registration.
    # "register" / "reset_password" stay accepted for one release so old
    # clients keep working (see P0-A).
    purpose: str = Field(default="auth", pattern=r"^(auth|register|change_phone|reset_password)$")


class SmsLoginRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    code: str = Field(..., min_length=4, max_length=6, pattern=r"^\d+$")


class PhoneLoginRequest(BaseModel):
    """Phone + password login (the password set at /auth/sms/register)."""

    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    password: str


class SmsRegisterRequest(BaseModel):
    """Phone-only registration (deprecated compatibility entry point).

    The canonical flow is ``POST /auth/sms/login`` — a verified code creates
    the account when the phone is new. This endpoint stays for one release so
    existing clients can still register; ``password`` is now optional.
    """

    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    code: str = Field(..., min_length=4, max_length=6, pattern=r"^\d+$")
    password: str | None = Field(default=None, min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=100)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str | None) -> str | None:
        if v is not None:
            validate_password_strength(v)
        return v


class SmsResetPasswordRequest(BaseModel):
    """Phone-based password reset: SMS code + new password (no email link)."""

    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    code: str = Field(..., min_length=4, max_length=6, pattern=r"^\d+$")
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class ChangePhoneRequest(BaseModel):
    """Change phone number: requires SMS code sent to the NEW phone + current password."""

    new_phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    code: str = Field(..., min_length=4, max_length=6, pattern=r"^\d+$")
    password: str


class UserUpdate(BaseModel):
    # Capped at the column width (``String(100)``), matching
    # ``SmsRegisterRequest.name`` — the two entry points must agree, or the
    # update path hands PostgreSQL a value it will reject.
    name: str | None = Field(default=None, max_length=100)
    level: str | None = None
    avatar_url: str | None = Field(default=None, max_length=2000)
    # The user's gender — decides which built-in default illustration is shown
    # when there is no upload. Not a separate "which illustration" choice.
    gender: Literal["male", "female"] | None = None
    bio: str | None = Field(default=None, max_length=300)
    timezone: str | None = Field(default=None, max_length=50)

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str | None) -> str | None:
        if v is not None and v.upper() not in ("A1", "A2", "B1", "B2", "C1", "C2"):
            raise ValueError("Level must be one of: A1, A2, B1, B2, C1, C2")
        return v.upper() if v else v


class UserResponse(BaseModel):
    id: str
    phone: str | None = None
    name: str | None
    level: str | None
    plan: str
    plan_expires_at: datetime | None = None
    role: str | None = None
    avatar_url: str | None = None
    gender: str | None = None
    bio: str | None = None
    timezone: str | None = None
    last_active_at: datetime | None = None
    onboarding_completed: bool = False
    created_at: datetime

    @field_serializer("plan_expires_at", "last_active_at", "created_at")
    def serialize_datetime(self, v: datetime | None) -> str | None:
        return v.isoformat() if v is not None else None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    token: str
    refresh_token: str | None = None
    user: UserResponse
    # True when /auth/sms/login created the account on the fly. Existing
    # clients ignore the extra field; the web client uses it to route a new
    # user into onboarding immediately.
    is_new_user: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    token: str
    refresh_token: str | None = None


class ChangePasswordRequest(BaseModel):
    # First-time password setup (phone-only account, hashed_password is NULL)
    # omits current_password; a real change requires it.
    current_password: str | None = None
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class MessageResponse(BaseModel):
    message: str


# ── User preferences schemas ────────────────────────────────────────


class UserPreferencesResponse(BaseModel):
    daily_goal_type: str = "words"
    daily_goal_value: int = 5
    reminder_enabled: bool = True
    reminder_time: str | None = None
    reminder_timezone: str | None = None
    auto_play_next_subtitle: bool = True
    # P1-5: vocabulary-drill "auto-advance after a correct answer" toggle.
    auto_advance_on_correct: bool = False
    subtitle_mode_default: str = "bilingual"
    subtitle_font_size: str = "medium"
    preferred_difficulty: str | None = None
    target_exam: str | None = None

    model_config = {"from_attributes": True}


class UserPreferencesUpdate(BaseModel):
    daily_goal_type: Literal["minutes", "words"] | None = None
    daily_goal_value: int | None = Field(default=None, ge=1, le=100)
    reminder_enabled: bool | None = None
    reminder_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    reminder_timezone: str | None = None
    auto_play_next_subtitle: bool | None = None
    auto_advance_on_correct: bool | None = None
    subtitle_mode_default: Literal["bilingual", "english", "chinese"] | None = None
    subtitle_font_size: Literal["small", "medium", "large"] | None = None
    preferred_difficulty: str | None = None
    target_exam: str | None = None

    @field_validator("target_exam")
    @classmethod
    def validate_target_exam(cls, v: str | None) -> str | None:
        if v is not None and v not in EXAM_LEVEL_KEYS:
            raise ValueError(f"target_exam must be one of: {', '.join(EXAM_LEVEL_KEYS)}")
        return v


class OnboardingRequest(BaseModel):
    onboarding_completed: bool = True


# ── Account deletion (P1-7) ─────────────────────────────────────────


class DeletionRequest(BaseModel):
    """Second-confirmation payload for ``POST /users/me/deletion``.

    ``confirm`` must be True — it is the explicit second confirmation the
    plan requires; ``reason`` is optional free text kept with the request.
    """

    confirm: bool = False
    reason: str | None = Field(default=None, max_length=500)


class DeletionStatusResponse(BaseModel):
    """Current 30-day-cancellable-deletion state for the user."""

    scheduled: bool = False
    requested_at: datetime | None = None
    scheduled_at: datetime | None = None
    days_remaining: int | None = None
    reason: str | None = None

    @field_serializer("requested_at", "scheduled_at")
    def serialize_datetime(self, v: datetime | None) -> str | None:
        return v.isoformat() if v is not None else None


# ── Async data export (P1-7) ────────────────────────────────────────


class ExportTaskResponse(BaseModel):
    task_id: str
    status: str
    created_at: datetime | None = None

    @field_serializer("created_at")
    def serialize_datetime(self, v: datetime | None) -> str | None:
        return v.isoformat() if v is not None else None


class ExportStatusResponse(BaseModel):
    task_id: str
    status: str
    created_at: datetime | None = None
    size_bytes: int | None = None
    error: str | None = None
    # Present only when status == "ready"; short-lived + single-use.
    download_url: str | None = None
    download_expires_at: datetime | None = None

    @field_serializer("created_at", "download_expires_at")
    def serialize_datetime(self, v: datetime | None) -> str | None:
        return v.isoformat() if v is not None else None
