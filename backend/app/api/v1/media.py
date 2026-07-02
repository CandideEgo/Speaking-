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
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from app.core.config import get_settings
from app.core.limiter import rate_limit

router = APIRouter(prefix="/media", tags=["media"])

_CHUNK = 64 * 1024

# ---------------------------------------------------------------------------
# Image proxy — bypasses CDN hotlink protection (Referer) and mixed-content
# (http:// thumbnails on an https site) for externally-hosted video thumbnails.
# YouTube/Bilibili/Douyin all serve thumbnails from CDN hosts that either
# hotlink-protect via Referer or serve over plain http; routing the <img> src
# through this endpoint makes them load reliably on any platform.
# ---------------------------------------------------------------------------

# Hostname suffixes whose URLs we will proxy. Keep in sync with the frontend
# allowlist in frontend/src/lib/api.ts (mediaUrl).
_PROXY_HOST_SUFFIXES = (
    "ytimg.com",
    "hdslb.com",
    "biliimg.com",
    "douyinpic.com",
    "douyincdn.com",
    "douyinstatic.com",
    "aliyuncs.com",
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
        "User-Agent": "Mozilla/5.0 Speaking/1.0 (thumbnail proxy)",
        "Referer": _referer_for(parsed.hostname),
        "Accept": "image/*,*/*;q=0.8",
    }

    buf = bytearray()
    content_type = "image/jpeg"
    try:
        async with httpx.AsyncClient(
            timeout=_PROXY_TIMEOUT,
            follow_redirects=True,
            max_redirects=3,
        ) as client:
            async with client.stream("GET", url, headers=headers) as resp:
                if resp.status_code != 200:
                    raise HTTPException(status_code=502, detail="Upstream error")
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
            },
        )

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(total),
        "Content-Type": media_type,
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
            headers={"Content-Range": f"bytes */{total}"},
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
