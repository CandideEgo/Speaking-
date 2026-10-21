"""Retired recording APIs must not mutate or delete historical attempts."""

import pytest
from sqlalchemy import select

from app.models.shadowing import ShadowingAttempt
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
async def test_retired_mutation_preserves_old_record(client, auth_headers, method):
    uid = (await client.get("/api/v1/users/me", headers=auth_headers)).json()["id"]
    async with TestSessionLocal() as db:
        video = Video(
            title="Historical recording",
            source_url="https://example.com/old",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
        )
        db.add(video)
        await db.flush()
        attempt = ShadowingAttempt(
            user_id=uid, video_id=video.id, audio_url="/media/shadowing/old.webm", is_satisfied=False
        )
        db.add(attempt)
        await db.commit()
        attempt_id = attempt.id
    resp = await client.request(
        method, "/api/v1/shadowing/attempts/" + attempt_id, headers=auth_headers, json={"is_satisfied": True}
    )
    assert resp.status_code == 410
    async with TestSessionLocal() as db:
        old = (await db.execute(select(ShadowingAttempt).where(ShadowingAttempt.id == attempt_id))).scalar_one()
        assert old.is_satisfied is False


async def test_retired_upload_does_not_write_files(client, auth_headers, tmp_path, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "local_media_path", str(tmp_path))
    resp = await client.post(
        "/media/shadowing-audio",
        headers=auth_headers,
        files={"file": ("recording.webm", b"old-client-audio", "audio/webm")},
    )
    assert resp.status_code == 410
    assert list(tmp_path.iterdir()) == []
