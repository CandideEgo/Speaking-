"""Thin gateway adapter for SeeWord V2.

Two stateless relays around LiteLLM, so LiteLLM stays the single usage/cost
ledger:

* ``app`` (inbound, port 4000): drop-in proxy in front of LiteLLM. It rejects a
  request whose ``max_tokens`` exceeds the verified model output cap, and when
  the caller disconnects it keeps the LiteLLM request running to completion so
  LiteLLM settles instead of releasing the reservation on cancellation.
* ``shim_app`` (outbound, port 4100): LiteLLM's provider ``api_base`` points
  here. It forwards to the real provider and, when the provider omits a
  ``usage`` block, injects the conservative upper bound (estimated prompt
  tokens + requested output cap) so LiteLLM charges it through its normal
  settlement path.

No provider keys, budgets, or cost rows are stored here. Responses are buffered
(the V2 teaching turn is non-streaming).
"""

import asyncio
import json
import math
import os
from typing import Any

import content_receipts
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

LITELLM_BASE = os.environ.get("LITELLM_BASE_URL", "http://gateway:4000").rstrip("/")
UPSTREAM_BASE = os.environ.get("UPSTREAM_BASE_URL", "http://synthetic-provider:4010/v1").rstrip("/")
MODEL_MAX_OUTPUT_TOKENS = int(os.environ.get("MODEL_MAX_OUTPUT_TOKENS", "128"))
ADAPTER_TIMEOUT_SECONDS = float(os.environ.get("ADAPTER_TIMEOUT_SECONDS", "60"))

_HOP_HEADERS = {
    "host",
    "content-length",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
}

# Keep drained requests alive after the caller is gone.
_background: set[asyncio.Task[Any]] = set()


def _forward_headers(request: Request) -> dict[str, str]:
    return {key: value for key, value in request.headers.items() if key.lower() not in _HOP_HEADERS}


def _estimate_prompt_tokens(body: bytes) -> int:
    """Deliberately conservative upper bound, not a tokenizer claim.

    Two bytes per token over-counts English and covers CJK UTF-8 at roughly one
    token per character; unknown-usage charging should err high.
    """
    return max(1, math.ceil(len(body) / 2) + 8)


def _requested_output(payload: dict[str, Any]) -> int:
    value = payload.get("max_tokens", payload.get("max_completion_tokens"))
    if value is None:
        raise ValueError("max_tokens is required")
    tokens = int(value)
    if tokens <= 0:
        raise ValueError("max_tokens must be positive")
    return tokens


def _error(status: int, error_type: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"message": message, "type": error_type}}, status_code=status)


def _keep_running(task: asyncio.Task[Any]) -> None:
    _background.add(task)
    task.add_done_callback(_background.discard)


async def _call(url: str, method: str, headers: dict[str, str], body: bytes) -> tuple[int, dict[str, str], bytes]:
    async with httpx.AsyncClient(timeout=ADAPTER_TIMEOUT_SECONDS) as client:
        response = await client.request(method, url, headers=headers, content=body)
        return (
            response.status_code,
            {
                key: value
                for key, value in response.headers.items()
                if key.lower() not in _HOP_HEADERS and key.lower() != "content-encoding"
            },
            response.content,
        )


app = FastAPI(title="SeeWord V2 gateway adapter")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def _drained_call(
    url: str, method: str, headers: dict[str, str], body: bytes
) -> tuple[int, dict[str, str], bytes]:
    task = asyncio.create_task(_call(url, method, headers, body))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        _keep_running(task)
        raise


