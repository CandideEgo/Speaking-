"""Tests for the pre-generated AI word notes (Phase D: preheated gloss)."""

from unittest.mock import AsyncMock, patch

import pytest

# --- AIService.generate_word_notes_bulk ---


@pytest.mark.asyncio
async def test_generate_word_notes_bulk_alignment(fake_redis, monkeypatch):
    """The returned notes align to the input order, with empty fields for missing entries."""
    from app.core.config import get_settings
    from app.services.ai_service import AIService

    # Single-engine (agnes only) so the test exercises the mockable _chat path.
    monkeypatch.setattr(get_settings(), "prewarm_engines", "agnes")
    service = AIService()
    raw = (
        '{"notes": ['
        '{"word":"graphic","contextual_note":"图像的","pitfalls":"graphic 形容词,graph 名词","knowledge":"graphic design 平面设计"},'
        '{"word":"design","contextual_note":"设计","pitfalls":"","knowledge":""},'
        '{"word":"absent","contextual_note":"","pitfalls":"","knowledge":""}'
        "]}"
    )
    with patch.object(service, "_chat", new=AsyncMock(return_value=raw)):
        notes = await service.generate_word_notes_bulk(
            [
                {"word": "graphic", "translation": "图像的"},
                {"word": "design", "translation": "设计"},
                {"word": "absent", "translation": "缺失的"},
            ],
            source="global",
        )
    assert len(notes) == 3
    assert notes[0]["word"] == "graphic"
    assert notes[0]["context_source"] == "global"
    assert notes[0]["contextual_note"] == "图像的"
    assert notes[2]["word"] == "absent"
    # Missing entry gets empty strings, not a crash
    assert notes[2]["contextual_note"] == ""


@pytest.mark.asyncio
async def test_generate_word_notes_bulk_empty_returns_empty(fake_redis):
    from app.services.ai_service import AIService

    service = AIService()
    notes = await service.generate_word_notes_bulk([], source="global")
    assert notes == []


@pytest.mark.asyncio
async def test_generate_word_notes_bulk_batches_over_15(fake_redis, monkeypatch):
    """20 items → 2 batches (15 + 5) → 2 LLM calls."""
    from app.core.config import get_settings
    from app.services.ai_service import AIService

    monkeypatch.setattr(get_settings(), "prewarm_engines", "agnes")
    service = AIService()
    items = [{"word": f"w{i}", "translation": ""} for i in range(20)]

    # Make _chat return a valid (small) payload for any input — the
    # alignment logic in the wrapper will fill the rest.
    chat_mock = AsyncMock(
        return_value='{"notes": [{"word": "w0", "contextual_note": "x", "pitfalls": "", "knowledge": ""}]}'
    )

    with patch.object(service, "_chat", new=chat_mock):
        notes = await service.generate_word_notes_bulk(items, source="global", level="cet4")
    assert len(notes) == 20
    assert chat_mock.call_count == 2  # 15 + 5


