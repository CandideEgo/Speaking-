"""SSRF guard tests — video URL validation (domain allowlist + private-IP block)."""

import pytest

from app.core.errors import AppError
from app.services.video_url_guard import validate_video_url


def _patch_dns(monkeypatch, ips_by_host: dict[str, list[str]], second_round: dict[str, list[str]] | None = None):
    """Fake getaddrinfo: first call uses ips_by_host, later calls (rebinding
    check) use second_round when provided."""
    calls = {"n": 0}

    def fake_getaddrinfo(host, port=None, *args, **kwargs):
        calls["n"] += 1
        if second_round is not None and calls["n"] > 1:
            ips = second_round.get(host, [])
        else:
            ips = ips_by_host.get(host, [])
        return [(2, 1, 6, "", (ip, 0)) for ip in ips]

    monkeypatch.setattr("app.services.video_url_guard.socket.getaddrinfo", fake_getaddrinfo)


async def test_allowed_youtube_url(monkeypatch):
    _patch_dns(monkeypatch, {"www.youtube.com": ["142.250.72.46"]})
    await validate_video_url("https://www.youtube.com/watch?v=abc", rebinding_delay=0)


async def test_allowed_bilibili_url(monkeypatch):
    _patch_dns(monkeypatch, {"www.bilibili.com": ["8.210.1.1"]})
    await validate_video_url("https://www.bilibili.com/video/BV1xx", rebinding_delay=0)


async def test_foreign_host_rejected(monkeypatch):
    # suffix-matching must not be fooled by lookalike domains
    _patch_dns(monkeypatch, {"evil-youtube.com": ["8.8.8.8"], "example.com": ["8.8.8.8"]})
    with pytest.raises(AppError):
        await validate_video_url("https://evil-youtube.com/watch?v=abc", rebinding_delay=0)
    with pytest.raises(AppError):
        await validate_video_url("https://example.com/v", rebinding_delay=0)


async def test_metadata_url_rejected(monkeypatch):
    # IP literal in the host slot — not on the domain allowlist
    _patch_dns(monkeypatch, {})
    with pytest.raises(AppError):
        await validate_video_url("http://169.254.169.254/latest/meta-data/", rebinding_delay=0)


async def test_private_ip_resolution_rejected(monkeypatch):
    # allowed domain resolving to a private range must be blocked
    _patch_dns(monkeypatch, {"www.youtube.com": ["10.0.0.1"]})
    with pytest.raises(AppError):
        await validate_video_url("https://www.youtube.com/watch?v=abc", rebinding_delay=0)


async def test_loopback_resolution_rejected(monkeypatch):
    _patch_dns(monkeypatch, {"www.bilibili.com": ["127.0.0.1"]})
    with pytest.raises(AppError):
        await validate_video_url("https://www.bilibili.com/video/BV1xx", rebinding_delay=0)


async def test_link_local_resolution_rejected(monkeypatch):
    _patch_dns(monkeypatch, {"youtu.be": ["169.254.1.1"]})
    with pytest.raises(AppError):
        await validate_video_url("https://youtu.be/abc", rebinding_delay=0)


async def test_any_private_ip_in_set_rejected(monkeypatch):
    # mixed public+private resolution set is still blocked
    _patch_dns(monkeypatch, {"www.youtube.com": ["142.250.72.46", "192.168.1.10"]})
    with pytest.raises(AppError):
        await validate_video_url("https://www.youtube.com/watch?v=abc", rebinding_delay=0)


async def test_resolve_failure_rejected(monkeypatch):
    _patch_dns(monkeypatch, {"www.youtube.com": []})
    with pytest.raises(AppError):
        await validate_video_url("https://www.youtube.com/watch?v=abc", rebinding_delay=0)


async def test_dns_rebinding_rejected(monkeypatch):
    # first resolution public, second (post-delay) private -> blocked
    _patch_dns(monkeypatch, {"www.youtube.com": ["142.250.72.46"]}, second_round={"www.youtube.com": ["10.0.0.1"]})
    with pytest.raises(AppError):
        await validate_video_url("https://www.youtube.com/watch?v=abc", rebinding_delay=0)


async def test_missing_hostname_rejected(monkeypatch):
    _patch_dns(monkeypatch, {})
    with pytest.raises(AppError):
        await validate_video_url("https:///path", rebinding_delay=0)


async def test_validation_errors_are_app_errors():
    """Route-facing contract: errors are AppError(400, VALIDATION_ERROR)."""
    from app.core.errors import ErrorCode

    with pytest.raises(AppError) as excinfo:
        await validate_video_url("https://example.com/v", rebinding_delay=0)
    assert excinfo.value.status_code == 400
    assert excinfo.value.code == ErrorCode.VALIDATION_ERROR


def test_dns_mock_does_not_leak_into_global_socket():
    """The autouse DNS fake must stay inside ``video_url_guard``.

    It used to be written onto the ``socket`` module itself, which every
    ``import socket`` caller shares — including redis-py's ``_connect`` and
    asyncpg. The sync Redis client in ``pipeline_helpers`` then dialled the
    fake IP on every call, and on a CI runner (which drops the packets rather
    than refusing them) each call blocked for the ~134s kernel SYN timeout.
    ``_run_localize`` makes three such calls, which is what turned one test
    into a 404s hang and blew the job's 10-minute budget.

    Asserted here rather than in a conftest-internal test so the contract is
    visible next to the code that depends on it.
    """
    import socket

    import app.services.video_url_guard as guard

    assert guard.socket is not socket, "guard must resolve through a shim, not the real module"
    assert socket.getaddrinfo("localhost", 6379, type=socket.SOCK_STREAM)[0][4][0] in (
        "127.0.0.1",
        "::1",
    ), "global getaddrinfo must still resolve real hosts"
