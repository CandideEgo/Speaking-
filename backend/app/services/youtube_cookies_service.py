"""YouTube cookies probe + refresh for the admin one-click seed flow.

Keeps yt-dlp's cookies file fresh without blindly re-exporting on every seed.
Flow:

  ensure_cookies(url)
    -> probe_cookies(url)              # yt-dlp extract_info(download=False)
       ok?  -> return "ok"
       else -> refresh_cookies_from_persistent()
                 -> probe_cookies(url) again
                    ok?  -> "ok"
                    else -> "need_manual_login"  # persistent profile logged out

Refresh reuses ``scripts/get_youtube_cookies.py`` helpers (playwright-cli
``--persistent`` session), deliberately bypassing its interactive ``input()``/
``sleep`` entry points so it is safe to call from a background admin endpoint.

Pipeline-friendly variant:

  ensure_cookies_for_pipeline(url)
    -> probe_cookies(url)
       ok?  -> CookiesCheckResult(status="ok", ...)
       else -> refresh_cookies_from_persistent(timeout=30)
              -> probe again or fall back to existing file
    -> Never raises — returns a result the caller can act on.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from pathlib import Path

import structlog

from app.core.config import get_settings

logger = structlog.get_logger()

# Outcomes returned to the caller (route maps them to HTTP status).
CookiesStatus = str
OK = "ok"
NEED_MANUAL_LOGIN = "need_manual_login"
ERROR = "error"

# How long to wait for a persistent browser session to be logged in (seconds).
_LOGIN_WAIT_SECONDS = 60
_LOGIN_POLL_INTERVAL = 2

# Substrings in yt-dlp exceptions that indicate cookies are the problem (vs a
# network error / private video / etc.).
_COOKIES_INVALID_MARKERS = ("sign in to confirm", "login required", "login_required", "http error 403", "forbidden")


def _cookies_file() -> str | None:
    """Configured cookies path, or None if unset / file missing."""
    path = get_settings().youtube_cookies_path
    if not path or not Path(path).exists():
        return None
    return path


def _build_opts() -> dict:
    """yt-dlp opts mirroring _extract_video_info (probe only, no download)."""
    settings = get_settings()
    opts: dict = {"quiet": True, "no_warnings": True, "skip_download": True, "remote_components": "ejs:github"}
    if settings.http_proxy:
        opts["proxy"] = settings.http_proxy
    cookies = _cookies_file()
    if cookies:
        opts["cookiefile"] = cookies
    return opts


def _classify_error(err: Exception) -> CookiesStatus:
    """Map a yt-dlp exception to cookies_invalid vs other error."""
    msg = str(err).lower()
    if any(m in msg for m in _COOKIES_INVALID_MARKERS):
        return "cookies_invalid"
    return ERROR


async def probe_cookies(url: str) -> CookiesStatus:
    """Probe whether the current cookies let yt-dlp fetch metadata for ``url``.

    Uses ``extract_info(download=False)`` so nothing is downloaded. Returns
    ``ok`` / ``cookies_invalid`` / ``error``. No cookies configured or file
    missing counts as ``cookies_invalid`` (refresh may fix it).
    """
    if not _cookies_file():
        return "cookies_invalid"

    import yt_dlp

    loop = asyncio.get_event_loop()
    opts = _build_opts()

    def _sync_probe() -> CookiesStatus:
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.extract_info(url, download=False)
            return OK
        except Exception as e:
            logger.info("cookies_probe_failed", url=url, error=str(e)[:200])
            return _classify_error(e)

    return await loop.run_in_executor(None, _sync_probe)


def _import_pw_helpers():
    """Import playwright-cli helpers from the scripts package (lazy).

    Returns the module or None if playwright-cli is not installed.
    """
    try:
        from scripts import get_youtube_cookies as gyc
    except Exception:
        logger.warning("get_youtube_cookies module unavailable")
        return None
    return gyc


async def refresh_cookies_from_persistent(output_path: str, *, timeout: int = _LOGIN_WAIT_SECONDS) -> CookiesStatus:
    """Refresh ``output_path`` from the persistent playwright-cli browser session.

    Opens the persistent browser if needed, waits for a logged-in YouTube state
    (LOGIN_INFO cookie), then exports + converts to Netscape. Returns
    ``ok`` / ``need_manual_login`` / ``error``.
    """
    gyc = _import_pw_helpers()
    if gyc is None:
        return ERROR

    loop = asyncio.get_event_loop()

    # Step 1: ensure a persistent browser session is open (non-blocking open).
    def _ensure_browser() -> bool:
        try:
            if not gyc.is_browser_open():
                gyc.open_youtube_persistent()
            return True
        except Exception as e:
            logger.warning("persistent_browser_open_failed", error=str(e)[:200])
            return False

    if not await loop.run_in_executor(None, _ensure_browser):
        return ERROR

    # Step 2: poll for a logged-in state (LOGIN_INFO cookie) instead of a fixed sleep.
    deadline = time.monotonic() + timeout
    logged_in = False
    while time.monotonic() < deadline:
        try:
            if await loop.run_in_executor(None, gyc.is_youtube_logged_in):
                logged_in = True
                break
        except Exception:
            pass
        await asyncio.sleep(_LOGIN_POLL_INTERVAL)

    if not logged_in:
        logger.warning("persistent_session_not_logged_in")
        return NEED_MANUAL_LOGIN

    # Step 3: export state -> Netscape (replicates get_cookies_from_session's
    # core three steps, skipping its interactive input() branch).
    def _export() -> bool:
        try:
            state_path = gyc.save_session_state()
            ok = gyc.convert_to_netscape(state_path, output_path)
            try:
                Path(state_path).unlink(missing_ok=True)
            except OSError:
                pass
            return bool(ok)
        except Exception as e:
            logger.warning("cookies_export_failed", error=str(e)[:200])
            return False

    if not await loop.run_in_executor(None, _export):
        return ERROR

    return OK


async def ensure_cookies(url: str) -> CookiesStatus:
    """Make sure yt-dlp can reach ``url`` with the current cookies, refreshing if needed.

    Returns ``ok`` / ``need_manual_login`` / ``error``.
    """
    status = await probe_cookies(url)
    if status == OK:
        return OK
    # cookies_invalid OR error — try a refresh; if it doesn't help, surface the
    # need_manual_login outcome so the admin gets a clear action.
    logger.info("cookies_probe_not_ok", status=status, url=url, action="refresh")

    settings = get_settings()
    output_path = settings.youtube_cookies_path
    if not output_path:
        # No path configured — can't refresh anywhere meaningful.
        return NEED_MANUAL_LOGIN

    refresh_status = await refresh_cookies_from_persistent(output_path)
    if refresh_status != OK:
        return refresh_status  # need_manual_login or error

    # Re-probe with the freshly written cookies.
    status = await probe_cookies(url)
    if status == OK:
        return OK
    # Refreshed but still failing — most likely the persistent session itself
    # is logged out / cookies incomplete; ask the admin to re-login manually.
    return NEED_MANUAL_LOGIN


# ---------------------------------------------------------------------------
# Pipeline-friendly variant — never raises, returns a structured result
# ---------------------------------------------------------------------------

_PIPELINE_REFRESH_TIMEOUT = 30  # seconds — shorter than API's 60s


@dataclass
class CookiesCheckResult:
    """Result of a pipeline cookie check — never implies failure, only readiness."""

    status: str  # "ok" / "cookies_invalid" / "no_cookies_file" / "refresh_failed"
    cookies_path: str | None  # usable cookies file path (may be stale)
    message: str  # human-readable explanation


async def ensure_cookies_for_pipeline(url: str) -> CookiesCheckResult:
    """Check and optionally refresh cookies for a pipeline task.

    Unlike ``ensure_cookies``, this **never raises** and never returns a
    hard-failure signal.  The caller should use ``cookies_path`` if set and
    proceed regardless — the worst case is a yt-dlp 403 which the pipeline
    already handles via its normal error + retry path.

    Returns a ``CookiesCheckResult`` with:
    - ``status="ok"``            — cookies are fresh and verified
    - ``status="cookies_invalid"`` — probe failed; ``cookies_path`` may point
      to a stale file that's still worth trying
    - ``status="no_cookies_file"`` — no cookies file configured or found;
      ``cookies_path`` is None
    - ``status="refresh_failed"``  — refresh attempted but didn't help;
      ``cookies_path`` may point to the pre-refresh file
    """
    settings = get_settings()
    cookies_path = settings.youtube_cookies_path

    # No cookies file configured at all.
    if not cookies_path:
        return CookiesCheckResult(
            status="no_cookies_file",
            cookies_path=None,
            message="no youtube_cookies_path configured",
        )

    # File doesn't exist yet — probe will say cookies_invalid, but we can
    # still try a refresh.
    file_exists = Path(cookies_path).exists()

    # Step 1: probe with current cookies.
    probe_status = await probe_cookies(url)
    if probe_status == OK:
        return CookiesCheckResult(
            status="ok",
            cookies_path=cookies_path,
            message="cookies valid (probe ok)",
        )

    # Step 2: probe failed — try to refresh from persistent session.
    logger.info("pipeline_cookies_probe_failed", status=probe_status, url=url, action="refresh")
    refresh_status = await refresh_cookies_from_persistent(cookies_path, timeout=_PIPELINE_REFRESH_TIMEOUT)

    # Step 3: re-probe after refresh.
    if refresh_status == OK:
        reprobe = await probe_cookies(url)
        if reprobe == OK:
            return CookiesCheckResult(
                status="ok",
                cookies_path=cookies_path,
                message="cookies refreshed and verified",
            )

    # Refresh didn't help (or failed).  Fall back to whatever file exists.
    if file_exists or Path(cookies_path).exists():
        msg = f"cookies {probe_status}, refresh {refresh_status} — continuing with existing file"
        logger.warning("pipeline_cookies_degraded", url=url, message=msg)
        return CookiesCheckResult(
            status="cookies_invalid",
            cookies_path=cookies_path,
            message=msg,
        )

    # No cookies file at all — proceed without cookies (yt-dlp may still work
    # for some videos).
    msg = f"cookies {probe_status}, refresh {refresh_status}, no file available — proceeding without cookies"
    logger.info("pipeline_cookies_no_file", url=url, message=msg)
    return CookiesCheckResult(
        status="no_cookies_file",
        cookies_path=None,
        message=msg,
    )
