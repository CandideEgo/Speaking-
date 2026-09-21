"""Tests for the exam-vocabulary gloss endpoint and target_exam preference."""

import pytest


@pytest.mark.asyncio
async def test_gloss_requires_auth(client):
    resp = await client.get("/api/v1/words/gloss", params={"word": "run"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_gloss_static_requires_auth(client):
    resp = await client.get("/api/v1/words/gloss/static", params={"word": "run"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_gloss_static_returns_ecdict_fields_only(client, auth_headers, monkeypatch):
    """分级渲染第一级：static 只返回 ECDICT 内存字段，不查 DB（例句/笔记为空）。"""
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

    resp = await client.get(
        "/api/v1/words/gloss/static",
        params={"word": "running"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["lemma"] == "run"
    assert data["phonetic"] == "rʌn"
    assert data["pos"] == "v"
    assert data["translation"] == "跑"
    assert data["definition"] == "to move fast on foot"
    assert data["levels"] == ["cet4", "cet6"]
    # 不查 DB：例句/高频/AI 笔记一律保持默认
    assert data["example_sentence"] is None
    assert data["example_sentence_zh"] is None
    assert data["example_source"] is None
    assert data["is_high_freq"] is False
    assert data["contextual_note"] is None
    assert data["pitfalls"] is None
    assert data["knowledge"] is None


@pytest.mark.asyncio
async def test_gloss_returns_ecdict_static_fields(client, auth_headers, monkeypatch):
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
    # No preheated AI notes → fields are null (no live LLM fallback)
    assert data["contextual_note"] is None
    assert data["pitfalls"] is None
    assert data["knowledge"] is None
    # example_sentence requires corpus data
    assert data["example_sentence"] is None


@pytest.mark.asyncio
async def test_gloss_returns_empty_for_word_not_in_ecdict(client, auth_headers, monkeypatch):
    from app.services import ecdict

    monkeypatch.setattr(ecdict, "lookup", lambda token: None)

    resp = await client.get(
        "/api/v1/words/gloss",
        params={"word": "supercalifragilistic"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["levels"] == []
    assert data["lemma"] is None
    assert data["translation"] is None
    assert data["contextual_note"] is None


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
