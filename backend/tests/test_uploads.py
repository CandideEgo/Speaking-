"""Tests for ``app.core.uploads.read_upload_bounded`` (H10 memory guard).

The helper exists because ``UploadFile.read()`` materializes the whole part:
with nginx's ``client_max_body_size 500m`` a single request could put hundreds
of megabytes on the heap before a post-read size check raised. These tests
pin the two layers — the declared ``Content-Length`` pre-check and the
chunked cumulative guard — and assert that the reader stops as soon as the
cap is known to be exceeded.
"""

import pytest
from fastapi import HTTPException

from app.core.uploads import _CHUNK, read_upload_bounded


class _FakeRequest:
    """Just enough of a Request for the header pre-check."""

    def __init__(self, content_length: str | None = None):
        self.headers = {} if content_length is None else {"content-length": content_length}


class _FakeUpload:
    """Serves ``total`` bytes, recording every read size it is asked for.

    An unbounded read (``size`` omitted or negative) fails the test outright:
    that is exactly the call that would materialize the whole upload.
    """

    def __init__(self, total: int):
        self.remaining = total
        self.read_sizes: list[int] = []
        self.served = 0

    async def read(self, size: int = -1) -> bytes:
        assert size is not None and size > 0, "unbounded read: the whole upload would be materialized"
        self.read_sizes.append(size)
        n = min(size, self.remaining)
        self.remaining -= n
        self.served += n
        return b"x" * n


async def test_within_limit_returns_full_content():
    upload = _FakeUpload(_CHUNK + 10)

    data = await read_upload_bounded(_FakeRequest(), upload, _CHUNK + 100, status_code=413, detail="too large")

    assert data == b"x" * (_CHUNK + 10)
    # Two data chunks plus the empty read that terminates the loop.
    assert upload.read_sizes == [_CHUNK, _CHUNK, _CHUNK]


async def test_declared_content_length_rejects_before_any_read():
    upload = _FakeUpload(500 * 1024 * 1024)

    with pytest.raises(HTTPException) as exc:
        await read_upload_bounded(
            _FakeRequest("524288000"), upload, 5 * 1024 * 1024, status_code=413, detail="too large"
        )

    assert exc.value.status_code == 413
    assert exc.value.detail == "too large"
    assert upload.read_sizes == []
    assert upload.served == 0


async def test_declared_length_lying_small_falls_back_to_chunked_guard():
    """A forged Content-Length must not get the oversized part streamed in."""
    upload = _FakeUpload(3 * 1024 * 1024)

    with pytest.raises(HTTPException) as exc:
        await read_upload_bounded(_FakeRequest("100"), upload, 1024 * 1024, status_code=413, detail="too large")

    assert exc.value.status_code == 413
    # Stopped on the first chunk that crossed the cap (cap + one chunk), not
    # after draining the remaining 2 MB.
    assert upload.served == 2 * 1024 * 1024
    assert upload.read_sizes == [_CHUNK, _CHUNK]


async def test_missing_content_length_uses_chunked_guard():
    """Chunked uploads (no Content-Length) are still capped."""
    upload = _FakeUpload(2 * 1024 * 1024)

    with pytest.raises(HTTPException) as exc:
        await read_upload_bounded(_FakeRequest(), upload, 1024 * 1024, status_code=400, detail="图片过大")

    assert exc.value.status_code == 400
    assert upload.served == 2 * 1024 * 1024


async def test_multipart_envelope_does_not_false_reject_a_max_sized_part():
    """Content-Length covers the whole multipart body, so a part of exactly
    the cap (plus a few hundred bytes of framing) must be accepted."""
    upload = _FakeUpload(5 * 1024 * 1024)

    data = await read_upload_bounded(
        _FakeRequest(str(5 * 1024 * 1024 + 300)), upload, 5 * 1024 * 1024, status_code=413, detail="too large"
    )

    assert len(data) == 5 * 1024 * 1024


async def test_non_numeric_content_length_is_ignored():
    upload = _FakeUpload(2048)

    data = await read_upload_bounded(_FakeRequest("not-a-number"), upload, 4096, status_code=413, detail="too large")

    assert data == b"x" * 2048
