"""Range-aware static media serving.

Starlette's ``StaticFiles`` / ``FileResponse`` do not honor HTTP ``Range``
requests — a long-standing limitation that breaks HTML5 ``<video>`` seeking:
the browser exposes an empty ``seekable`` range, so setting ``currentTime``
(e.g. when clicking a subtitle to jump) silently resets to 0 and the video
plays from the start.

This router serves files under the local media directory with full byte-range
support (``206 Partial Content`` + ``Accept-Ranges``), so the browser can seek
arbitrarily. Production fronts media with nginx (range-aware); this router is
mounted unconditionally but costs nothing there since nginx serves media first.
"""

import mimetypes
import re
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.limiter import rate_limit
from app.core.security import decode_token
from app.models.user import User

router = APIRouter(prefix="/media", tags=["media"])

_CHUNK = 64 * 1024

# Only these extensions may ever be served from the media directory. Anything
# else (html, svg, json, ...) is a 404: a client-chosen filename extension must
# never become servable content on the trusted origin (stored-XSS defense —
# see upload_service._CONTENT_TYPE_EXT for the upload-side allowlist).
_SERVE_EXT_ALLOWLIST = {
    ".mp4", ".webm", ".mov", ".avi", ".mkv",
    ".mp3", ".wav", ".ogg", ".m4a",
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
}

# ---------------------------------------------------------------------------
# Image proxy — bypasses CDN hotlink protection (Referer) and mixed-content
# (http:// thumbnails on an https site) for externally-hosted video thumbnails.
# YouTube/Bilibili/Douyin all serve thumbnails from CDN hosts that either
# hotlink-protect via Referer or serve over plain http; routing the <img> src
# through this endpoint makes them load reliably on any platform.
# ---------------------------------------------------------------------------

# Hostname suffixes whose URLs we will proxy. Keep in sync with the frontend
# allowlist in frontend/src/lib/api.ts (mediaUrl).
# NOTE: aliyuncs.com is deliberately NOT here — OSS bucket domains are
# attacker-controllable ({bucket}.oss-{region}.aliyuncs.com), and with
# redirect-following disabled upstreams cannot jump to internal hosts anyway.
# OSS-hosted images should be served directly via signed/CDN URLs instead.
_PROXY_HOST_SUFFIXES = (
    "ytimg.com",
    "hdslb.com",
    "biliimg.com",
    "douyinpic.com",
    "douyincdn.com",
    "douyinstatic.com",
)

# Per-host Referer to satisfy hotlink protection. Bilibili's CDN rejects
# requests whose Referer isn't a bilibili.com origin.
_PROXY_REFERER = {
    "hdslb.com": "https://www.bilibili.com/",
    "biliimg.com": "https://www.bilibili.com/",
    "douyinpic.com": "https://www.douyin.com/",
    "douyincdn.com": "https://www.douyin.com/",
    "douyinstatic.com": "https://www.douyin.com/",
}

_PROXY_MAX_BYTES = 5 * 1024 * 1024  # 5 MB cap — thumbnails are tiny
_PROXY_TIMEOUT = 8.0

# Shared httpx client for the proxy endpoint. Creating a client per request
# (the old behaviour) paid a fresh connection/TLS handshake for every
# thumbnail on the homepage; a pooled singleton reuses upstream connections.
_proxy_client: httpx.AsyncClient | None = None


