"""Fail when the SQLAlchemy models grow new drift from the Alembic schema.

``alembic check`` against the developer database reports a long-standing
backlog (retired tables, legacy indexes, comments, a few missing constraints).
That backlog is listed below with a reason per entry: the point of this gate is
that **new** drift cannot sneak in silently, and the known debt stays visible
until a deliberate, data-safe migration retires it.

Usage (requires an already-migrated database):
    python scripts/check_schema_drift.py          # gate: exit 1 on new drift
    python scripts/check_schema_drift.py --list   # print every current diff

CI runs this in the e2e job right after ``alembic upgrade head``. Local:

    DATABASE_URL=postgresql+asyncpg://... python scripts/check_schema_drift.py
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# scripts/ is not on sys.path when invoked as `python scripts/...`; add the
# backend root so `app.*` imports resolve the same way they do under pytest.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app import models
from app.core.config import get_settings
from app.core.database import Base

# Known debt: diff key -> why it is allowed for now. Every entry should either
# disappear when its migration lands, or stay until a product decision is made.
KNOWN_DRIFT: dict[str, str] = {
    # Retired speaking/quiz features: tables were removed from the models but
    # never dropped (history export + account deletion still reference them).
    "remove_table:rubric_criteria": "retired speaking rubric feature; table kept for history export",
    "remove_table:speaking_attempt_scores": "retired speaking feature; table kept for history export",
    "remove_table:speaking_rubrics": "retired speaking feature; table kept for history export",
    "remove_table:video_practice_questions": "retired practice feature; table kept for history export",
    "remove_index:speaking_attempt_scores:ix_speaking_attempt_scores_speaking_attempt_id": "index on a retired table",
    "remove_index:video_practice_questions:ix_video_practice_questions_video_id": "index on a retired table",
    "remove_fk:speaking_attempts:rubric_id": "FK to a retired table kept in the DB",
    # Comment text drifted after model comments changed (cosmetic metadata).
    "modify_comment:admin_settings.wechat_shop_url": "comment-only metadata drift",
    "modify_comment:admin_settings.payments_enabled": "comment-only metadata drift",
    "modify_comment:admin_settings.quality_block_threshold": "comment-only metadata drift",
    "modify_comment:admin_settings.quality_warn_threshold": "comment-only metadata drift",
    "modify_comment:jinshuju_payments.tier_name": "comment-only metadata drift",
    "modify_comment:jinshuju_payments.amount_fen": "comment-only metadata drift",
    # Model says NOT NULL, DB column is nullable; backfill decision pending.
    "modify_nullable:subtitle_resegment_snapshots.applied_at:True->False": "DB nullable vs model NOT NULL; backfill decision pending",
    "modify_nullable:video_quality_reports.created_at:True->False": "DB nullable vs model NOT NULL; backfill decision pending",
    # Model narrowed the answer column to String(10), DB is TEXT (the safer one).
    "modify_type:exam_answers.user_answer": "model String(10) vs DB TEXT; align the model to TEXT in a follow-up",
    # Missing constraints/indexes/FKs the schema never got. A migration must
    # pre-check duplicates / nulls before adding them, so it is deferred.
    "add_constraint:exam_sentence_words:uq_exam_sentence_word": "missing unique(sentence_id, word); migration needs duplicate pre-check",
    "add_fk:exam_sentence_words:sentence_id": "missing cascade FK; migration needs orphan pre-check",
    "add_constraint:exam_word_freq:uq_exam_word_freq_word_level": "missing unique(word, level); migration needs duplicate pre-check",
    "add_index:notifications:ix_notifications_dedup": "missing dedup index (performance-only)",
    "add_fk:videos:reviewed_by": "missing ON DELETE SET NULL FK; migration needs orphan pre-check",
    # subtitles.video_id FK needs ON DELETE CASCADE; replace in a migration.
    "remove_fk:subtitles:video_id": "old FK without CASCADE; replacement migration deferred",
    "add_fk:subtitles:video_id": "new cascade FK; replacement migration deferred",
    # Stale indexes left by older migrations (models dropped them).
    "remove_index:exam_sessions:ix_exam_sessions_mode": "legacy index kept in DB; harmless",
    "remove_index:exam_sessions:ix_exam_sessions_video_id": "legacy index kept in DB; harmless",
    "remove_index:user_video_unlocks:ix_user_video_unlocks_user_unlocked_at": "legacy index kept in DB; harmless",
    "remove_index:videos:ix_videos_source_url": "legacy index kept in DB; harmless",
    # vocabulary index was renamed in the model but not in the DB.
    "remove_index:vocabulary:ix_vocab_video_id": "old index name; rename migration deferred",
    "add_index:vocabulary:ix_vocabulary_video_id": "new index name; rename migration deferred",
}


def _table_name(obj) -> str:
    return getattr(getattr(obj, "table", None), "name", "?") or "?"


def _diff_key(diff) -> str:
    if isinstance(diff, list):
        # modify_* comes as a one-element list of tuples.
        item = diff[0]
        kind, _schema, table, column, _kwargs, old, new = item
        if kind == "modify_nullable":
            return f"{kind}:{table}.{column}:{old}->{new}"
        return f"{kind}:{table}.{column}"
    kind = diff[0]
    if kind in ("add_table", "remove_table"):
        return f"{kind}:{diff[1].name}"
    if kind in ("add_index", "remove_index"):
        index = diff[1]
        return f"{kind}:{_table_name(index)}:{index.name}"
    if kind in ("add_constraint", "remove_constraint"):
        constraint = diff[1]
        name = constraint.name or ",".join(c.name for c in constraint.columns)
        return f"{kind}:{_table_name(constraint)}:{name}"
    if kind in ("add_fk", "remove_fk"):
        fk = diff[1]
        cols = ",".join(c.name for c in fk.columns)
        return f"{kind}:{_table_name(fk)}:{cols}"
    return f"{kind}:{diff[1]!r}"


async def _collect_diffs(database_url: str) -> list[str]:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as conn:
            has_version = await conn.scalar(text("SELECT to_regclass('alembic_version')"))
            if has_version is None:
                raise SystemExit("database has no alembic_version — run `alembic upgrade head` first")
            diffs = await conn.run_sync(
                lambda sync_conn: compare_metadata(MigrationContext.configure(sync_conn), Base.metadata)
            )
    finally:
        await engine.dispose()
    return [_diff_key(d) for d in diffs]


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="print current diff keys")
    args = parser.parse_args()

    settings = get_settings()
    keys = await _collect_diffs(settings.database_url)

    if args.list:
        for key in sorted(keys):
            print(key, "  #", KNOWN_DRIFT.get(key, "*** NOT ALLOWLISTED ***"))
        return 0

    unexpected = sorted(set(keys) - set(KNOWN_DRIFT))
    if unexpected:
        print("New model/migration drift detected:")
        for key in unexpected:
            print(f"  - {key}")
        print(
            "\nFix the model/migration mismatch, or add a reviewed entry to KNOWN_DRIFT in scripts/check_schema_drift.py."
        )
        return 1

    known_seen = sorted(set(keys) & set(KNOWN_DRIFT))
    print(f"Schema drift gate OK: {len(known_seen)} known entries, 0 new.")
    stale = sorted(set(KNOWN_DRIFT) - set(keys))
    if stale:
        print(f"Note: {len(stale)} allowlist entries no longer reproduce (cleanup candidate):")
        for key in stale:
            print(f"  - {key}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
