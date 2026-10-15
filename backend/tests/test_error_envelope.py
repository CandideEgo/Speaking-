"""The 422 envelope must survive whatever a validator puts in ``input``.

Starlette renders every response with ``json.dumps(..., allow_nan=False)``, so a
``RequestValidationError`` that echoes a non-finite float back to the client
cannot be serialized at all: the handler raises ``ValueError`` and a malformed
request comes back as a 500 with no usable message.

``NaN`` / ``Infinity`` / ``-Infinity`` are not valid JSON, but the stdlib parser
accepts the bare tokens, so they reach Pydantic through the ordinary body path —
no exotic client needed.
"""

from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.core.errors import ErrorCode
from app.main import _unhandled_exception_handler, create_app

# The tokens are deliberately unquoted: that is how a non-finite float arrives.
_NAN = "NaN"
_INF = "Infinity"
_NEG_INF = "-Infinity"


def _raw_json(headers: dict) -> dict:
    """httpx infers ``application/json`` only from ``json=``; a raw body needs
    the header spelled out, or FastAPI sees a plain string and reports the whole
    body as unparseable instead of validating the field."""
    return {**headers, "Content-Type": "application/json"}


class TestValidationEnvelopeSurvivesNonFiniteFloats:
    async def test_nan_in_a_string_field_yields_a_422_envelope(self, client: AsyncClient, auth_headers: dict):
        """Any field, not just a float one — a bare ``NaN`` token hits typed
        validators on strings, ints and literals the same way."""
        resp = await client.patch(
            "/api/v1/learning/progress",
            headers=_raw_json(auth_headers),
            content=f'{{"video_id": {_NAN}, "position_seconds": 1.0}}',
        )

        assert resp.status_code == 422
        body = resp.json()
        assert body["code"] == "VALIDATION_ERROR"
        assert "video_id" in body["message"]

    async def test_non_finite_position_reports_the_token_as_text(self, client: AsyncClient, auth_headers: dict):
        """The offending value is still worth reporting — as text, since it has
        no JSON number to be reported as."""
        resp = await client.patch(
            "/api/v1/learning/progress",
            headers=_raw_json(auth_headers),
            content=f'{{"video_id": "vid", "position_seconds": {_NAN}}}',
        )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail[0]["loc"] == ["body", "position_seconds"]
        assert detail[0]["input"] == "nan"

    async def test_infinity_and_negative_infinity_are_reported(self, client: AsyncClient, auth_headers: dict):
        for token, rendered in ((_INF, "inf"), (_NEG_INF, "-inf")):
            resp = await client.patch(
                "/api/v1/learning/progress",
                headers=_raw_json(auth_headers),
                content=f'{{"video_id": "vid", "position_seconds": {token}}}',
            )
            assert resp.status_code == 422, f"{token} produced {resp.status_code}"
            assert resp.json()["detail"][0]["input"] == rendered

    async def test_nested_non_finite_value_does_not_break_the_envelope(self, client: AsyncClient, auth_headers: dict):
        """A validator can report on a structure rather than a scalar, and the
        whole structure is echoed — one non-finite leaf would poison it all."""
        resp = await client.patch(
            "/api/v1/learning/progress",
            headers=_raw_json(auth_headers),
            content=f'{{"video_id": "vid", "position_seconds": [{_NAN}]}}',
        )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail[0]["loc"] == ["body", "position_seconds"]
        assert detail[0]["input"] == ["nan"]

    async def test_ordinary_validation_errors_are_unchanged(self, client: AsyncClient, auth_headers: dict):
        """The sanitizer must not touch finite values or error structure."""
        resp = await client.patch(
            "/api/v1/learning/progress",
            headers=_raw_json(auth_headers),
            content='{"video_id": "vid", "position_seconds": -5.0}',
        )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail[0]["input"] == -5.0
        assert detail[0]["type"] == "greater_than_equal"


def _http_scope(path: str = "/api/v1/anything") -> dict:
    """A complete ASGI http scope — ``Request.url`` reads scheme/server/path/
    query_string, so a partial scope raises before the handler is exercised."""
    return {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "server": ("test", 80),
        "client": ("test", 1234),
        "root_path": "",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "state": {"request_id": "req-abc123"},
    }


class TestUnhandledExceptionsBecomeAnEnvelope:
    """The catch-all handler (batch 1a).

    Before it, a ``ValueError`` from a service whose wording the router did not
    pattern-match fell through all five handlers and became a bare 500 with no
    body at all. These tests pin the replacement contract.
    """

    def test_catch_all_is_registered(self):
        assert Exception in create_app().exception_handlers

    async def test_end_to_end_a_raising_route_returns_the_envelope(self):
        """Wiring, not just the function: an unhandled exception on a real route.

        ``raise_app_exceptions=False`` is required — Starlette's
        ServerErrorMiddleware sends this response and *then* re-raises, so the
        default (re-raise) would surface the ValueError instead of the 500.
        """
        app = create_app()

        @app.get("/__boom__")
        async def _boom() -> dict:  # pragma: no cover - never returns
            raise ValueError("该视频还没有生词")

        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/__boom__")

        assert resp.status_code == 500
        body = resp.json()
        assert body["code"] == ErrorCode.INTERNAL_ERROR
        assert sorted(body.keys()) == ["code", "message"]

    async def test_the_raw_message_is_logged_not_returned(self):
        """The original text can name internal details, so it stays server-side."""
        secret = "该视频还没有生词 video=vid-internal-42"
        resp = await _unhandled_exception_handler(Request(_http_scope()), ValueError(secret))

        assert resp.status_code == 500
        body = resp.body.decode()
        assert "vid-internal-42" not in body
        assert "ValueError" not in body
        assert ErrorCode.INTERNAL_ERROR in body
