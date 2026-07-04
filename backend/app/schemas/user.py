from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_serializer, field_validator

from app.core.exam_levels import EXAM_LEVEL_KEYS
from app.core.security import validate_password_strength


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=100)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class SendSmsCodeRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")


class SmsLoginRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    code: str = Field(..., min_length=4, max_length=6, pattern=r"^\d+$")


class PhoneLoginRequest(BaseModel):
    """Phone + password login (the password set at /auth/sms/register)."""

    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    password: str


class SmsRegisterRequest(BaseModel):
    """Phone-only registration: SMS code proves phone ownership, password is set now."""

    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$")
    code: str = Field(..., min_length=4, max_length=6, pattern=r"^\d+$")
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=100)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
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


class UserUpdate(BaseModel):
    name: str | None = None
    level: str | None = None
    avatar_url: str | None = Field(default=None, max_length=2000)
    bio: str | None = Field(default=None, max_length=300)
    timezone: str | None = Field(default=None, max_length=50)

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str | None) -> str | None:
        if v is not None and v.upper() not in ("A1", "A2", "B1", "B2", "C1", "C2"):
            raise ValueError("Level must be one of: A1, A2, B1, B2, C1, C2")
        return v.upper() if v else v


class BindEmailRequest(BaseModel):
    """Bind an email to a phone-only account (so the user can log in with email
    as well as phone, using the same password). Requires the current password."""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str | None = None
    phone: str | None = None
    name: str | None
    level: str | None
    plan: str
    plan_expires_at: datetime | None = None
    role: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    timezone: str | None = None
    streak_count: int = 0
    longest_streak: int = 0
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


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    token: str
    refresh_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
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


# ── Learning stats & activity schemas ───────────────────────────────


class UserStatsResponse(BaseModel):
    total_speaking_attempts: int = 0
    average_accuracy: float = 0.0
    average_fluency: float = 0.0
    average_completeness: float = 0.0
    total_vocabulary: int = 0
    total_videos_watched: int = 0
    period: str = "all"
    trend: dict | None = None


class StreakInfoResponse(BaseModel):
    current_streak: int = 0
    longest_streak: int = 0
    last_active_at: str | None = None
    goal_type: str | None = None
    goal_value: int = 0
    today_progress: dict = {}


class DailyActivityResponse(BaseModel):
    date: str
    speaking_attempts: int = 0
    words_reviewed: int = 0
    words_added: int = 0
    videos_watched: int = 0
    quizzes_taken: int = 0
    avg_accuracy: float | None = None
    avg_fluency: float | None = None
    avg_completeness: float | None = None
    time_spent_seconds: int = 0
    goal_met: bool = False


class ActivityCalendarResponse(BaseModel):
    year: int
    month: int
    activities: list[DailyActivityResponse] = []


# ── User preferences schemas ────────────────────────────────────────


class UserPreferencesResponse(BaseModel):
    daily_goal_type: str = "words"
    daily_goal_value: int = 5
    reminder_enabled: bool = True
    reminder_time: str | None = None
    reminder_timezone: str | None = None
    auto_play_next_subtitle: bool = True
    subtitle_mode_default: str = "bilingual"
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
    subtitle_mode_default: Literal["bilingual", "english", "chinese"] | None = None
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
