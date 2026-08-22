"""Localize externally-hosted video thumbnails into the local media volume.

External thumbnail URLs (ytimg/hdslb/…) depend on the ``/media/proxy`` fetch
path at render time; when that egress dies (the HK relay expiring, a stale
HTTP_PROXY address) every cover on the site breaks at once. Localizing the
image at ingest/backfill time removes the runtime dependency: the cover
becomes a plain local static file served by nginx/backend like any media.

Host allowlist and Referer spoofing rules are shared with the proxy endpoint
(``app.api.v1.media``) so both surfaces stay in sync.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_MAX_BYTES = 5 * 1024 * 1024  # thumbnails are tiny; match the proxy cap
_TIMEOUT = 15.0

# Content-type → local extension. The media router serves with nosniff, so
# the extension must agree with the real payload type.
_EXT_BY_CONTENT_TYPE = (
    ("image/webp", ".webp"),
    ("image/png", ".png"),
    ("image/gif", ".gif"),
    ("image/jpeg", ".jpg"),
)


def _ext_for_content_type(content_type: str) -> str:
    ct = (content_type or "").lower()
    for needle, ext in _EXT_BY_CONTENT_TYPE:
        if needle in ct:
            return ext
    return ".jpg"


def local_thumbnail_stems(video_id: str) -> list[Path]:
    """Existing local thumbnail files for a video (any supported extension)."""
    base = Path(get_settings().local_media_path).resolve()
    return sorted(base.glob(f"{video_id}_thumb.*"))


async def download_thumbnail(url: str, dest: Path, proxy: str | None = None) -> bool:
    """Download ``url`` to ``dest`` honoring the proxy host allowlist.

    Returns True on success, False on any failure (never raises) — callers
    decide the fallback. Redirects are followed: unlike the user-facing
    ``/media/proxy`` endpoint this runs in a trusted ingest/backfill context,
    and CDNs (ytimg/hdslb) occasionally redirect between edge hosts.
    """
    from app.api.v1.media import _host_allowed, _referer_for

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    if not _host_allowed(parsed.hostname):
        logger.warning("Thumbnail host not in allowlist: %s", parsed.hostname)
        return False

    headers = {
        "User-Agent": "Mozilla/5.0 SeeWord/1.0 (thumbnail fetch)",
        "Referer": _referer_for(parsed.hostname),
        "Accept": "image/*,*/*;q=0.8",
    }
    settings = get_settings()
    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT,
            proxy=proxy if proxy is not None else (settings.http_proxy or None),
            follow_redirects=True,
        ) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            logger.warning("Thumbnail fetch %s -> HTTP %s", url[:80], resp.status_code)
            return False
        data = resp.content
        if not data or len(data) > _MAX_BYTES:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(dest.name + ".part")
        tmp.write_bytes(data)
        tmp.replace(dest)
        return True
    except httpx.HTTPError as e:
        logger.warning("Thumbnail fetch failed for %s: %s", url[:80], str(e)[:200])
        return False


async def localize_video_thumbnail(video, proxy: str | None = None) -> bool:
    """Download ``video.thumbnail_url`` into the media volume, rewrite to local.

    Idempotent: already-local or missing URLs are left untouched (True); a
    failed download keeps the external URL (False) so nothing regresses.
    """
    url = video.thumbnail_url
    if not url or not url.startswith("http"):
        return True

    existing = local_thumbnail_stems(video.id)
    if existing:
        video.thumbnail_url = f"/media/{existing[0].name}"
        return True

    settings = get_settings()
    base = Path(settings.local_media_path).resolve()
    probe = base / f"{video.id}_thumb.probe"
    if not await download_thumbnail(url, probe, proxy=proxy):
        return False
    # Extension from the actual payload (headers can lie; nosniff serving
    # requires the extension to match).
    ext = _ext_for_content_type(_sniff(probe))
    dest = base / f"{video.id}_thumb{ext}"
    probe.replace(dest)
    video.thumbnail_url = f"/media/{dest.name}"
    return True


def _sniff(path: Path) -> str:
    """Cheap magic-byte content type sniff (payload may disagree with headers)."""
    head = path.read_bytes()[:16]
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"
