"""yt-dlp cookie-file helper — copied from
``backend/app/services/youtube_cookies_service.py::disposable_cookiefile``.

Only the one function the audio extractor needs is copied here; the rest of the
cookie *refresh* machinery (playwright login, probing) belongs to the cloud's
admin flow and is not part of the GPU worker.
"""

import os
import shutil
import tempfile
from pathlib import Path

import structlog

logger = structlog.get_logger()


def disposable_cookiefile(path: str | None) -> str | None:
    """Copy ``path`` to a throwaway file for yt-dlp to use as its ``cookiefile``.

    yt-dlp treats ``cookiefile`` as read-**write**: on exit it serializes its
    in-memory cookie jar back over the file. When YouTube answers with the
    anti-bot challenge it also sends Set-Cookie headers that clear the auth
    cookies, so handing yt-dlp the real file silently strips LOGIN_INFO/SID
    from it (observed 739KB -> 377KB) and every later call is unauthenticated.

    Callers pass the copy instead, so yt-dlp's write-back lands on a temp file
    and the authenticated source stays intact. Returns None if ``path`` is unset
    or unreadable, which callers should treat as "no cookies".
    """
    if not path:
        return None
    src = Path(path)
    if not src.exists():
        return None
    try:
        fd, tmp = tempfile.mkstemp(prefix="ytdlp-cookies-", suffix=".txt")
        os.close(fd)
        shutil.copyfile(src, tmp)
        return tmp
    except OSError as e:
        logger.warning("cookies_copy_failed", path=path, error=str(e)[:200])
        return None
