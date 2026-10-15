"""``Subtitle.word_levels`` stores exactly one shape — the canonical one.

Why these exist: the pydantic validator behind the admin editor guarded one of
the five writer paths, and a plain ``JSON`` column validates nothing, so two
shapes of the same field reached the database and a tolerance for both was
copy-pasted into every consumer. The fix puts shape enforcement on the column
(``app.models.types.WordLevelsJSON``). These tests are the machine check on
that, at three levels: the column really uses that type, the DDL is unchanged,
and a real database round trip canonicalizes in both directions.
"""

import json

import pytest
from sqlalchemy import select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.models.subtitle import Subtitle
from app.models.types import WordLevelsJSON

_READ_RAW = text("SELECT word_levels FROM subtitles WHERE id = :id")


def _subtitle(**overrides: object) -> Subtitle:
    fields: dict[str, object] = {
        "video_id": "test-video-id",
        "start_time": 0,
        "end_time": 2,
        "text_en": "Hello world",
        "sentence_index": 0,
    }
    fields.update(overrides)
    return Subtitle(**fields)


def test_column_carries_the_normalizing_type():
    assert isinstance(Subtitle.__table__.c.word_levels.type, WordLevelsJSON)


def test_column_ddl_is_still_plain_json():
    """The decorator changes what is stored, not what the column is — so no
    migration is implied by it."""
    ddl = str(CreateTable(Subtitle.__table__).compile(dialect=postgresql.dialect()))
    assert "word_levels JSON" in ddl


@pytest.mark.asyncio
async def test_bind_writes_the_canonical_shape(db_session):
    """The legacy ``str`` shape can no longer reach the column even from a
    writer that bypasses every schema."""
    sub = _subtitle(word_levels={"fox": "cet4", "cat": ["cet6"], "junk": 42})
    db_session.add(sub)
    await db_session.commit()

    raw = (await db_session.execute(_READ_RAW, {"id": sub.id})).scalar_one()
    assert json.loads(raw) == {"fox": ["cet4"], "cat": ["cet6"]}


@pytest.mark.asyncio
async def test_empty_annotations_bind_as_null(db_session):
    """Writers have always written ``levels or None``, so "nothing annotatable"
    must store as NULL rather than an empty object."""
    sub = _subtitle(word_levels={"junk": 42})
    db_session.add(sub)
    await db_session.commit()

    assert (await db_session.execute(_READ_RAW, {"id": sub.id})).scalar_one() is None


@pytest.mark.asyncio
async def test_read_normalizes_a_row_written_before_the_type_existed(db_session):
    """A historical row is canonicalized on the way out, so consumers do not
    each need their own tolerance for the old shape."""
    sub = _subtitle()
    db_session.add(sub)
    await db_session.commit()
    sub_id = sub.id  # read before expiring — an expired attribute is a sync load

    # Straight into the column, the way a pre-fix writer would have left it.
    await db_session.execute(
        text("UPDATE subtitles SET word_levels = :payload WHERE id = :id"),
        {"payload": json.dumps({"fox": "cet4"}), "id": sub_id},
    )
    await db_session.commit()
    # Without this the select would return the identity-mapped object, whose
    # attributes still hold the assigned value — the read path would go untested.
    db_session.expire_all()

    fetched = (await db_session.execute(select(Subtitle).where(Subtitle.id == sub_id))).scalar_one()
    assert fetched.word_levels == {"fox": ["cet4"]}