def _get_proxy_client() -> httpx.AsyncClient:
    global _proxy_client
    if _proxy_client is None or _proxy_client.is_closed:
        settings = get_settings()
        _proxy_client = httpx.AsyncClient(
            timeout=_PROXY_TIMEOUT,
            # Redirects must NOT be followed: the host allowlist is validated
            # only on the initial URL, so following a 3xx Location to an
            # arbitrary host would be an open SSRF (e.g. an OSS bucket 回源
            # rule redirecting to cloud metadata / internal services). A
            # redirect upstream now surfaces as a 502 "Upstream error".
            follow_redirects=False,
            proxy=settings.http_proxy or None,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
    return _proxy_client


async def close_proxy_client() -> None:
    """Shutdown hook — called from the app lifespan."""
    global _proxy_client
    if _proxy_client is not None and not _proxy_client.is_closed:
        await _proxy_client.aclose()
    _proxy_client = None


def _host_allowed(host: str) -> bool:
    host = host.lower()
    return any(host == suf or host.endswith("." + suf) for suf in _PROXY_HOST_SUFFIXES)


def _referer_for(host: str) -> str:
    host = host.lower()
    for suf, ref in _PROXY_REFERER.items():
        if host == suf or host.endswith("." + suf):
            return ref
    return f"https://{host}/"


@router.get("/proxy")
@rate_limit("120/minute")
async def proxy_image(
    request: Request,
    url: str = Query(..., description="Absolute image URL to proxy"),
):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid URL")
    if not _host_allowed(parsed.hostname):
        raise HTTPException(status_code=400, detail="Host not allowed")

    headers = {
        "User-Agent": "Mozilla/5.0 SeeWord/1.0 (thumbnail proxy)",
        "Referer": _referer_for(parsed.hostname),
        "Accept": "image/*,*/*;q=0.8",
    }

    buf = bytearray()
    content_type = "image/jpeg"
    client = _get_proxy_client()
    try:
        async with client.stream("GET", url, headers=headers) as resp:
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Upstream error")
            # Cheap size guard before downloading: upstreams usually advertise
            # the length, so oversized images are rejected without bandwidth.
            declared = resp.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > _PROXY_MAX_BYTES:
                raise HTTPException(status_code=413, detail="Image too large")
            ct = resp.headers.get("content-type", "")
            if ct and ct.lower().startswith("image/"):
                content_type = ct.split(";")[0].strip()
            async for chunk in resp.aiter_bytes(_CHUNK):
                buf.extend(chunk)
                if len(buf) > _PROXY_MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Image too large")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Upstream fetch failed") from None

    return Response(
        content=bytes(buf),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ---------------------------------------------------------------------------
# Shadowing audio upload — persists user recording blobs for read-along.
# Must be defined BEFORE the catch-all serve_media route.
# ---------------------------------------------------------------------------

_SHADOWING_MAX_BYTES = 5 * 1024 * 1024  # 5 MB cap
_SHADOWING_ALLOWED_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"}


@router.post("/shadowing-audio")
@rate_limit("30/minute")
async def upload_shadowing_audio(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a shadowing recording blob. Returns the media URL for playback."""
    content_type = file.content_type or ""
    if content_type not in _SHADOWING_ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported audio type: {content_type}. Allowed: webm, ogg, mp4, mpeg, wav",
        )

    # Determine file extension from content type
    ext_map = {
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/mp4": ".mp4",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
    }
    ext = ext_map.get(content_type, ".webm")

    # Read and validate size
    data = await file.read()
    if len(data) > _SHADOWING_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 5MB)")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # Write to media/shadowing/{user_id}/{uuid}{ext}
    settings = get_settings()
    base = Path(settings.local_media_path).resolve()
    user_dir = base / "shadowing" / current_user.id
    user_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}{ext}"
    file_path = user_dir / filename
    file_path.write_bytes(data)

    url = f"/media/shadowing/{current_user.id}/{filename}"
    return {"url": url}


def _shadowing_token_ok(owner_user_id: str, request: Request) -> bool:
    """Validate the ``?token=`` JWT for a shadowing recording.

    The token must be an access (or legacy untyped) token whose ``sub``
    matches the owner id embedded in the media path. Returns False on any
    mismatch / malformed token (caller maps to 404).
    """
    token = request.query_params.get("token", "")
    if not token:
        return False
    payload = decode_token(token)
    if payload is None or payload.get("type") not in ("access", None):
        return False
    return payload.get("sub") == owner_user_id


# ---------------------------------------------------------------------------
# Publish-state gate for video media files.
#
# Pipeline-produced files are named ``{video_id}.mp4`` (720p fallback),
# ``{video_id}_480p.mp4`` / ``_720p`` / ``_1080p`` / ``_raw.<ext>``. They must
# not be publicly downloadable while the video is unpublished (draft UGC
# content leaks before admin approval otherwise — the URL is derivable from
# the video id). Access follows the same rules as the API layer
# (services/video_access.py): official/published/snapshot videos are public,
# owners and admins may preview drafts via a JWT (?token= or Bearer).
# ---------------------------------------------------------------------------
_VIDEO_FILE_RE = re.compile(
    r"^(?P<vid>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
    r"(?:_raw|_480p|_720p|_1080p)?$"
)

# Short-TTL cache of access decisions: {video_id: (expires_at, allowed)}.
_VIDEO_ACCESS_CACHE: dict[str, tuple[float, bool]] = {}
_VIDEO_ACCESS_CACHE_TTL = 60.0


def _viewer_id_from_request(request: Request) -> str | None:
    """Resolve the viewer's user id from ``?token=`` or the Authorization
    header. Returns None when absent/invalid (anonymous viewer)."""
    token = request.query_params.get("token", "")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    payload = decode_token(token)
    if payload is None or payload.get("type") not in ("access", None):
        return None
    return payload.get("sub")


async def _video_media_allowed(video_id: str, viewer_id: str | None) -> bool:
    """Publish-state gate for a pipeline-produced video media file."""
    now = time.monotonic()
    cached = _VIDEO_ACCESS_CACHE.get(video_id)
    if cached is not None and cached[0] > now:
        return cached[1]

    from app.core.database import async_session
    from app.models.user import RoleType, User
    from app.models.video import Video
    from app.services.video_access import check_video_access_by_owner

    allowed = False
    async with async_session() as db:
        video = await db.get(Video, video_id)
        if video is not None:
            allowed = check_video_access_by_owner(video, viewer_id)
            if not allowed and viewer_id is not None:
                # Admin preview bypass: admins may preview any draft.
                viewer = await db.get(User, viewer_id)
                if viewer is not None and viewer.role == RoleType.admin:
                    allowed = True
    _VIDEO_ACCESS_CACHE[video_id] = (now + _VIDEO_ACCESS_CACHE_TTL, allowed)
    return allowed


@router.get("/{file_path:path}")
@router.head("/{file_path:path}")
@rate_limit("60/minute")
async def serve_media(file_path: str, request: Request):
    base = Path(get_settings().local_media_path).resolve()
    # Resolve safely — reject paths that escape the media directory.
    full = (base / file_path).resolve()
    try:
        full.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=404) from None
    if not full.is_file():
        raise HTTPException(status_code=404)
    # Extension allowlist: non-media files (html/svg/json/...) are never
    # servable from the media directory (stored-XSS defense).
    if full.suffix.lower() not in _SERVE_EXT_ALLOWLIST:
        raise HTTPException(status_code=404)

    # Shadowing recordings are private per-user: require a valid JWT whose
    # subject matches the owner id in the path. The token travels as a query
    # param (?token=) because <audio src> cannot attach Authorization headers.
    # 404 (not 401) so non-owners cannot probe which recordings exist.
    if file_path.startswith("shadowing/"):
        parts = file_path.split("/")
        if len(parts) < 2 or not _shadowing_token_ok(parts[1], request):
            raise HTTPException(status_code=404)
    else:
        # Publish-state gate for pipeline-produced video files
        # ({video_id}.mp4 / _raw / _480p / _720p / _1080p). Uploads staged as
        # {uuid}.mp4 match too — they belong to no video row yet, so the
        # lookup fails and they 404, which also removes the source_url leak.
        m = _VIDEO_FILE_RE.match(full.stem)
        if m is not None and not await _video_media_allowed(m.group("vid"), _viewer_id_from_request(request)):
            raise HTTPException(status_code=404)

    total = full.stat().st_size
    media_type = mimetypes.guess_type(full.name)[0] or "application/octet-stream"
    range_header = request.headers.get("range")

    # HEAD: advertise range support, no body.
    if request.method == "HEAD":
        return Response(
            status_code=200,
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(total),
                "X-Content-Type-Options": "nosniff",
            },
        )

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(total),
        "Content-Type": media_type,
        # The main.py security-headers middleware skips /media paths (media
        # must stay cacheable/proxyable), so set nosniff here explicitly.
        "X-Content-Type-Options": "nosniff",
    }

    # No Range header → full file (200), still advertising range support.
    if not range_header:
        return StreamingResponse(_read(full, 0, total), media_type=media_type, headers=headers)

    # Parse "bytes=start-end" (single range only; end optional).
    try:
        unit, spec = range_header.split("=", 1)
        if unit.strip().lower() != "bytes" or "," in spec:
            raise ValueError
        start_s, _, end_s = spec.strip().partition("-")
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else total - 1
    except ValueError:
        raise HTTPException(status_code=416, detail="Unsupported Range") from None

    if start < 0 or start >= total or end >= total or start > end:
        return Response(
            status_code=416,
            media_type=media_type,
            headers={
                "Content-Range": f"bytes */{total}",
                "X-Content-Type-Options": "nosniff",
            },
        )

    length = end - start + 1
    headers["Content-Length"] = str(length)
    headers["Content-Range"] = f"bytes {start}-{end}/{total}"
    return StreamingResponse(
        _read(full, start, length),
        status_code=206,
        media_type=media_type,
        headers=headers,
    )


def _read(path: Path, start: int, length: int):
    """Yield `length` bytes from `path` starting at `start` (sync iterator → threadpool)."""
    remaining = length
    with open(path, "rb") as f:
        f.seek(start)
        while remaining > 0:
            chunk = f.read(min(_CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk
