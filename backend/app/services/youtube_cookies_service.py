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
import os
import shutil
import tempfile
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


def _has_auth_cookies(path: str) -> bool:
    """True if the cookies file carries a YouTube auth session.

    ``refresh_cookies_from_persistent`` can write a large-but-logged-out file
    (observed 377KB with zero LOGIN_INFO), so file size alone can't tell a
    user-supplied session apart from a stale export. LOGIN_INFO is the marker
    yt-dlp actually needs to clear the "Sign in to confirm you're not a bot"
    gate.
    """
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return "LOGIN_INFO" in f.read()
    except OSError:
        return False


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


def _build_opts() -> dict:
    """yt-dlp opts mirroring _extract_video_info (probe only, no download)."""
    settings = get_settings()
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "remote_components": "ejs:github",
        # node 运行时：解 YouTube n-challenge 签名（无 JS 运行时只能拿到图片格式）
        "js_runtimes": {"node": {}},
    }
    if settings.http_proxy:
        opts["proxy"] = settings.http_proxy
    cookies = _cookies_file()
    if cookies:
        # 副本：yt-dlp 会把 cookie jar 写回 cookiefile，见 disposable_cookiefile
        opts["cookiefile"] = disposable_cookiefile(cookies) or cookies
    # player_client：web_safari 置首位，web/android 兜底。web_safari 才能解锁
    # 自适应高清流——仅 web/android 时 YouTube 扣留全部高清流只给 360p format 18
    # （2026-09-16 实测，46 个视频糊的根因）。tv 对多数视频返回 UNPLAYABLE。
    # base_url 必须显式给：否则插件请求自身默认 127.0.0.1:4416 会走 http_proxy，
    # 代理回连不到宿主 loopback，每次 POT 获取都 20s 读超时（2026-09-08 实测）。
    ea: dict = {"youtube": {"player_client": ["web_safari", "web", "android"]}}
    if settings.youtube_pot_base_url:
        ea["youtubepot-bgutilhttp"] = {"base_url": [settings.youtube_pot_base_url]}
    opts["extractor_args"] = ea
    # 限速节流：per-video rate limit 缓解（2026-09-08 batch 教训）
    opts["sleep_interval_subtitles"] = 5
    opts["max_sleep_interval"] = 30
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

    No-ops when ``output_path`` already holds an authenticated session: the
    persistent profile is frequently logged out even while a user-supplied
    cookies file is perfectly good, and re-exporting over it is a downgrade,
    not a refresh (2026-09-08: this silently broke every yt-dlp call mid-batch).
    """
    if _has_auth_cookies(output_path):
        logger.info("cookies_refresh_skipped_existing_auth", path=output_path)
        return OK

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
    #
    # Writes to a temp file first and only replaces ``output_path`` when the
    # export actually carries LOGIN_INFO. A logged-out persistent session still
    # exports a plausible-looking file (observed 1KB-377KB, zero LOGIN_INFO),
    # and clobbering a working user-supplied cookies file with it breaks every
    # subsequent yt-dlp call.
    def _export() -> bool:
        tmp_path = f"{output_path}.refresh.tmp"
        try:
            state_path = gyc.save_session_state()
            ok = gyc.convert_to_netscape(state_path, tmp_path)
            try:
                Path(state_path).unlink(missing_ok=True)
            except OSError:
                pass
            if not ok:
                return False
            if not _has_auth_cookies(tmp_path):
                logger.warning(
                    "cookies_refresh_discarded_no_auth",
                    reason="export has no LOGIN_INFO — keeping existing cookies file",
                )
                return False
            os.replace(tmp_path, output_path)
            return True
        except Exception as e:
            logger.warning("cookies_export_failed", error=str(e)[:200])
            return False
        finally:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except OSError:
                pass

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

    # === 2026-09-08 patch: 用户提供的 cookies 不 refresh ===
    # 背景：persistent 浏览器登出后 refresh 会写"大但无 auth"的文件覆盖用户手工 cookies
    # （实测 377KB 但 LOGIN_INFO 缺失）。判据改为「有 LOGIN_INFO」而非单纯看体积。
    if file_exists and _has_auth_cookies(cookies_path):
        return CookiesCheckResult(
            status="ok",
            cookies_path=cookies_path,
            message="user-provided cookies with LOGIN_INFO, skip refresh",
        )

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
