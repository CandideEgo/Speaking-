"""Redaction tests (A09): secrets in URLs/headers must not leave the process."""

from __future__ import annotations

from app.core.redaction import redact, redact_value


def test_media_token_query_is_redacted():
    url = "https://seeword.top/media/abc.mp4?token=eyJhbGciOi.payload.sig&range=1"
    out = redact(url)
    assert "eyJhbGciOi" not in out
    assert "token=***" in out
    assert "range=1" in out  # non-secret params stay readable


def test_connection_string_password_is_redacted():
    out = redact("cannot connect to postgresql+asyncpg://seeword:s3cret@db:5432/seeword and redis://:pw@redis:6379/0")
    assert "s3cret" not in out
    assert "redis://***@redis" in out
    assert "postgresql+asyncpg://***@db" in out


def test_bearer_header_is_redacted():
    out = redact("Authorization: Bearer abc.def.ghi")
    assert "abc.def.ghi" not in out
    assert "Bearer ***" in out


def test_redaction_is_idempotent():
    once = redact("https://x/media/a.mp4?token=secret123")
    assert redact(once) == once


def test_redact_value_walks_nested_structures():
    event = {
        "request": {"query_string": "token=abc123", "headers": {"Authorization": "Bearer xyz"}},
        "exception": {"values": [{"value": "redis://:pw@host/0"}]},
        "count": 3,
    }
    out = redact_value(event)
    assert "abc123" not in str(out)
    assert "pw@" not in str(out)
    assert out["count"] == 3
