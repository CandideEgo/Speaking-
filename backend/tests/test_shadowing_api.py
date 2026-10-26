"""Retired recording APIs stay gone.

The ``shadowing_attempts`` table and its service were dropped in the 2026-10
cleanup (migration ``c3d4e5f6a7b8``); what is left are the 410 compatibility
shells. They must not accept writes or create media files.
"""

import pytest


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
async def test_retired_mutation_returns_gone(client, auth_headers, method):
    resp = await client.request(
        method, "/api/v1/shadowing/attempts/old", headers=auth_headers, json={"is_satisfied": True}
    )
    assert resp.status_code == 410
    assert resp.json()["code"] == "FEATURE_RETIRED"


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
