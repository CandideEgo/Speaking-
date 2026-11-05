"""Transactional exposure operations shared by exams and teaching. Never commits."""

from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question_exposure import UserExposureMappingState, UserQuestionExposure


def question_key_from_identity(level: str, year: int, month: int, set_no: int, number: int) -> str:
    return f"exam:{level}:{year}:{month}:{set_no}:{number}"


def _insert(db: AsyncSession, model):
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        return pg_insert(model)
    if dialect == "sqlite":
        return sqlite_insert(model)
    raise RuntimeError(f"Unsupported exposure database: {dialect}")


async def ensure_exposure_mapping_state(db: AsyncSession, user_id: str) -> UserExposureMappingState:
    await db.execute(
        _insert(db, UserExposureMappingState)
        .values(user_id=user_id, status="unknown")
        .on_conflict_do_nothing(index_elements=["user_id"])
    )
    return (
        await db.execute(
            select(UserExposureMappingState).where(UserExposureMappingState.user_id == user_id).with_for_update()
        )
    ).scalar_one()


async def lock_question_exposure(db: AsyncSession, user_id: str, question_key: str) -> UserQuestionExposure:
    await db.execute(
        _insert(db, UserQuestionExposure)
        .values(user_id=user_id, question_key=question_key, max_hint_level=0, feedback_count=0, origin="unknown")
        .on_conflict_do_nothing(index_elements=["user_id", "question_key"])
    )
    return (
        await db.execute(
            select(UserQuestionExposure)
            .where(UserQuestionExposure.user_id == user_id, UserQuestionExposure.question_key == question_key)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


async def record_answer_available(
    db: AsyncSession,
    user_id: str,
    question_keys: Iterable[str],
    *,
    origin: str,
    occurred_at: datetime,
) -> None:
    for question_key in sorted(set(question_keys)):
        row = await lock_question_exposure(db, user_id, question_key)
        if row.first_answer_available_at is None or _utc(occurred_at) < _utc(row.first_answer_available_at):
            row.first_answer_available_at = occurred_at
            row.origin = origin
        row.updated_at = datetime.now(UTC)
    await db.flush()


async def backfill_user_exposures(db: AsyncSession, user_id: str) -> dict[str, int | str]:
    """Replay provable snapshots only; missing provenance keeps qualification unknown.

    The caller commits each user's batch. Repeating a batch is safe, and no
    current-bank question is used to invent a historical identity or score.
    """
    from app.models.exam_test import ExamAnswer, ExamSession

    state = await ensure_exposure_mapping_state(db, user_id)
    rows = (
        await db.execute(
            select(ExamAnswer, ExamSession.submitted_at)
            .join(ExamSession, ExamAnswer.session_id == ExamSession.id)
            .where(ExamSession.user_id == user_id)
        )
    ).all()
    earliest: dict[str, datetime] = {}
    unmapped = 0
    sessions = (await db.execute(select(ExamSession).where(ExamSession.user_id == user_id))).scalars().all()
    answer_counts: dict[str, int] = {}
    for answer, submitted_at in rows:
        answer_counts[answer.session_id] = answer_counts.get(answer.session_id, 0) + 1
        snap = answer.question or {}
        paper = snap.get("paper")
        key = snap.get("question_key")
        if (
            not isinstance(paper, dict)
            or not {"level", "year", "month", "set_no"}.issubset(paper)
            or not isinstance(snap.get("number"), int)
            or key
            != question_key_from_identity(
                paper["level"], paper["year"], paper["month"], paper["set_no"], snap["number"]
            )
        ):
            # Even an unsubmitted legacy placeholder might have been exported
            # by old code, which did not redact hidden answers.
            unmapped += 1
            continue
        if submitted_at is not None and (key not in earliest or _utc(submitted_at) < _utc(earliest[key])):
            earliest[key] = submitted_at
    for session in sessions:
        count = answer_counts.get(session.id, 0)
        if count != session.question_count or (not count and session.snapshot_schema_version is None):
            unmapped += max(session.question_count - count, 1)
    for key in sorted(earliest):
        await record_answer_available(db, user_id, [key], origin="legacy_exam", occurred_at=earliest[key])
    state.status = "unknown" if unmapped else "complete"
    state.checked_at = datetime.now(UTC)
    await db.flush()
    return {"mapped": len(earliest), "unmapped": unmapped, "status": state.status}
