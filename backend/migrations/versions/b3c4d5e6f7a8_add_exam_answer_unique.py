"""exam_answers 补 (session_id, question_id) 唯一约束。

A06（BE-03 试卷提交原子性）：并发提交现在由 ``exam_service._claim_submit``
的条件 UPDATE 裁决；这一层唯一约束是数据层兜底，防止将来任何写入路径把同一份
作答的答案写两遍——重复答案会抬高错题本计数与成绩统计。

历史重复**先诊断再迁移**：修复前的并发提交会留下「同一会话同一题目多行答案」。
本迁移不删除任何数据，发现重复即中止并打印受影响的会话；清理属于单独需要授权的
操作。``question_id`` 为 NULL 的早期快照行不受影响（唯一约束允许任意多个 NULL）。

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-10-29 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b3c4d5e6f7a8"
down_revision: str | None = "a2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINT = "uq_exam_answers_session_question"


def upgrade() -> None:
    duplicate_rows = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT session_id, question_id, count(*) AS row_count "
                "FROM exam_answers WHERE question_id IS NOT NULL "
                "GROUP BY session_id, question_id HAVING count(*) > 1 "
                "ORDER BY session_id"
            )
        )
        .all()
    )
    if duplicate_rows:
        detail = "\n".join(
            f"  session={row.session_id} question={row.question_id} rows={row.row_count}" for row in duplicate_rows
        )
        raise RuntimeError(
            "exam_answers 里存在同一会话同一题目的重复答案，无法建立唯一约束。\n"
            "这些行来自 A06 修复前的提交竞态，需先单独确认范围并清理（本迁移不会自动删除）：\n"
            f"{detail}"
        )
    op.create_unique_constraint(CONSTRAINT, "exam_answers", ["session_id", "question_id"])


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, "exam_answers", type_="unique")
