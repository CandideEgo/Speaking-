"""Media access control — shadowing recordings are owner-only (?token= JWT)."""

import pytest

from app.core.config import get_settings
from app.core.security import create_token


@pytest.fixture
def media_dir(tmp_path, monkeypatch):
    """Point local_media_path at a temp dir with a shadowing recording + a
    public media file."""
    settings = get_settings()
    monkeypatch.setattr(settings, "local_media_path", str(tmp_path))
    (tmp_path / "shadowing" / "userA").mkdir(parents=True)
    (tmp_path / "shadowing" / "userA" / "rec.webm").write_bytes(b"fake audio")
    (tmp_path / "public.mp4").write_bytes(b"fake video")
    return tmp_path


async def test_shadowing_without_token_404(client, media_dir):
    resp = await client.get("/media/shadowing/userA/rec.webm")
    assert resp.status_code == 404


async def test_shadowing_owner_token_200(client, media_dir):
    token = create_token("userA")
    resp = await client.get(f"/media/shadowing/userA/rec.webm?token={token}")
    assert resp.status_code == 200
    assert resp.content == b"fake audio"


async def test_shadowing_other_user_token_404(client, media_dir):
    token = create_token("userB")
    resp = await client.get(f"/media/shadowing/userA/rec.webm?token={token}")
    assert resp.status_code == 404


async def test_shadowing_garbage_token_404(client, media_dir):
    resp = await client.get("/media/shadowing/userA/rec.webm?token=not-a-jwt")
    assert resp.status_code == 404


async def test_shadowing_refresh_token_rejected(client, media_dir):
    refresh = create_token("userA", token_type="refresh")
    resp = await client.get(f"/media/shadowing/userA/rec.webm?token={refresh}")
    assert resp.status_code == 404


async def test_shadowing_other_user_dir_404_even_with_owner_token(client, media_dir):
    # token matches userA, but the path belongs to another user dir
    token = create_token("userA")
    resp = await client.get(f"/media/shadowing/userB/rec.webm?token={token}")
    assert resp.status_code == 404


async def test_public_media_no_token_ok(client, media_dir):
    resp = await client.get("/media/public.mp4")
    assert resp.status_code == 200
    assert resp.content == b"fake video"
