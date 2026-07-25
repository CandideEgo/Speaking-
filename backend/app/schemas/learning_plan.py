"""Pydantic schemas for the learning plan API (ADR-0012)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Plan item
# ---------------------------------------------------------------------------


class PlanItemResponse(BaseModel):
    id: str
    sort_order: int
    item_type: str  # "review_words" | "watch_video" | "practice" | "vocab_drill"
    video_id: str | None = None
    item_config: dict | None = None
    completed: bool = False
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------


class PlanResponse(BaseModel):
    id: str
    plan_date: date
    generation_method: str  # "rule" | "ai"
    total_review_words: int
    total_new_words: int
    total_practice_items: int
    estimated_minutes: int
    completed: bool
    items: list[PlanItemResponse]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Daily progress
# ---------------------------------------------------------------------------


class DailyProgressResponse(BaseModel):
    today_words_learned: int
    today_minutes_spent: int
    daily_goal_type: str  # "words" | "minutes"
    daily_goal_value: int
    goal_met: bool
    goal_progress: float  # 0.0-1.0
    current_streak: int
    weekly_cycles_completed: int


# ---------------------------------------------------------------------------
# Learning profile
# ---------------------------------------------------------------------------


class LearningProfileResponse(BaseModel):
    estimated_level: str | None = None
    current_streak: int
    longest_streak: int
    weekly_cycles_completed: int
    mastery_by_level: dict | None = None
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    milestones: list["MilestoneResponse"] | None = None


# ---------------------------------------------------------------------------
# Combined today response
# ---------------------------------------------------------------------------


class TodayPlanResponse(BaseModel):
    plan: PlanResponse | None = None
    progress: DailyProgressResponse
    profile: LearningProfileResponse


# ---------------------------------------------------------------------------
# Request / response for item completion
# ---------------------------------------------------------------------------


class PlanItemCompleteRequest(BaseModel):
    result: dict | None = None  # Optional: {"correct": 8, "total": 10}


class PlanItemCompleteResponse(BaseModel):
    completed: bool
    plan_completed: bool
    goal_met: bool


# ---------------------------------------------------------------------------
# Plan history summary
# ---------------------------------------------------------------------------


class PlanHistoryItem(BaseModel):
    id: str
    plan_date: str
    generation_method: str
    completed: bool
    total_review_words: int
    total_new_words: int
    total_practice_items: int
    estimated_minutes: int
    items_completed: int
    items_total: int


# ---------------------------------------------------------------------------
# AI plan generation
# ---------------------------------------------------------------------------


class AIPlanGenerateResponse(BaseModel):
    task_id: str | None = None
    status: str  # "generating" | "completed" | "failed"
    plan_id: str | None = None


# ---------------------------------------------------------------------------
# Milestones (Sprint 4)
# ---------------------------------------------------------------------------


class MilestoneResponse(BaseModel):
    id: str
    milestone_type: str
    achieved_at: str | None = None
    metadata_json: dict | None = None


class MasterySnapshotItem(BaseModel):
    date: str
    mastery_json: dict | None = None


class MasteryTrendResponse(BaseModel):
    snapshots: list[MasterySnapshotItem]
