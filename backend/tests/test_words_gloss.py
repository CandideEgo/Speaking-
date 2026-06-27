"""Tests for the exam-vocabulary gloss endpoint and target_exam preference."""

from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_gloss_requires_auth(client):
    resp = await client.get("/api/v1/words/gloss", params={"word": "run"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_gloss_merges_ecdict_static_and_ai_notes(client, auth_headers, monkeypatch):
    from app.services import ecdict

    entry = {
        "lemma": "run",
        "phonetic": "rʌn",
        "definition": "to move fast on foot",
        "translation": "跑",
        "pos": "v",
        "tags": "cet4 cet6",
        "levels": ["cet4", "cet6"],
    }
    monkeypatch.setattr(ecdict, "lookup", lambda token: entry if token.lower() in ("run", "running") else None)

    ai = AsyncMock()
    ai.gloss_word_context = AsyncMock(
        return_value={"contextual_note": "此处意为“经营”", "pitfalls": "易与 ran 混淆", "knowledge": "run a company"}
    )
    monkeypatch.setattr("app.api.v1.words.get_ai_service", lambda: ai)

    resp = await client.get(
        "/api/v1/words/gloss",
        params={"word": "running", "context_sentence": "She runs a company"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # ECDICT static fields
    assert data["lemma"] == "run"
    assert data["phonetic"] == "rʌn"
    assert data["pos"] == "v"
    assert data["translation"] == "跑"
    assert data["levels"] == ["cet4", "cet6"]
    # AI contextual notes
    assert data["contextual_note"] == "此处意为“经营”"
    assert data["pitfalls"] == "易与 ran 混淆"
    assert data["knowledge"] == "run a company"
    # example_sentence reserved for Phase C
    assert data["example_sentence"] is None

    # AI was called with the lemma (DB lookup misses, live fallback fires on lemma).
    ai.gloss_word_context.assert_awaited_once_with("run", "She runs a company")


@pytest.mark.asyncio
async def test_gloss_returns_static_only_when_ai_fails(client, auth_headers, monkeypatch):
    from app.services import ecdict

    entry = {
        "lemma": "run",
        "phonetic": "rʌn",
        "definition": "to move fast",
        "translation": "跑",
        "pos": "v",
        "tags": "cet4",
        "levels": ["cet4"],
    }
    monkeypatch.setattr(ecdict, "lookup", lambda token: entry)

    def _boom():
        raise RuntimeError("AI down")

    monkeypatch.setattr("app.api.v1.words.get_ai_service", _boom)

    resp = await client.get(
        "/api/v1/words/gloss",
        params={"word": "run"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["levels"] == ["cet4"]
    assert data["translation"] == "跑"
    # AI fields gracefully null
    assert data["contextual_note"] is None
    assert data["pitfalls"] is None
    assert data["knowledge"] is None


@pytest.mark.asyncio
async def test_gloss_for_word_not_in_ecdict(client, auth_headers, monkeypatch):
    from app.services import ecdict

    monkeypatch.setattr(ecdict, "lookup", lambda token: None)
    ai = AsyncMock()
    ai.gloss_word_context = AsyncMock(return_value={"contextual_note": "释义", "pitfalls": "", "knowledge": ""})
    monkeypatch.setattr("app.api.v1.words.get_ai_service", lambda: ai)

    resp = await client.get("/api/v1/words/gloss", params={"word": "supercalifragilistic"}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["levels"] == []
    assert data["lemma"] is None
    assert data["translation"] is None
    assert data["contextual_note"] == "释义"


@pytest.mark.asyncio
async def test_target_exam_preference_roundtrip(client, auth_headers):
    # default is null
    resp = await client.get("/api/v1/users/me/preferences", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["target_exam"] is None

    # set a valid target
    resp = await client.put(
        "/api/v1/users/me/preferences",
        json={"target_exam": "cet6"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["target_exam"] == "cet6"

    # persists on re-fetch
    resp = await client.get("/api/v1/users/me/preferences", headers=auth_headers)
    assert resp.json()["target_exam"] == "cet6"


@pytest.mark.asyncio
async def test_target_exam_rejects_invalid_value(client, auth_headers):
    resp = await client.put(
        "/api/v1/users/me/preferences",
        json={"target_exam": "not-a-real-exam"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
