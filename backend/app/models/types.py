"""Custom SQLAlchemy column types shared by the models.

Only one so far: the ``word_levels`` JSON column. It lives here rather than in
``app/core/exam_levels.py`` because that module must keep importing nothing —
``scripts/generate_exam_levels.py`` runs it on a bare Python 3.12 with no venv
to regenerate the frontend taxonomy and is used as a CI gate.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import JSON
from sqlalchemy.types import TypeDecorator

from app.core.exam_levels import normalize_word_levels


class WordLevelsJSON(TypeDecorator):
    """``JSON`` column carrying ``{surface token: [level keys]}`` in canonical shape.

    Why a column type instead of the pydantic validator alone
    --------------------------------------------------------
    ``Subtitle.word_levels`` has five writer paths and at least eleven direct
    assignment sites (the ingest pipeline, the admin editor, the resegment and
    recompute services, publish/seed copies). The pydantic validator only ever
    ran on the admin-editor request body; every other writer assigned to the
    column directly, and a plain ``JSON`` column validates nothing — which is
    how two shapes of the same field ended up in the database and a tolerance
    for both got copy-pasted into every consumer.

    This type is the one choke point all writers pass through, so
    ``normalize_word_levels`` runs on the way in and on the way out.

    What this does *not* enforce
    ----------------------------
    Level-key validity. That stays a request-validation rule in
    ``app/schemas/video.py`` (422 with the allowed set): the shape is a storage
    invariant, a typo'd key is the caller's mistake, and a read must never
    raise on a row an older writer left behind. Key names here come from ECDICT
    tags mapped to canonical keys (``app/services/ecdict.py``), so no ingest
    path can produce an unknown one.

    Empty and NULL
    --------------
    "No annotations" stores as **SQL NULL**, and readers have always treated it
    that way (``sub.word_levels or {}``, ``WordLevelsUpdate`` passing null to
    clear). That has to be forced: ``JSON`` defaults to ``none_as_null=False``,
    which serializes a Python ``None`` into a JSON ``null`` *value* — so every
    ``levels or None`` write left a row that ``IS NOT NULL`` counts as
    annotated, and ``jsonb_each`` (the shape census in
    ``scripts/backfill_word_levels.py``) raises outright on one. Measured on the
    project's own asyncpg/Postgres, both before and after this type existed.
    Legacy JSON-null rows still read back as ``None`` — indistinguishable from
    SQL NULL to every Python caller — and the backfill converts them.
    """

    impl = JSON
    cache_ok = True

    def __init__(self, **kwargs: Any) -> None:
        # Forwarded to the impl (`JSON`); explicit kwargs still win.
        kwargs.setdefault("none_as_null", True)
        super().__init__(**kwargs)

    def process_bind_param(self, value: Any, dialect: Any) -> dict[str, list[str]] | None:
        return normalize_word_levels(value) or None

    def process_result_value(self, value: Any, dialect: Any) -> dict[str, list[str]] | None:
        if value is None:
            return None
        return normalize_word_levels(value)
