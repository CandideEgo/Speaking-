"""Thumbnail localization — external covers become local media files.

任务 3: covers must not depend on the /media/proxy egress (HK relay) at render
time; these tests pin the download/rewrite semantics of thumbnail_service.
"""

import pytest

from app.core.config import get_settings
from app.services import thumbnail_service

_PNG_HEAD = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
_WEBP_HEAD = b"RIFF\x00\x00\x00\x00WEBPVP8 "
_JPEG_HEAD = b"\xff\xd8\xff\xe0" + b"\x00" * 12


@pytest.fixture
def media_dir(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "local_media_path", str(tmp_path))
    return tmp_path


class _FakeVideo:
    def __init__(self, video_id: str, thumbnail_url: str | None):
        self.id = video_id
        self.thumbnail_url = thumbnail_url


def test_sniff_detects_payload_types(tmp_path):
    for head, expected in [(_PNG_HEAD, "image/png"), (_WEBP_HEAD, "image/webp"), (_JPEG_HEAD, "image/jpeg")]:
        p = tmp_path / "probe"
        p.write_bytes(head)
        assert thumbnail_service._sniff(p) == expected


async def test_download_rejects_host_outside_allowlist(media_dir):
    dest = media_dir / "x_thumb.jpg"
    ok = await thumbnail_service.download_thumbnail("https://evil.example.com/a.jpg", dest)
    assert ok is False
    assert not dest.exists()


async def test_localize_reuses_existing_local_file(media_dir):
    (media_dir / "vid1_thumb.jpg").write_bytes(_JPEG_HEAD)
    v = _FakeVideo("vid1", "https://i.ytimg.com/vi/x/maxresdefault.jpg")
    assert await thumbnail_service.localize_video_thumbnail(v) is True
    assert v.thumbnail_url == "/media/vid1_thumb.jpg"


async def test_localize_downloads_and_picks_extension_from_payload(media_dir, monkeypatch):
    async def fake_download(url, dest, proxy=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(_PNG_HEAD)
        return True

    monkeypatch.setattr(thumbnail_service, "download_thumbnail", fake_download)
    v = _FakeVideo("vid2", "https://i.ytimg.com/vi/y/maxresdefault.jpg")
    assert await thumbnail_service.localize_video_thumbnail(v) is True
    # Extension follows the real payload (nosniff serving requires the match),
    # not the .jpg-looking URL.
    assert v.thumbnail_url == "/media/vid2_thumb.png"
    assert (media_dir / "vid2_thumb.png").exists()
    assert not (media_dir / "vid2_thumb.probe").exists()


async def test_localize_failure_keeps_external_url(media_dir, monkeypatch):
    async def fake_download(url, dest, proxy=None):
        return False

    monkeypatch.setattr(thumbnail_service, "download_thumbnail", fake_download)
    v = _FakeVideo("vid3", "https://i.ytimg.com/vi/z/maxresdefault.jpg")
    assert await thumbnail_service.localize_video_thumbnail(v) is False
    assert v.thumbnail_url == "https://i.ytimg.com/vi/z/maxresdefault.jpg"


def test_find_local_video_file_prefers_transcode(media_dir):
    (media_dir / "vidX_raw.mp4").write_bytes(b"raw")
    assert thumbnail_service.find_local_video_file("vidX") == media_dir / "vidX_raw.mp4"
    (media_dir / "vidX_720p.mp4").write_bytes(b"720p")
    assert thumbnail_service.find_local_video_file("vidX") == media_dir / "vidX_720p.mp4"
    assert thumbnail_service.find_local_video_file("missing") is None


async def test_localize_falls_back_to_frame_extraction(media_dir, monkeypatch):
    """Egress dead + local file present → ffmpeg frame becomes the cover."""

    async def fake_download(url, dest, proxy=None):
        return False

    async def fake_frame(video_path, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(_JPEG_HEAD)
        return True

    monkeypatch.setattr(thumbnail_service, "download_thumbnail", fake_download)
    monkeypatch.setattr(thumbnail_service, "extract_frame_thumbnail", fake_frame)
    (media_dir / "vid6_720p.mp4").write_bytes(b"video")
    v = _FakeVideo("vid6", "https://i.ytimg.com/vi/w/maxresdefault.jpg")
    assert await thumbnail_service.localize_video_thumbnail(v) is True
    assert v.thumbnail_url == "/media/vid6_thumb.jpg"
    assert (media_dir / "vid6_thumb.jpg").exists()


async def test_localize_noop_for_local_or_missing_urls(media_dir):
    v = _FakeVideo("vid4", "/media/vid4_thumb.jpg")
    assert await thumbnail_service.localize_video_thumbnail(v) is True
    assert v.thumbnail_url == "/media/vid4_thumb.jpg"

    v2 = _FakeVideo("vid5", None)
    assert await thumbnail_service.localize_video_thumbnail(v2) is True
    assert v2.thumbnail_url is None
