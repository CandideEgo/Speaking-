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

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

from app.core.config import get_settings

router = APIRouter(prefix="/media", tags=["media"])

_CHUNK = 64 * 1024


@router.get("/{file_path:path}")
@router.head("/{file_path:path}")
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
