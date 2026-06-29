"""Tests for youtube_cookies_service probe classification + ensure flow.

The yt-dlp / playwright-cli calls are mocked — these tests only verify the
branching logic (probe -> refresh -> re-probe -> need_manual_login).
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services import youtube_cookies_service as ycs


@pytest.mark.asyncio
async def test_probe_returns_cookies_invalid_when_no_cookies_file():
    """No cookies file configured -> cookies_invalid (refresh may fix it)."""
    with patch.object(ycs, "_cookies_file", return_value=None):
        assert await ycs.probe_cookies("https://youtube.com/watch?v=x") == "cookies_invalid"


@pytest.mark.asyncio
async def test_probe_classifies_sign_in_as_cookies_invalid():
    """A 'Sign in to confirm you're not a bot' error -> cookies_invalid."""

    class _FakeYDL:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def extract_info(self, url, download=False):
            raise Exception("Sign in to confirm you're not a bot")

    import sys

    sys.modules.setdefault("yt_dlp", type("m", (), {"YoutubeDL": _FakeYDL}))
    with (
        patch.object(ycs, "_cookies_file", return_value="cookies.txt"),
        patch.object(ycs, "_build_opts", return_value={}),
    ):
        assert await ycs.probe_cookies("https://youtube.com/watch?v=x") == "cookies_invalid"


@pytest.mark.asyncio
async def test_probe_other_error_classified_as_error():
    """A non-cookies error (e.g. network) -> error, not cookies_invalid."""

    class _FakeYDL:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def extract_info(self, url, download=False):
            raise Exception("Connection reset by peer")

    import sys

    sys.modules["yt_dlp"] = type("m", (), {"YoutubeDL": _FakeYDL})
    with (
        patch.object(ycs, "_cookies_file", return_value="cookies.txt"),
        patch.object(ycs, "_build_opts", return_value={}),
    ):
        assert await ycs.probe_cookies("https://youtube.com/watch?v=x") == "error"


@pytest.mark.asyncio
async def test_ensure_cookies_skips_refresh_when_probe_ok():
    """If the initial probe is ok, no refresh happens."""
    with (
        patch.object(ycs, "probe_cookies", new=AsyncMock(return_value="ok")),
        patch.object(ycs, "refresh_cookies_from_persistent", new=AsyncMock(return_value="ok")) as refresh,
    ):
        assert await ycs.ensure_cookies("https://youtube.com/watch?v=x") == "ok"
        refresh.assert_not_called()


@pytest.mark.asyncio
async def test_ensure_cookies_refreshes_then_ok():
    """Probe invalid -> refresh ok -> re-probe ok -> 'ok'."""
    probe = AsyncMock(side_effect=["cookies_invalid", "ok"])
    with (
        patch.object(ycs, "probe_cookies", new=probe),
        patch.object(ycs, "refresh_cookies_from_persistent", new=AsyncMock(return_value="ok")),
        patch.object(ycs, "get_settings") as gs,
    ):
        gs.return_value.youtube_cookies_path = "cookies.txt"
        assert await ycs.ensure_cookies("https://youtube.com/watch?v=x") == "ok"


@pytest.mark.asyncio
async def test_ensure_cookies_persistent_logged_out_returns_need_manual_login():
    """Probe invalid -> refresh returns need_manual_login -> propagate it."""
    with (
        patch.object(ycs, "probe_cookies", new=AsyncMock(return_value="cookies_invalid")),
        patch.object(ycs, "refresh_cookies_from_persistent", new=AsyncMock(return_value="need_manual_login")),
        patch.object(ycs, "get_settings") as gs,
    ):
        gs.return_value.youtube_cookies_path = "cookies.txt"
        assert await ycs.ensure_cookies("https://youtube.com/watch?v=x") == "need_manual_login"


@pytest.mark.asyncio
async def test_ensure_cookies_refreshed_but_still_invalid_returns_need_manual_login():
    """Probe invalid -> refresh ok -> re-probe still invalid -> need_manual_login."""
    probe = AsyncMock(side_effect=["cookies_invalid", "cookies_invalid"])
    with (
        patch.object(ycs, "probe_cookies", new=probe),
        patch.object(ycs, "refresh_cookies_from_persistent", new=AsyncMock(return_value="ok")),
        patch.object(ycs, "get_settings") as gs,
    ):
        gs.return_value.youtube_cookies_path = "cookies.txt"
        assert await ycs.ensure_cookies("https://youtube.com/watch?v=x") == "need_manual_login"
