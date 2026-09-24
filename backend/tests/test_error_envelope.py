"""The 422 envelope must survive whatever a validator puts in ``input``.

Starlette renders every response with ``json.dumps(..., allow_nan=False)``, so a
``RequestValidationError`` that echoes a non-finite float back to the client
cannot be serialized at all: the handler raises ``ValueError`` and a malformed
request comes back as a 500 with no usable message.

``NaN`` / ``Infinity`` / ``-Infinity`` are not valid JSON, but the stdlib parser
accepts the bare tokens, so they reach Pydantic through the ordinary body path —
no exotic client needed.
"""

from httpx import AsyncClient

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
