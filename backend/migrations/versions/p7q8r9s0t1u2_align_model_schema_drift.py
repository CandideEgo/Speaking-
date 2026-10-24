"""Align the schema with the models for the known, data-safe drift (BE-03).

Some databases (e.g. the long-lived dev DB) are missing constraints that the
migration history *does* create on a fresh database — the schema was likely
reshaped before those revisions landed. This migration is therefore
conditional: it adds only what is absent and renames the vocabulary index only
when the old name is present.

Retired tables, legacy comment text and the stale indexes are left alone on
purpose. Adding a UNIQUE constraint to a table with duplicates fails the
migration, so each addition is preceded by a data check that aborts with a
clear message. That is deliberate: silently deleting rows to make a migration
pass would lose user data. Operators run the reported cleanup query, then
re-run the migration.

Revision ID: p7q8r9s0t1u2
Revises: o6p7q8r9s0t1
"""

import sqlalchemy as sa
from alembic import op

revision = "p7q8r9s0t1u2"
down_revision = "o6p7q8r9s0t1"
branch_labels = None
depends_on = None


def _scalar(sql: str) -> int:
    return int(op.get_bind().execute(sa.text(sql)).scalar() or 0)


def _abort_if(rows: int, message: str) -> None:
    if rows:
        raise RuntimeError(f"BE-03 migration aborted: {message} (found {rows})")


def _unique_names(inspector: sa.Inspector, table: str) -> set[str]:
    return {c["name"] for c in inspector.get_unique_constraints(table) if c.get("name")}


def _fk_columns(inspector: sa.Inspector, table: str) -> dict[str, dict]:
    return {tuple(fk["constrained_columns"]): fk for fk in inspector.get_foreign_keys(table)}


def _index_names(inspector: sa.Inspector, table: str) -> set[str]:
    return {i["name"] for i in inspector.get_indexes(table) if i.get("name")}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # -- exam_sentence_words: unique(sentence_id, word) + cascade FK ----------
    if "uq_exam_sentence_word" not in _unique_names(inspector, "exam_sentence_words"):
        _abort_if(
            _scalar(
                "SELECT count(*) FROM ("
                "  SELECT sentence_id, word FROM exam_sentence_words"
                "  GROUP BY sentence_id, word HAVING count(*) > 1"
                ") dup"
            ),
            "duplicate exam_sentence_words rows; dedupe before adding uq_exam_sentence_word",
        )
        op.create_unique_constraint("uq_exam_sentence_word", "exam_sentence_words", ["sentence_id", "word"])
    if ("sentence_id",) not in _fk_columns(inspector, "exam_sentence_words"):
        _abort_if(
            _scalar(
                "SELECT count(*) FROM exam_sentence_words w"
                " LEFT JOIN exam_sentences s ON s.id = w.sentence_id"
                " WHERE s.id IS NULL"
            ),
            "orphan exam_sentence_words.sentence_id rows; delete or remap before adding the FK",
        )
        op.create_foreign_key(
            "exam_sentence_words_sentence_id_fkey",
            "exam_sentence_words",
            "exam_sentences",
            ["sentence_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # -- exam_word_freq: unique(word, level) ---------------------------------
    if "uq_exam_word_freq_word_level" not in _unique_names(inspector, "exam_word_freq"):
        _abort_if(
            _scalar(
                "SELECT count(*) FROM ("
                "  SELECT word, level FROM exam_word_freq"
                "  GROUP BY word, level HAVING count(*) > 1"
                ") dup"
            ),
            "duplicate exam_word_freq rows; dedupe before adding uq_exam_word_freq_word_level",
        )
        op.create_unique_constraint("uq_exam_word_freq_word_level", "exam_word_freq", ["word", "level"])

    # -- notifications: dedup index declared in the model --------------------
    if "ix_notifications_dedup" not in _index_names(inspector, "notifications"):
        op.create_index(
            "ix_notifications_dedup",
            "notifications",
            ["user_id", "type", "related_url", "is_read"],
        )

    # -- videos.reviewed_by: reviewer deleted -> keep the video --------------
    if ("reviewed_by",) not in _fk_columns(inspector, "videos"):
        _abort_if(
            _scalar(
                "SELECT count(*) FROM videos v"
                " LEFT JOIN users u ON u.id = v.reviewed_by"
                " WHERE v.reviewed_by IS NOT NULL AND u.id IS NULL"
            ),
            "orphan videos.reviewed_by rows; remap before adding the FK",
        )
        op.create_foreign_key(
            "videos_reviewed_by_fkey",
            "videos",
            "users",
            ["reviewed_by"],
            ["id"],
            ondelete="SET NULL",
        )

    # -- subtitles.video_id: deleting a video must delete its subtitles ------
    subtitle_fk = _fk_columns(inspector, "subtitles").get(("video_id",))
    if subtitle_fk is not None and subtitle_fk.get("options", {}).get("ondelete") != "CASCADE":
        op.drop_constraint(subtitle_fk["name"], "subtitles", type_="foreignkey")
        op.create_foreign_key(
            "subtitles_video_id_fkey",
            "subtitles",
            "videos",
            ["video_id"],
            ["id"],
            ondelete="CASCADE",
        )
    elif subtitle_fk is None:
        op.create_foreign_key(
            "subtitles_video_id_fkey",
            "subtitles",
            "videos",
            ["video_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # -- vocabulary index was renamed in the model ---------------------------
    vocabulary_indexes = _index_names(inspector, "vocabulary")
    if "ix_vocab_video_id" in vocabulary_indexes:
        op.execute("ALTER INDEX ix_vocab_video_id RENAME TO ix_vocabulary_video_id")
    elif "ix_vocabulary_video_id" not in vocabulary_indexes:
        op.create_index("ix_vocabulary_video_id", "vocabulary", ["video_id"])

    # -- column comments declared in the models (metadata only) --------------
    for table, columns in _MODEL_COMMENTS.items():
        for column, comment in columns.items():
            op.execute(f"COMMENT ON COLUMN {table}.{column} IS '{comment}'")


_MODEL_COMMENTS = {
    "admin_settings": {
        "wechat_shop_url": "Pro 购买入口 URL，空则显示「即将开通」",
        "payments_enabled": "非经营性平台默认关闭，仅兑换码激活",
        "quality_block_threshold": "覆盖率低于此值 -> quality_blocked",
        "quality_warn_threshold": "覆盖率低于此值 -> quality_warning",
    },
    "jinshuju_payments": {
        "tier_name": "月卡 / 季卡 / 年卡",
        "amount_fen": "实付金额（分）",
    },
}


def downgrade():
    """Intentionally irreversible.

    This migration converges the schema onto the models; some databases
    already had these constraints from their migration history and others did
    not, so "undo" cannot tell which additions were ours. Dropping them on a
    rollback would silently remove UNIQUE/FK protections that may predate this
    revision, so the downgrade leaves the aligned schema in place.
    """
    pass
