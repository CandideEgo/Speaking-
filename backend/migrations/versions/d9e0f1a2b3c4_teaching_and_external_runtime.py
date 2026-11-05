"""V2 teaching facts, external connections and recoverable execution metadata.

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: str | None = "c8d9e0f1a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "gateway_lifecycle_intents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("subject_ref", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("receipt", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_gateway_lifecycle_intents_status"), "gateway_lifecycle_intents", ["status"], unique=False)
    op.create_table(
        "external_connections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("host_label", sa.String(length=100), nullable=False),
        sa.Column("granted_scopes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_external_connections_user_id"), "external_connections", ["user_id"], unique=False)
    op.create_table(
        "teaching_access_grants",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "teaching_operations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("operation_namespace", sa.String(length=80), nullable=False),
        sa.Column("operation_id", sa.String(length=64), nullable=False),
        sa.Column("operation_type", sa.String(length=30), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("result_refs", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "operation_namespace", "operation_id", name="uq_teaching_operation_identity"),
    )
    op.create_index(op.f("ix_teaching_operations_user_id"), "teaching_operations", ["user_id"], unique=False)
    op.create_table(
        "exam_analysis_revisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("question_key", sa.String(length=160), nullable=False),
        sa.Column("question_id", sa.String(length=36), nullable=True),
        sa.Column("revision_no", sa.Integer(), nullable=False),
        sa.Column("source_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("normalization_version", sa.String(length=40), nullable=False),
        sa.Column("question_payload", sa.JSON(), nullable=False),
        sa.Column("correct_answer", sa.String(length=10), nullable=False),
        sa.Column("grading_version", sa.String(length=40), nullable=False),
        sa.Column("learning_objectives", sa.JSON(), nullable=False),
        sa.Column("option_analyses", sa.JSON(), nullable=False),
        sa.Column("reviewed_hints", sa.JSON(), nullable=False),
        sa.Column("analysis_payload", sa.JSON(), nullable=False),
        sa.Column("rights_policy", sa.JSON(), nullable=False),
        sa.Column("verification_report", sa.JSON(), nullable=False),
        sa.Column("verification_method", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["exam_questions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("question_key", "revision_no", name="uq_exam_analysis_question_revision"),
    )
    op.create_index(
        op.f("ix_exam_analysis_revisions_question_id"), "exam_analysis_revisions", ["question_id"], unique=False
    )
    op.create_index(
        op.f("ix_exam_analysis_revisions_question_key"), "exam_analysis_revisions", ["question_key"], unique=False
    )
    op.create_index(op.f("ix_exam_analysis_revisions_status"), "exam_analysis_revisions", ["status"], unique=False)
    op.create_table(
        "external_credentials",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("connection_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["connection_id"], ["external_connections.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        op.f("ix_external_credentials_connection_id"), "external_credentials", ["connection_id"], unique=False
    )
    op.create_table(
        "exam_evidence",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("revision_id", sa.String(length=36), nullable=False),
        sa.Column("material_key", sa.String(length=160), nullable=False),
        sa.Column("source_revision", sa.String(length=64), nullable=False),
        sa.Column("unit", sa.String(length=24), nullable=False),
        sa.Column("start", sa.Integer(), nullable=False),
        sa.Column("end", sa.Integer(), nullable=False),
        sa.Column("quote_hash", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["revision_id"], ["exam_analysis_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_exam_evidence_revision_id"), "exam_evidence", ["revision_id"], unique=False)
    op.create_table(
        "user_question_disclosures",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("content_revision_id", sa.String(length=36), nullable=False),
        sa.Column("answer_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("analysis_revealed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["content_revision_id"], ["exam_analysis_revisions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "content_revision_id"),
    )
    op.create_table(
        "teaching_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("current_item_id", sa.String(length=36), nullable=True),
        sa.Column("policy_version", sa.String(length=40), nullable=False),
        sa.Column("source_exam_session_id", sa.String(length=36), nullable=True),
        sa.Column("source_exam_answer_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_exam_answer_id"], ["exam_answers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_exam_session_id"], ["exam_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "source_exam_answer_id", name="uq_teaching_user_source_answer"),
    )
    op.create_index(op.f("ix_teaching_sessions_user_id"), "teaching_sessions", ["user_id"], unique=False)
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("operation_id", sa.String(length=100), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("bound_session_revision", sa.Integer(), nullable=False),
        sa.Column("lease_epoch", sa.Integer(), nullable=False),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sequence", sa.Integer(), nullable=False),
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("queue_deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("execution_deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["teaching_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "operation_id", name="uq_agent_run_user_operation"),
    )
    op.create_index(op.f("ix_agent_runs_session_id"), "agent_runs", ["session_id"], unique=False)
    op.create_index(op.f("ix_agent_runs_status"), "agent_runs", ["status"], unique=False)
    op.create_index(op.f("ix_agent_runs_user_id"), "agent_runs", ["user_id"], unique=False)
    op.create_index(
        "uq_agent_run_active_session",
        "agent_runs",
        ["session_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued','running')"),
        sqlite_where=sa.text("status IN ('queued','running')"),
    )
    op.create_index(
        "uq_agent_run_active_user",
        "agent_runs",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued','running')"),
        sqlite_where=sa.text("status IN ('queued','running')"),
    )
    op.create_table(
        "teaching_feedbacks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("source_connection_id", sa.String(length=36), nullable=True),
        sa.Column("operation_id", sa.String(length=64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("verification", sa.String(length=20), nullable=False),
        sa.Column("source_kind", sa.String(length=30), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["teaching_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_teaching_feedbacks_expires_at"), "teaching_feedbacks", ["expires_at"], unique=False)
    op.create_index(op.f("ix_teaching_feedbacks_user_id"), "teaching_feedbacks", ["user_id"], unique=False)
    op.create_table(
        "teaching_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("question_key", sa.String(length=160), nullable=False),
        sa.Column("content_revision_id", sa.String(length=36), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(length=24), nullable=False),
        sa.Column("next_attempt_no", sa.Integer(), nullable=False),
        sa.Column("last_attempt_id", sa.String(length=36), nullable=True),
        sa.Column("draft_answer", sa.String(length=64), nullable=True),
        sa.Column("draft_revision", sa.Integer(), nullable=False),
        sa.Column("hint_level", sa.Integer(), nullable=False),
        sa.Column("source_exam_answer_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["content_revision_id"], ["exam_analysis_revisions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["session_id"], ["teaching_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_exam_answer_id"], ["exam_answers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "ordinal", name="uq_teaching_item_ordinal"),
        sa.UniqueConstraint("session_id", "question_key", name="uq_teaching_item_question"),
    )
    op.create_index(op.f("ix_teaching_items_session_id"), "teaching_items", ["session_id"], unique=False)
    op.create_table(
        "agent_run_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("session_revision", sa.Integer(), nullable=False),
        sa.Column("safe_payload", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_agent_event_sequence"),
    )
    op.create_index(op.f("ix_agent_run_events_run_id"), "agent_run_events", ["run_id"], unique=False)
    op.create_table(
        "agent_steps",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("lease_epoch", sa.Integer(), nullable=False),
        sa.Column("logical_call_id", sa.String(length=36), nullable=True),
        sa.Column("safe_result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "seq", name="uq_agent_step_run_seq"),
    )
    op.create_index(op.f("ix_agent_steps_run_id"), "agent_steps", ["run_id"], unique=False)
    op.create_table(
        "teaching_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("item_id", sa.String(length=36), nullable=False),
        sa.Column("attempt_no", sa.Integer(), nullable=False),
        sa.Column("user_answer", sa.String(length=64), nullable=True),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column("grading_version", sa.String(length=40), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("answer_origin", sa.String(length=30), nullable=False),
        sa.Column("server_graded", sa.Boolean(), nullable=False),
        sa.Column("assistance_snapshot", sa.JSON(), nullable=False),
        sa.Column("source_exam_answer_id", sa.String(length=36), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["teaching_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_exam_answer_id"], ["exam_answers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("item_id", "attempt_no", name="uq_teaching_attempt_number"),
    )
    op.create_index(op.f("ix_teaching_attempts_item_id"), "teaching_attempts", ["item_id"], unique=False)
    op.create_table(
        "learning_event_outbox",
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("attempt_id", sa.String(length=36), nullable=True),
        sa.Column("business_operation_key", sa.String(length=160), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("flow_id", sa.String(length=36), nullable=False),
        sa.Column("actor", sa.String(length=30), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(length=200), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["attempt_id"], ["teaching_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id"),
        sa.UniqueConstraint("user_id", "business_operation_key", "event_type", name="uq_learning_outbox_operation"),
    )
    op.create_index("ix_learning_outbox_pending", "learning_event_outbox", ["status", "next_attempt_at"], unique=False)


def downgrade() -> None:
    op.drop_table("learning_event_outbox")
    op.drop_table("teaching_attempts")
    op.drop_table("agent_steps")
    op.drop_table("agent_run_events")
    op.drop_table("teaching_items")
    op.drop_table("teaching_feedbacks")
    op.drop_table("agent_runs")
    op.drop_table("teaching_sessions")
    op.drop_table("user_question_disclosures")
    op.drop_table("exam_evidence")
    op.drop_table("external_credentials")
    op.drop_table("exam_analysis_revisions")
    op.drop_table("teaching_operations")
    op.drop_table("teaching_access_grants")
    op.drop_table("external_connections")
    op.drop_table("gateway_lifecycle_intents")