@app.post("/content-verification/{kind}")
async def verify_content(request: Request, kind: str) -> Response:
    if not request.headers.get("authorization", "").lower().startswith("bearer "):
        return _error(401, "authentication_error", "A gateway credential is required")
    body = await request.body()
    if len(body) > 131072:
        return _error(413, "verification_input_too_large", "Verification input exceeds 128 KiB")
    try:
        payload = json.loads(body)
        completion, receipt_input = content_receipts.completion_request(kind, payload, MODEL_MAX_OUTPUT_TOKENS)
    except (ValueError, TypeError, KeyError, AttributeError):
        return _error(422, "verification_input_invalid", "Invalid verification input")
    try:
        signer = content_receipts.signer()
    except content_receipts.ReceiptConfigurationError:
        return _error(503, "verification_unavailable", "Content receipt signing is not configured")
    try:
        status, _, response = await _drained_call(
            f"{LITELLM_BASE}/chat/completions",
            "POST",
            _forward_headers(request),
            json.dumps(completion, ensure_ascii=False, allow_nan=False).encode(),
        )
    except httpx.HTTPError:
        return _error(502, "verification_upstream_error", "Gateway verification request failed")
    if status != 200:
        return _error(
            status if 400 <= status < 600 else 502, "verification_upstream_error", "Gateway rejected verification"
        )
    try:
        data = json.loads(response)
        if not isinstance(data, dict):
            raise ValueError("Invalid gateway response")
        return JSONResponse(
            content_receipts.issue(kind, receipt_input, data, signer), headers={"Cache-Control": "no-store"}
        )
    except (ValueError, TypeError, KeyError, AttributeError):
        return _error(502, "verification_response_invalid", "No valid verification receipt was produced")


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(request: Request, path: str) -> Response:
    body = await request.body()
    is_completion = path.rstrip("/") in {"chat/completions", "v1/chat/completions"}
    if is_completion:
        try:
            payload = json.loads(body or b"{}")
            output_tokens = _requested_output(payload)
        except (ValueError, TypeError) as exc:
            return _error(422, "adapter_error", str(exc))
        if output_tokens > MODEL_MAX_OUTPUT_TOKENS:
            return _error(
                422,
                "output_cap_exceeded",
                f"max_tokens {output_tokens} exceeds the verified model output cap {MODEL_MAX_OUTPUT_TOKENS}",
            )

    query = request.url.query
    target = f"{LITELLM_BASE}/{path}" + (f"?{query}" if query else "")
    status, headers, content = await _drained_call(target, request.method, _forward_headers(request), body)
    return Response(content=content, status_code=status, headers=headers)


shim_app = FastAPI(title="SeeWord V2 provider usage shim")


@shim_app.get("/health")
async def shim_health() -> dict[str, str]:
    return {"status": "ok"}


async def _forward_upstream(request: Request, body: bytes) -> tuple[int, dict[str, str], bytes]:
    headers = _forward_headers(request)
    headers.pop("accept-encoding", None)
    if os.environ.get("ADAPTER_DEBUG_HEADERS") == "1":
        safe = {
            key: (f"<{len(value)} chars>" if key.lower() == "authorization" else value)
            for key, value in headers.items()
        }
        print(f"upstream headers: {safe}", flush=True)
    async with httpx.AsyncClient(timeout=ADAPTER_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{UPSTREAM_BASE}/chat/completions", headers=headers, content=body)
        return (
            response.status_code,
            {
                key: value
                for key, value in response.headers.items()
                if key.lower() not in _HOP_HEADERS and key.lower() != "content-encoding"
            },
            response.content,
        )


def _conservative_usage(body: bytes, payload: dict[str, Any]) -> dict[str, Any]:
    requested = payload.get("max_tokens", payload.get("max_completion_tokens"))
    output_cap = MODEL_MAX_OUTPUT_TOKENS if requested is None else min(int(requested), MODEL_MAX_OUTPUT_TOKENS)
    prompt = _estimate_prompt_tokens(body)
    return {"prompt_tokens": prompt, "completion_tokens": output_cap, "total_tokens": prompt + output_cap}


@shim_app.api_route("/{path:path}", methods=["POST"])
async def shim(request: Request, path: str) -> Response:
    body = await request.body()
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        return _error(400, "adapter_error", "invalid json")
    status, headers, content = await _forward_upstream(request, body)
    if status >= 300:
        return Response(content=content, status_code=status, headers=headers)

    content_type = headers.get("content-type", "")
    if "text/event-stream" in content_type:
        text = content.decode("utf-8", "replace")
        if '"usage"' not in text:
            usage = _conservative_usage(body, payload)
            chunk = json.dumps(
                {"id": "adapter-usage", "object": "chat.completion.chunk", "choices": [], "usage": usage},
                ensure_ascii=False,
            )
            marker = "data: [DONE]"
            if marker in text:
                text = text.replace(marker, f"data: {chunk}\n\n{marker}", 1)
            else:
                text = f"{text.rstrip()}\n\ndata: {chunk}\n\ndata: [DONE]\n\n"
        return Response(content=text.encode(), status_code=status, headers=headers)

    try:
        data = json.loads(content)
    except ValueError:
        return Response(content=content, status_code=status, headers=headers)
    if isinstance(data, dict) and not data.get("usage"):
        data["usage"] = _conservative_usage(body, payload)
    return JSONResponse(data, status_code=status)