@pytest.mark.asyncio
async def test_generate_word_notes_bulk_dual_engine_fans_out(fake_redis, monkeypatch):
    """With agnes + a secondary engine, batches round-robin across both.

    agnes batches go through ``_chat`` (mockable); secondary-engine batches go
    through that engine's own client. Even-indexed batches → agnes, odd → secondary.
    """
    from app.core.config import get_settings
    from app.services.ai_service import AIService

    monkeypatch.setattr(get_settings(), "prewarm_engines", "agnes,secondary")
    service = AIService()

    # agnes _chat mock — returns one aligned note per input word.
    async def fake_chat(system, user, temperature=0.3, response_format=None):
        # Echo a note for each numbered word in the user prompt.
        import re

        words = re.findall(r"^\d+\. (\S+)", user, flags=re.MULTILINE)
        notes = [{"word": w, "contextual_note": "agnes", "pitfalls": "", "knowledge": ""} for w in words]
        import json

        return json.dumps({"notes": notes})

    chat_mock = AsyncMock(side_effect=fake_chat)

    # Secondary-engine client mock — returns "secondary" notes.
    secondary_resp = type(
        "R",
        (),
        {"choices": [type("C", (), {"message": type("M", (), {"content": ""})()})()]},
    )()

    async def fake_create(**kwargs):
        # Parse words from the user message, return secondary-tagged notes.
        import json
        import re

        user_msg = next(m["content"] for m in kwargs["messages"] if m["role"] == "user")
        words = re.findall(r"^\d+\. (\S+)", user_msg, flags=re.MULTILINE)
        notes = [{"word": w, "contextual_note": "secondary", "pitfalls": "", "knowledge": ""} for w in words]
        secondary_resp.choices[0].message.content = json.dumps({"notes": notes})
        return secondary_resp

    secondary_client = type(
        "C",
        (),
        {
            "chat": type(
                "Chat", (), {"completions": type("Comp", (), {"create": AsyncMock(side_effect=fake_create)})()}
            )()
        },
    )()

    monkeypatch.setattr(
        service,
        "_get_engine_client",
        lambda name: (secondary_client, "sec-model") if name == "secondary" else (None, None),
    )

    items = [
        {"word": f"w{i}", "translation": ""} for i in range(4)
    ]  # 4 batches of 1? No — batch_size=15 → 1 batch only
    # With <15 items there's only 1 batch → all go to agnes (idx 0). Force 2 batches:
    items = [{"word": f"w{i}", "translation": ""} for i in range(16)]  # 2 batches (15+1)

    with patch.object(service, "_chat", new=chat_mock):
        notes = await service.generate_word_notes_bulk(items, source="global")
    assert len(notes) == 16
    # Batch 0 (agnes, words w0..w14) → "agnes"; batch 1 (secondary, word w15) → "secondary".
    assert notes[0]["contextual_note"] == "agnes"
    assert notes[15]["contextual_note"] == "secondary"
    assert chat_mock.call_count == 1  # only batch 0 went through _chat


# --- word_notes service: upsert + get_best_note ---


@pytest.mark.asyncio
async def test_upsert_notes_inserts_then_overwrites(db_session):
    from app.models.word_note import WordAINote
    from app.services import word_notes

    await word_notes.upsert_notes(
        db_session,
        [
            {
                "word": "graphic",
                "level": "cet4",
                "context_source": "global",
                "contextual_note": "first",
                "pitfalls": "",
                "knowledge": "",
            }
        ],
    )
    n = await word_notes.get_note(db_session, "graphic", "global")
    assert n is not None
    assert n.contextual_note == "first"

    # Second upsert overwrites the same triple
    await word_notes.upsert_notes(
        db_session,
        [
            {
                "word": "graphic",
                "level": "cet4",
                "context_source": "global",
                "contextual_note": "second",
                "pitfalls": "p2",
                "knowledge": "k2",
            }
        ],
    )
    n = await word_notes.get_note(db_session, "graphic", "global")
    assert n.contextual_note == "second"
    assert n.pitfalls == "p2"
    # Total still 1 row, not 2
    from sqlalchemy import select

    all_notes = (await db_session.execute(select(WordAINote).where(WordAINote.word == "graphic"))).scalars().all()
    assert len(all_notes) == 1


@pytest.mark.asyncio
async def test_get_best_note_prefers_video_specific_over_global(db_session):
    from sqlalchemy import select

    from app.models.video import Video, VideoStatus
    from app.models.word_note import WordAINote
    from app.services import word_notes
    from tests.conftest import TestSessionLocal

    # Seed a video so we can use a real video:{id} source.
    async with TestSessionLocal() as db:
        vid = "vid-wp-test"
        db.add(Video(id=vid, title="t", source_url="x", status=VideoStatus.ready))
        await db.commit()

    await word_notes.upsert_notes(
        db_session,
        [
            {
                "word": "graphic",
                "level": "cet4",
                "context_source": "global",
                "contextual_note": "global note",
                "pitfalls": "",
                "knowledge": "",
            },
            {
                "word": "graphic",
                "level": "cet4",
                "context_source": f"video:{vid}",
                "contextual_note": "video note",
                "pitfalls": "",
                "knowledge": "",
            },
        ],
    )
    best = await word_notes.get_best_note(db_session, "graphic", video_id=vid)
    assert best["contextual_note"] == "video note"
    assert best["source"] == f"video:{vid}"

    # No video id → falls back to global
    best_global = await word_notes.get_best_note(db_session, "graphic")
    assert best_global["contextual_note"] == "global note"
    assert best_global["source"] == "global"


