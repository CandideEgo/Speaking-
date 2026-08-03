"""Learning plan models — AI-driven daily learning plans, structured learning
events, and user learning profiles. Implements ADR-0012 Decision 3.

Key concepts:
  UserLearningProfile — aggregated learning profile (streak, mastery breakdown,
      daily goal tracking). One-to-one with User.
  LearningPlan — a daily plan with ordered items. Cached per day.
  LearningPlanItem — a single actionable item in a plan (review words, watch
      video, practice, vocab drill).
  LearningEvent — structured semantic learning events (distinct from raw
      BehaviorEvent). Feeds profile aggregation and recommendation system.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# UserLearningProfile
# ---------------------------------------------------------------------------


class UserLearningProfile(Base):
    """Aggregated learning profile for a user. One-to-one with User.

    Contains cached aggregations (mastery_by_level, streak) and daily
    progress counters (today_words_learned, today_minutes_spent) that are
    incrementally updated via LearningEvent emission.
    """

    __tablename__ = "user_learning_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_learning_profile_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Estimated CEFR level, derived from vocabulary mastery distribution
    estimated_level: Mapped[str | None] = mapped_column(String(10), nullable=True)  # A1-C2

    # Weekly cycle tracking (north-star metric per ADR-0012)
    weekly_cycles_completed: Mapped[int] = mapped_column(Integer, default=0)
    weekly_cycles_started: Mapped[int] = mapped_column(Integer, default=0)
    current_week_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Streak tracking (replaces dropped User.streak_count / longest_streak)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Per-exam-level mastery breakdown (cached aggregation from Vocabulary)
    # {"cet4": {"new": 5, "learning": 3, "reviewing": 2, "mastered": 10, "due": 1}, ...}
    mastery_by_level: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Strengths/weaknesses (cached from practice accuracy)
    # {"strong": ["cet4"], "weak": ["cet6"]}
    strengths: Mapped[list | None] = mapped_column(JSON, nullable=True)
    weaknesses: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Daily goal tracking (current day snapshot, incrementally updated)
    today_words_learned: Mapped[int] = mapped_column(Integer, default=0)
    today_minutes_spent: Mapped[int] = mapped_column(Integer, default=0)
    today_goal_met: Mapped[bool] = mapped_column(Boolean, default=False)
    today_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Shadowing (sentence read-along) cumulative count
    total_shadowing_count: Mapped[int] = mapped_column(Integer, default=0)

    last_plan_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
    )

    # relationships
    user = relationship("User", back_populates="learning_profile")


# ---------------------------------------------------------------------------
# LearningPlan
# ---------------------------------------------------------------------------


class LearningPlan(Base):
    """A daily learning plan for a user. Cached per day — calling
    generate_daily_plan again returns the same plan.

    generation_method: "rule" for the rule-based engine (free),
                       "ai" for the AI-powered engine (Pro).
    """

    __tablename__ = "learning_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    plan_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    generation_method: Mapped[str] = mapped_column(String(10), default="rule")  # rule / ai

    # Summary stats for the plan
    total_review_words: Mapped[int] = mapped_column(Integer, default=0)
    total_new_words: Mapped[int] = mapped_column(Integer, default=0)
    total_practice_items: Mapped[int] = mapped_column(Integer, default=0)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=0)

    # Completion tracking
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    user = relationship("User", back_populates="learning_plans")
    items = relationship(
        "LearningPlanItem",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="LearningPlanItem.sort_order",
    )


# ---------------------------------------------------------------------------
# LearningPlanItem
# ---------------------------------------------------------------------------


class LearningPlanItem(Base):
    """A single actionable item in a learning plan.

    item_type determines what action the frontend should take:
      "review_words"  — review due vocabulary words (no video_id needed)
      "watch_video"   — watch a specific video (video_id set)
      "practice"      — practice session for a video (video_id set)
      "vocab_drill"   — vocabulary drill from user's word list (no video_id)

    item_config is a JSON dict with type-specific parameters:
      review_words: {"count": 5, "exam_level": "cet4"}
      watch_video:  {"title": "...", "thumbnail_url": "...", "progress": 0.5}
      practice:     {"exam_level": "cet4", "item_count": 10}
      vocab_drill:  {"count": 10, "due_only": true}
    """

    __tablename__ = "learning_plan_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    plan_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("learning_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    # Item type — determines frontend action
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # "review_words" | "watch_video" | "practice" | "vocab_drill"

    # Polymorphic reference to source entity
    video_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("videos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Type-specific configuration
    item_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Completion tracking
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # relationships
    plan = relationship("LearningPlan", back_populates="items")


# ---------------------------------------------------------------------------
# LearningEvent
# ---------------------------------------------------------------------------


class LearningEvent(Base):
    """Structured semantic learning event — distinct from raw BehaviorEvent.

    BehaviorEvent captures raw interactions (click, play, pause, seek, etc.)
    for analytics and debugging. LearningEvent captures high-level learning
    actions (completed_video, learned_words, practiced_items, reviewed_words)
    that feed the learning profile, daily goal tracking, and the recommendation
    system (ADR-0011 behavior_events P0 blocker).

    event_date is the user's local date (computed server-side from UTC +
    timezone), used for daily aggregation and streak computation.
    """

    __tablename__ = "learning_events"
    __table_args__ = (
        Index("ix_learning_events_user_date", "user_id", "event_date"),
        Index("ix_learning_events_user_type", "user_id", "event_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Semantic event types
    # "completed_video" | "learned_words" | "practiced_items" | "reviewed_words"
    # "completed_plan" | "met_daily_goal"
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)

    # Quantified value (e.g. 5 words learned, 10 items practiced)
    event_value: Mapped[int] = mapped_column(Integer, default=1)

    # Optional reference to source entity
    video_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("videos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    plan_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("learning_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Additional context
    event_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # User's local date for daily aggregation
    event_date: Mapped[date] = mapped_column(Date, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # relationships
    user = relationship("User", back_populates="learning_events")
