"""Tests for the 真题 (past-paper) corpus service and gloss integration."""

from unittest.mock import AsyncMock

import pytest


@pytest.fixture
def ecdict_lookup(monkeypatch):
    """Make ecdict.lookup recognize a small set of exam words for indexing."""
    from app.services import ecdict

    table = {
        "sustainable": {"lemma": "sustainable", "translation": "可持续的", "levels": ["cet6"]},
        "accumulate": {"lemma": "accumulate", "translation": "积累", "levels": ["cet6"]},
        "evaluate": {"lemma": "evaluate", "translation": "评估", "levels": ["cet6"]},
        "improve": {"lemma": "improve", "translation": "提高", "levels": ["cet4"]},
    }
    monkeypatch.setattr(ecdict, "lookup", lambda token: table.get(token.lower()))


@pytest.mark.asyncio
async def test_ingest_sentences_indexes_exam_words_and_recomputes_freq(db_session, ecdict_lookup):
    from app.services import exam_corpus

    records = [
        {"level": "cet6", "year": 2018, "sentence_en": "We must accumulate data to evaluate the plan.", "source": "t1"},
        {"level": "cet6", "year": 2019, "sentence_en": "They accumulate evidence again.", "source": "t2"},
        {"level": "cet6", "year": 2020, "sentence_en": "Accumulate enough resources.", "source": "t3"},
        {"level": "cet4", "year": 2021, "sentence_en": "She wants to improve her English.", "source": "t4"},
    ]
    inserted, levels = await exam_corpus.ingest_sentences(db_session, records)
    assert inserted == 4
    assert levels == {"cet6", "cet4"}

    # accumulate appears in 3 cet6 sentences -> high freq (threshold 3)
    assert await exam_corpus.is_high_freq_word(db_session, "accumulate", ["cet6"]) is True
    # evaluate appears once -> not high freq
    assert await exam_corpus.is_high_freq_word(db_session, "evaluate", ["cet6"]) is False
    # improve is cet4 only
    assert await exam_corpus.is_high_freq_word(db_session, "improve", ["cet4"]) is False


@pytest.mark.asyncio
async def test_ingest_is_idempotent(db_session, ecdict_lookup):
    from app.services import exam_corpus

    rec = {"level": "cet6", "sentence_en": "We accumulate data.", "source": "t1"}
    await exam_corpus.ingest_sentences(db_session, [rec])
    inserted2, _ = await exam_corpus.ingest_sentences(db_session, [rec])
    assert inserted2 == 0  # duplicate (level, sentence_en) skipped


@pytest.mark.asyncio
async def test_find_example_sentence_returns_match(db_session, ecdict_lookup):
    from app.services import exam_corpus

    await exam_corpus.ingest_sentences(
        db_session,
        [
            {"level": "cet6", "year": 2018, "sentence_en": "We accumulate data.", "source": "old"},
            {"level": "cet6", "year": 2020, "sentence_en": "They accumulate evidence.", "source": "new"},
        ],
    )
    sent = await exam_corpus.find_example_sentence(db_session, "accumulate", ["cet6"])
    assert sent is not None
    # ordered by year desc -> newest first
    assert sent.source == "new"


@pytest.mark.asyncio
async def test_find_example_sentence_returns_none_when_missing(db_session, ecdict_lookup):
    from app.services import exam_corpus

    await exam_corpus.ingest_sentences(db_session, [{"level": "cet6", "sentence_en": "We accumulate data."}])
    assert await exam_corpus.find_example_sentence(db_session, "nonexistent", ["cet6"]) is None
    # wrong level (cet4 not in corpus for this word)
    assert await exam_corpus.find_example_sentence(db_session, "accumulate", ["cet4"]) is None


@pytest.mark.asyncio
async def test_example_sentences_for_words(db_session, ecdict_lookup):
    from app.services import exam_corpus

    await exam_corpus.ingest_sentences(
        db_session,
        [
            {"level": "cet6", "sentence_en": "We accumulate data."},
            {"level": "cet6", "sentence_en": "They evaluate the plan."},
            {"level": "cet6", "sentence_en": "Sustainable growth matters."},
        ],
    )
    sents = await exam_corpus.example_sentences_for_words(db_session, ["accumulate", "evaluate"], "cet6", limit=5)
    assert len(sents) == 2
    assert all("accumulate" in s or "evaluate" in s for s in sents)


