"""Media access control — shadowing recordings are owner-only (?token= JWT)."""

from pathlib import Path

import httpx
import pytest
import pytest_asyncio

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


# ---------------------------------------------------------------------------
# Stored-XSS defense: uploaded extension is server-derived, and the media
# directory only ever serves allowlisted extensions with nosniff.
# ---------------------------------------------------------------------------


async def test_upload_ignores_client_filename_extension(client, auth_headers, tmp_path, monkeypatch):
    """The stored extension must come from the server-side content-type map,
    never from the client-controlled filename (stored-XSS defense)."""
    settings = get_settings()
    media_root = tmp_path / "media"
    monkeypatch.setattr(settings, "local_media_path", str(media_root))
    monkeypatch.setattr(settings, "upload_temp_dir", str(media_root / "uploads"))
    (media_root / "uploads").mkdir(parents=True)

    resp = await client.post(
        "/api/v1/videos/upload",
        headers=auth_headers,
        files={"file": ("x.html", b"fake video bytes", "video/mp4")},
    )
    assert resp.status_code == 201, resp.text
    source_url = resp.json()["source_url"]
    assert source_url.endswith(".mp4"), source_url
    stored = Path(source_url)
    assert stored.exists() and stored.suffix == ".mp4"
    # Nothing was written with the attacker-chosen extension.
    assert not list((media_root / "uploads").glob("*.html"))


async def test_upload_unsupported_content_type_rejected(client, auth_headers, tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "upload_temp_dir", str(tmp_path / "uploads"))
    resp = await client.post(
        "/api/v1/videos/upload",
        headers=auth_headers,
        files={"file": ("evil.html", b"<script>x</script>", "text/html")},
    )
    assert resp.status_code == 400


async def test_upload_oversized_rejected(client, auth_headers, tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "upload_temp_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "max_upload_file_size", 1024)
    resp = await client.post(
        "/api/v1/videos/upload",
        headers=auth_headers,
        files={"file": ("big.mp4", b"x" * 4096, "video/mp4")},
    )
    assert resp.status_code == 400
    assert "too large" in resp.json()["detail"].lower()


async def test_serve_media_rejects_non_media_extension(client, media_dir):
    """Planting a non-media file must not make it servable (stored-XSS)."""
    (media_dir / "evil.html").write_bytes(b"<script>alert(1)</script>")
    (media_dir / "evil.svg").write_bytes(b'<svg onload="alert(1)"></svg>')
    for name in ("evil.html", "evil.svg"):
        resp = await client.get(f"/media/{name}")
        assert resp.status_code == 404, name


async def test_public_media_has_nosniff(client, media_dir):
    resp = await client.get("/media/public.mp4")
    assert resp.status_code == 200
    assert resp.headers.get("x-content-type-options") == "nosniff"


# ---------------------------------------------------------------------------
# /media/proxy — SSRF defense: allowlist is validated on the initial URL only,
# so redirects must not be followed and attacker-controllable OSS domains are
# excluded from the allowlist.
# ---------------------------------------------------------------------------


async def test_proxy_rejects_aliyuncs_host(client):
    resp = await client.get(
        "/media/proxy", params={"url": "https://evil.oss-cn-beijing.aliyuncs.com/x.jpg"}
    )
    assert resp.status_code == 400


async def test_proxy_rejects_internal_ip_url(client):
    resp = await client.get(
        "/media/proxy", params={"url": "http://100.100.100.200/latest/meta-data/"}
    )
    assert resp.status_code == 400


async def test_proxy_does_not_follow_redirects(client, monkeypatch):
    """A 3xx upstream must surface as an error, never be fetched to the
    redirect target (SSRF via OSS 回源-style redirect rules)."""

    async def handler(request):
        return httpx.Response(302, headers={"location": "http://100.100.100.200/latest/meta-data/"})

    from app.api.v1 import media as media_module

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        media_module, "_proxy_client", httpx.AsyncClient(transport=transport, follow_redirects=False)
    )
    resp = await client.get("/media/proxy", params={"url": "https://ytimg.com/x.jpg"})
    assert resp.status_code == 502


async def test_proxy_success(client, monkeypatch):
    async def handler(request):
        return httpx.Response(200, content=b"img", headers={"content-type": "image/jpeg"})

    from app.api.v1 import media as media_module

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(media_module, "_proxy_client", httpx.AsyncClient(transport=transport))
    resp = await client.get("/media/proxy", params={"url": "https://ytimg.com/x.jpg"})
    assert resp.status_code == 200
    assert resp.content == b"img"
    assert resp.headers["content-type"] == "image/jpeg"


