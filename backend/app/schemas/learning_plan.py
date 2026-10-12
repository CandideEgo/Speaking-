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
    # 用户本地日期与本地小时，由 `app.services.local_time` 按同一时区基准算出
    # （BUG-16 / DEC-079）。首页的问候与日期标签曾用浏览器时区自己算「今天」，
    # 与连续天数所在的学习时区可能差一天（BUG-05）。
    local_date: str
    local_hour: int


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
