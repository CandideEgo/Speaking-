"""V2 content revisions and deterministic teaching facts.

Content and attempts are immutable after insertion. Rights/status can withdraw
content without rewriting historical grading. No model usage/cost is duplicated
in these business tables.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    inspect,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class ExamAnalysisRevision(Base):
    __tablename__ = "exam_analysis_revisions"
    __table_args__ = (UniqueConstraint("question_key", "revision_no", name="uq_exam_analysis_question_revision"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    question_key: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    question_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exam_questions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    revision_no: Mapped[int] = mapped_column(Integer, nullable=False)
    source_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    normalization_version: Mapped[str] = mapped_column(String(40), nullable=False, default="unicode-nfc-lf-v1")
    question_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    correct_answer: Mapped[str] = mapped_column(String(10), nullable=False)
    grading_version: Mapped[str] = mapped_column(String(40), nullable=False, default="choice-exact-v1")
    learning_objectives: Mapped[list] = mapped_column(JSON, nullable=False)
    option_analyses: Mapped[dict] = mapped_column(JSON, nullable=False)
    reviewed_hints: Mapped[list] = mapped_column(JSON, nullable=False)
    analysis_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    rights_policy: Mapped[dict] = mapped_column(JSON, nullable=False)
    verification_report: Mapped[dict] = mapped_column(JSON, nullable=False)
    verification_method: Mapped[str] = mapped_column(String(40), nullable=False, default="automatic_consensus")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="auto_verified", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class ExamEvidence(Base):
    __tablename__ = "exam_evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    revision_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_analysis_revisions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    material_key: Mapped[str] = mapped_column(String(160), nullable=False)
    source_revision: Mapped[str] = mapped_column(String(64), nullable=False)
    unit: Mapped[str] = mapped_column(String(24), nullable=False, default="unicode_codepoint")
    start: Mapped[int] = mapped_column(Integer, nullable=False)
    end: Mapped[int] = mapped_column(Integer, nullable=False)
    quote_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="answer_support")


class TeachingSession(Base):
    __tablename__ = "teaching_sessions"
    __table_args__ = (UniqueConstraint("user_id", "source_exam_answer_id", name="uq_teaching_user_source_answer"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_item_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    policy_version: Mapped[str] = mapped_column(String(40), nullable=False, default="teaching-v1")
    source_exam_session_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exam_sessions.id", ondelete="SET NULL"), nullable=True
    )
    source_exam_answer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exam_answers.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class TeachingItem(Base):
    __tablename__ = "teaching_items"
    __table_args__ = (
        UniqueConstraint("session_id", "ordinal", name="uq_teaching_item_ordinal"),
        UniqueConstraint("session_id", "question_key", name="uq_teaching_item_question"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teaching_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_key: Mapped[str] = mapped_column(String(160), nullable=False)
    content_revision_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_analysis_revisions.id", ondelete="RESTRICT"), nullable=False
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    state: Mapped[str] = mapped_column(String(24), nullable=False, default="awaiting_answer")
    next_attempt_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_attempt_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    draft_answer: Mapped[str | None] = mapped_column(String(64), nullable=True)
    draft_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hint_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_exam_answer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exam_answers.id", ondelete="SET NULL"), nullable=True
    )


class TeachingAttempt(Base):
    __tablename__ = "teaching_attempts"
    __table_args__ = (UniqueConstraint("item_id", "attempt_no", name="uq_teaching_attempt_number"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teaching_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False)
    user_answer: Mapped[str | None] = mapped_column(String(64), nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    grading_version: Mapped[str] = mapped_column(String(40), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    answer_origin: Mapped[str] = mapped_column(String(30), nullable=False)
    server_graded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    assistance_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    source_exam_answer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exam_answers.id", ondelete="SET NULL"), nullable=True
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class UserQuestionDisclosure(Base):
    __tablename__ = "user_question_disclosures"
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    content_revision_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_analysis_revisions.id", ondelete="CASCADE"), primary_key=True
    )
    answer_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    analysis_revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str] = mapped_column(String(40), nullable=False, default="none")


class TeachingOperation(Base):
    __tablename__ = "teaching_operations"
    __table_args__ = (
        UniqueConstraint("user_id", "operation_namespace", "operation_id", name="uq_teaching_operation_identity"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    operation_namespace: Mapped[str] = mapped_column(String(80), nullable=False)
    operation_id: Mapped[str] = mapped_column(String(64), nullable=False)
    operation_type: Mapped[str] = mapped_column(String(30), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")
    result_refs: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class TeachingFeedback(Base):
    __tablename__ = "teaching_feedbacks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teaching_sessions.id", ondelete="CASCADE"), nullable=False
    )
    source_connection_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    operation_id: Mapped[str] = mapped_column(String(64), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    verification: Mapped[str] = mapped_column(String(20), nullable=False, default="unverified")
    source_kind: Mapped[str] = mapped_column(String(30), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class LearningEventOutbox(Base):
    __tablename__ = "learning_event_outbox"
    __table_args__ = (
        UniqueConstraint("user_id", "business_operation_key", "event_type", name="uq_learning_outbox_operation"),
        Index("ix_learning_outbox_pending", "status", "next_attempt_at"),
    )
    event_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    attempt_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("teaching_attempts.id", ondelete="CASCADE"), nullable=True
    )
    business_operation_key: Mapped[str] = mapped_column(String(160), nullable=False)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    flow_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    last_error: Mapped[str | None] = mapped_column(String(200), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


@event.listens_for(ExamAnalysisRevision, "before_update")
def _immutable_content(_mapper, _connection, target):
    mutable = {"status", "rights_policy", "question_id"}
    for attr in inspect(target).attrs:
        if attr.key not in mutable and attr.history.has_changes():
            raise ValueError("Published content is immutable; create a new revision")


@event.listens_for(ExamEvidence, "before_update")
@event.listens_for(TeachingAttempt, "before_update")
def _immutable_fact(_mapper, _connection, target):
    # SET NULL caused by removal of an old exam link must not rewrite grading.
    for attr in inspect(target).attrs:
        if attr.key != "source_exam_answer_id" and attr.history.has_changes():
            raise ValueError("Teaching facts are append-only")
