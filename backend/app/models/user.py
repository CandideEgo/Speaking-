import enum
import uuid
from datetime import UTC, datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlanType(str, enum.Enum):
    free = "free"
    pro = "pro"


class RoleType(str, enum.Enum):
    user = "user"
    admin = "admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # Partial unique index: allow multiple NULLs while still enforcing
        # uniqueness among non-NULL phone values.
        Index(
            "uq_users_phone_partial",
            "phone",
            unique=True,
            postgresql_where=text("phone IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    level: Mapped[str | None] = mapped_column(String(10), nullable=True)  # A1-C2
    plan: Mapped[PlanType] = mapped_column(SAEnum(PlanType, name="plantype"), default=PlanType.free, nullable=False)
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    role: Mapped[RoleType] = mapped_column(SAEnum(RoleType, name="roletype"), default=RoleType.user, nullable=False)
    # Timestamp of the last password change/reset. Tokens issued before this
    # moment are rejected by the auth dependency, effectively invalidating all
    # active sessions when a user changes or resets their password.
    password_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    native_language: Mapped[str] = mapped_column(String(10), default="zh")
    avatar_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(300), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    streak_count: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    # relationships
    # foreign_keys is required because videos has TWO FKs to users (user_id +
    # reviewed_by); this relationship tracks ownership via user_id.
    videos = relationship("Video", foreign_keys="Video.user_id", back_populates="user")
    speaking_attempts = relationship("SpeakingAttempt", back_populates="user")
    learning_records = relationship("LearningRecord", back_populates="user")
    vocabulary = relationship("Vocabulary", back_populates="user")
    orders = relationship("Order", back_populates="user")
    notifications = relationship("Notification", back_populates="user", order_by="Notification.created_at.desc()")
    posts = relationship("Post", back_populates="user", foreign_keys="Post.user_id")
    following = relationship("Follow", back_populates="follower", foreign_keys="Follow.follower_id")
    followers = relationship("Follow", back_populates="followee", foreign_keys="Follow.followee_id")
    preferences = relationship("UserPreferences", back_populates="user", uselist=False)
    favorites = relationship("UserFavorite", back_populates="user", cascade="all, delete-orphan")
    notes = relationship("UserNote", back_populates="user", cascade="all, delete-orphan")
