"""P1-6: idempotent set-closure celebration endpoint (POST /vocab-sets/{id}/celebrate)."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_token, hash_password
from app.models.user import PlanType, RoleType, User
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


async def test_celebrate_on_open_set_returns_404(client: AsyncClient, auth_headers: dict):
    async with TestSessionLocal() as db:
        from app.models.subtitle import Subtitle
        from app.models.video import Video, VideoStatus

        video = Video(
            title="Open Video",
            source_url="https://www.youtube.com/watch?v=open",
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

    resp = await client.post(f"/api/v1/vocab-sets/{set_id}/celebrate", headers=auth_headers)

    assert resp.status_code == 404


async def test_celebrate_is_idempotent_per_set(client: AsyncClient, auth_headers: dict):
    set_id = await _seed_closed_set(client, auth_headers)

    first = await client.post(f"/api/v1/vocab-sets/{set_id}/celebrate", headers=auth_headers)
    assert first.status_code == 200
    body = first.json()
    assert body["first_time"] is True
    assert body["card"]["set_id"] == set_id
    assert body["card"]["total"] == 1
    assert body["card"]["mastered_count"] == 1
    assert body["card"]["exam_label"] == "四级"

    second = await client.post(f"/api/v1/vocab-sets/{set_id}/celebrate", headers=auth_headers)
    assert second.status_code == 200
    assert second.json()["first_time"] is False

    async with TestSessionLocal() as db:
        row = (await db.execute(select(VocabSet).where(VocabSet.id == set_id))).scalar_one()
        assert row.celebrated_at is not None


async def test_celebrate_other_users_set_returns_404(client: AsyncClient, auth_headers: dict):
    set_id = await _seed_closed_set(client, auth_headers)
    async with TestSessionLocal() as db:
        other = User(
            phone="13800138888",
            hashed_password=hash_password("Otherpass1!"),
            name="Other",
            plan=PlanType.free,
            role=RoleType.user,
        )
        db.add(other)
        await db.commit()
        await db.refresh(other)
        other_headers = {"Authorization": f"Bearer {create_token(other.id)}"}

    resp = await client.post(f"/api/v1/vocab-sets/{set_id}/celebrate", headers=other_headers)
    assert resp.status_code == 404