# ---------------------------------------------------------------------------
# Publish-state gate for pipeline-produced video media files
# ({video_id}.mp4 / _raw / _480p / _720p / _1080p). Draft/unpublished UGC media
# must not be publicly downloadable; owners and admins preview via ?token=.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_video_access_cache():
    """The access-decision cache is module-global with a 60s TTL — clear it
    per test so decisions from one test never leak into the next."""
    from app.api.v1 import media as media_module

    media_module._VIDEO_ACCESS_CACHE.clear()
    yield
    media_module._VIDEO_ACCESS_CACHE.clear()


async def _make_video(db, *, is_official=False, review_status="draft", user_id=None, snapshot=None):
    from app.models.video import Video, VideoSource, VideoStatus, VideoReviewStatus

    video = Video(
        title="Test Video",
        source_url="https://example.com/source.mp4",
        video_source=VideoSource.imported,
        status=VideoStatus.ready,
        is_official=is_official,
        review_status=VideoReviewStatus(review_status).value,
        user_id=user_id,
        published_snapshot=snapshot,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


@pytest_asyncio.fixture
async def video_media_dir(tmp_path, monkeypatch, db_session):
    """Media dir with pipeline-produced files for videos in various states."""
    settings = get_settings()
    monkeypatch.setattr(settings, "local_media_path", str(tmp_path))

    official = await _make_video(db_session, is_official=True, review_status="published")
    (tmp_path / f"{official.id}.mp4").write_bytes(b"official video")
    (tmp_path / f"{official.id}_720p.mp4").write_bytes(b"official 720p")

    ugc_draft = await _make_video(db_session, is_official=False, review_status="draft", user_id="owner-1")
    (tmp_path / f"{ugc_draft.id}_720p.mp4").write_bytes(b"draft video")

    ugc_published = await _make_video(db_session, is_official=False, review_status="published", user_id="owner-2")
    (tmp_path / f"{ugc_published.id}_480p.mp4").write_bytes(b"published ugc")

    snapshot_video = await _make_video(
        db_session, is_official=False, review_status="pending_review", user_id="owner-3",
        snapshot={"subtitles": []},
    )
    (tmp_path / f"{snapshot_video.id}_720p.mp4").write_bytes(b"snapshot video")

    # A staged-upload style file whose uuid matches no video row.
    (tmp_path / "12345678-1234-1234-1234-123456789012.mp4").write_bytes(b"staged upload")

    return {"official": official, "ugc_draft": ugc_draft, "ugc_published": ugc_published, "snapshot": snapshot_video}


async def test_official_video_media_public(client, video_media_dir):
    v = video_media_dir["official"]
    for name in (f"{v.id}.mp4", f"{v.id}_720p.mp4"):
        resp = await client.get(f"/media/{name}")
        assert resp.status_code == 200, name


async def test_published_ugc_media_public(client, video_media_dir):
    v = video_media_dir["ugc_published"]
    resp = await client.get(f"/media/{v.id}_480p.mp4")
    assert resp.status_code == 200


async def test_snapshot_video_media_public(client, video_media_dir):
    """Pending-re-review with a frozen snapshot stays publicly viewable."""
    v = video_media_dir["snapshot"]
    resp = await client.get(f"/media/{v.id}_720p.mp4")
    assert resp.status_code == 200


async def test_draft_ugc_media_private_without_token(client, video_media_dir):
    v = video_media_dir["ugc_draft"]
    resp = await client.get(f"/media/{v.id}_720p.mp4")
    assert resp.status_code == 404


async def test_draft_ugc_media_owner_token_ok(client, video_media_dir):
    v = video_media_dir["ugc_draft"]
    token = create_token("owner-1")
    resp = await client.get(f"/media/{v.id}_720p.mp4?token={token}")
    assert resp.status_code == 200
    assert resp.content == b"draft video"


async def test_draft_ugc_media_other_user_token_404(client, video_media_dir):
    v = video_media_dir["ugc_draft"]
    token = create_token("someone-else")
    resp = await client.get(f"/media/{v.id}_720p.mp4?token={token}")
    assert resp.status_code == 404


async def test_draft_ugc_media_admin_token_ok(client, video_media_dir, db_session):
    from app.models.user import PlanType, RoleType, User

    admin = User(
        phone="13911112222",
        hashed_password="x",
        name="Admin 2",
        plan=PlanType.pro,
        role=RoleType.admin,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    v = video_media_dir["ugc_draft"]
    token = create_token(admin.id)
    resp = await client.get(f"/media/{v.id}_720p.mp4?token={token}")
    assert resp.status_code == 200


async def test_unknown_video_media_404(client, video_media_dir):
    resp = await client.get(f"/media/{'0' * 36}_720p.mp4")
    assert resp.status_code == 404


async def test_staged_upload_file_not_servable(client, video_media_dir):
    """A staged upload uuid that maps to no video row must 404 (removes the
    source_url leak surface)."""
    resp = await client.get("/media/12345678-1234-1234-1234-123456789012.mp4")
    assert resp.status_code == 404