@pytest.mark.asyncio
async def test_get_best_note_returns_none_when_missing(db_session):
    from app.services import word_notes

    assert await word_notes.get_best_note(db_session, "nonexistent") is None


# --- gloss endpoint: DB-first, live-fallback ---


@pytest.mark.asyncio
async def test_gloss_returns_db_note_no_live_ai_call(client, auth_headers, monkeypatch):
    """When a preheated note exists, gloss must not call live AI."""
    from app.services import ecdict, word_notes
    from tests.conftest import TestSessionLocal

    # Inline ecdict mock (the ecdict_lookup fixture is local to test_exam_corpus)
    ecdict._index = ecdict._ECDICTIndex()
    ecdict._index.words = {
        "accumulate": {
            "lemma": "accumulate",
            "phonetic": "əˈkjuːmjəleɪt",
            "definition": "to gradually get more of something",
            "translation": "积累",
            "pos": "v",
            "tags": "cet4 cet6 ky",
            "levels": ["cet4", "cet6", "ky"],
        }
    }

    async with TestSessionLocal() as db:
        await word_notes.upsert_notes(
            db,
            [
                {
                    "word": "accumulate",
                    "level": "cet6",
                    "context_source": "global",
                    "contextual_note": "preheated note",
                    "pitfalls": "preheated pitfall",
                    "knowledge": "preheated knowledge",
                }
            ],
        )

    # If live AI is called, this will fail the test (assertion + mock will count).
    ai = type("FakeAI", (), {})()
    ai.gloss_word_context = AsyncMock(side_effect=AssertionError("live AI should NOT be called when DB note exists"))
    monkeypatch.setattr("app.api.v1.words.get_ai_service", lambda: ai)

    resp = await client.get(
        "/api/v1/words/gloss",
        params={"word": "accumulate", "context_sentence": "We accumulate data."},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["contextual_note"] == "preheated note"
    assert data["pitfalls"] == "preheated pitfall"
    assert data["knowledge"] == "preheated knowledge"
    ai.gloss_word_context.assert_not_called()


@pytest.mark.asyncio
async def test_gloss_writes_global_note_on_first_live_call(client, auth_headers, monkeypatch):
    """On a cold lookup, gloss calls AI and persists the result as a global note,
    so the next call for the same word is instant."""
    from app.services import word_notes
    from tests.conftest import TestSessionLocal

    # Ensure no pre-existing note.
    async with TestSessionLocal() as db:
        await db.execute(__import__("sqlalchemy").text("DELETE FROM word_ai_notes WHERE word='unknownword'"))
        await db.commit()

    ai = type("FakeAI", (), {})()
    ai.gloss_word_context = AsyncMock(
        return_value={"contextual_note": "live cn", "pitfalls": "live pit", "knowledge": "live know"}
    )
    monkeypatch.setattr("app.api.v1.words.get_ai_service", lambda: ai)

    resp1 = await client.get(
        "/api/v1/words/gloss",
        params={"word": "unknownword", "context_sentence": "test"},
        headers=auth_headers,
    )
    assert resp1.status_code == 200
    assert resp1.json()["contextual_note"] == "live cn"
    ai.gloss_word_context.assert_called_once()

    # Second call should hit the DB and not call AI again.
    ai.gloss_word_context = AsyncMock(side_effect=AssertionError("live AI should not be called after preheat"))
    resp2 = await client.get(
        "/api/v1/words/gloss",
        params={"word": "unknownword", "context_sentence": "test"},
        headers=auth_headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["contextual_note"] == "live cn"
