"""Pydantic schemas for the learning plan API (ADR-0012)."""

from typing import Literal

from pydantic import BaseModel, Field

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
    # 今日累计已学词数（含加练）。The vocabulary drill increments it through
    # LearningEvent since DEC-053; before that it only moved on practice-quiz
    # submission, so the number sat at 0 for a user who only drilled.
    today_words_learned: int = 0


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