@pytest.mark.asyncio
async def test_gloss_endpoint_surfaces_corpus_example_and_freq(client, auth_headers, monkeypatch, ecdict_lookup):
    """The gloss endpoint merges ECDICT + 真题 example + high-freq + AI notes."""
    from app.services import exam_corpus

    # Seed the corpus directly via the service against the test DB session.
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        await exam_corpus.ingest_sentences(
            db,
            [
                {
                    "level": "cet6",
                    "year": 2018,
                    "sentence_en": "We accumulate data.",
                    "sentence_zh": "我们积累数据。",
                    "source": "2018六级",
                },
                {"level": "cet6", "year": 2019, "sentence_en": "They accumulate evidence.", "source": "2019六级"},
                {"level": "cet6", "year": 2020, "sentence_en": "Accumulate resources.", "source": "2020六级"},
            ],
        )

    # ECDICT lookup already monkeypatched via ecdict_lookup fixture for "accumulate".
    # AI notes are pipeline-preheated only (no live LLM fallback), so no stub needed.

    resp = await client.get(
        "/api/v1/words/gloss",
        params={"word": "accumulate", "context_sentence": "We accumulate data."},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["lemma"] == "accumulate"
    assert data["levels"] == ["cet6"]
    # 真题 example surfaced (newest year first, case-insensitive check)
    assert data["example_sentence"] is not None
    assert "accumulate" in data["example_sentence"].lower()
    assert data["example_source"] is not None
    # high freq (3 occurrences >= threshold 3)
    assert data["is_high_freq"] is True


@pytest.mark.asyncio
async def test_gloss_corpus_fields_null_when_empty(client, auth_headers, monkeypatch):
    """With no corpus data and no ECDICT, corpus fields stay null/false (non-fatal)."""
    from app.services import ecdict

    monkeypatch.setattr(ecdict, "lookup", lambda token: None)

    resp = await client.get(
        "/api/v1/words/gloss",
        params={"word": "whatever"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["example_sentence"] is None
    assert data["is_high_freq"] is False
    assert data["levels"] == []


@pytest.mark.asyncio
async def test_gloss_enrich_returns_corpus_and_note(client, auth_headers, monkeypatch, ecdict_lookup):
    """分级渲染第二级：enrich 返回真题例句 + 高频徽标 + AI 笔记（DB 查询）。"""
    from app.services import exam_corpus, word_notes
    from tests.conftest import TestSessionLocal

    async with TestSessionLocal() as db:
        await exam_corpus.ingest_sentences(
            db,
            [
                {
                    "level": "cet6",
                    "year": 2018,
                    "sentence_en": "We accumulate data.",
                    "sentence_zh": "我们积累数据。",
                    "source": "2018六级",
                },
                {"level": "cet6", "year": 2019, "sentence_en": "They accumulate evidence.", "source": "2019六级"},
                {"level": "cet6", "year": 2020, "sentence_en": "Accumulate resources.", "source": "2020六级"},
            ],
        )
        await word_notes.upsert_notes(
            db,
            [
                {
                    "word": "accumulate",
                    "level": "cet6",
                    "context_source": "global",
                    "contextual_note": "语境：逐步积累",
                    "pitfalls": "别拼错",
                    "knowledge": "accumulate + 宾语",
                }
            ],
        )

    resp = await client.get(
        "/api/v1/words/gloss/enrich",
        params={"word": "accumulate", "lemma": "accumulate", "context_sentence": "We accumulate data."},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # 真题 example surfaced (newest year first)
    assert data["example_sentence"] is not None
    assert "accumulate" in data["example_sentence"].lower()
    assert data["example_source"] is not None
    # high freq (3 occurrences >= threshold 3)
    assert data["is_high_freq"] is True
    # preheated AI note
    assert data["contextual_note"] == "语境：逐步积累"
    assert data["pitfalls"] == "别拼错"
    assert data["knowledge"] == "accumulate + 宾语"


@pytest.mark.asyncio
async def test_gloss_enrich_empty_when_no_data(client, auth_headers, monkeypatch):
    """第二级无数据时返回空字段（非致命，不影响第一级已展示的基础释义）。"""
    from app.services import ecdict

    monkeypatch.setattr(ecdict, "lookup", lambda token: None)

    resp = await client.get(
        "/api/v1/words/gloss/enrich",
        params={"word": "whatever", "lemma": "whatever"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["example_sentence"] is None
    assert data["is_high_freq"] is False
    assert data["contextual_note"] is None
    assert data["pitfalls"] is None
    assert data["knowledge"] is None
