"""Retired set achievement endpoint preserves vocabulary completion and history."""

from httpx import AsyncClient

from app.models.vocab_set import VocabSet
from tests.conftest import TestSessionLocal


async def _seed_closed_set(client: AsyncClient, auth_headers: dict) -> str:
    """Collect a one-word set and mark it learned so it closes."""
    async with TestSessionLocal() as db:
        from app.models.subtitle import Subtitle
        from app.models.video import Video, VideoStatus

        video = Video(
            title="Celebrate Video",
            source_url="https://www.youtube.com/watch?v=celebrate",
            video_source="imported",
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
        )
        db.add(video)
        await db.flush()
        db.add(
            Subtitle(
                video_id=video.id,
                start_time=0.0,
                end_time=4.0,
                text_en="apple",
                sentence_index=0,
                word_levels={"apple": ["cet4"]},
            )
        )
        await db.commit()
        video_id = video.id

    set_id = (
        await client.post("/api/v1/vocab-sets", json={"video_id": video_id, "exam_level": "cet4"}, headers=auth_headers)
    ).json()["id"]
    detail = (await client.get(f"/api/v1/vocab-sets/{set_id}", headers=auth_headers)).json()
    word_id = detail["words"][0]["set_word_id"]
    resp = await client.post(f"/api/v1/vocab-sets/{set_id}/words/{word_id}/learned", headers=auth_headers)
    assert resp.json()["completed"] is True
    return set_id


async def test_celebrate_requires_auth(client: AsyncClient):
    resp = await client.post("/api/v1/vocab-sets/whatever/celebrate")
    assert resp.status_code == 401


async def test_completed_set_has_no_new_achievement(client: AsyncClient, auth_headers: dict):
    set_id = await _seed_closed_set(client, auth_headers)
    for _ in range(2):
        response = await client.post(f"/api/v1/vocab-sets/{set_id}/celebrate", headers=auth_headers)
        assert response.status_code == 410
        assert response.json()["code"] == "FEATURE_RETIRED"
    async with TestSessionLocal() as db:
        row = await db.get(VocabSet, set_id)
        assert row.celebrated_at is None


async def test_historical_set_achievement_timestamp_preserved(client: AsyncClient, auth_headers: dict):
    from datetime import UTC, datetime

    set_id = await _seed_closed_set(client, auth_headers)
    historical = datetime(2026, 10, 1, tzinfo=UTC)
    async with TestSessionLocal() as db:
        row = await db.get(VocabSet, set_id)
        row.celebrated_at = historical
        await db.commit()
    assert (await client.post(f"/api/v1/vocab-sets/{set_id}/celebrate", headers=auth_headers)).status_code == 410
    async with TestSessionLocal() as db:
        row = await db.get(VocabSet, set_id)
        assert row.celebrated_at.replace(tzinfo=UTC) == historical
