"""Actual signature issuance against a synthetic authenticated gateway seam."""

import asyncio
import json

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from test_adapter import run

import app as adapter


def question():
    return {
        "level": "cet4",
        "year": 2025,
        "month": 12,
        "set_no": 1,
        "number": 46,
        "question_type": "reading",
        "passage": "Blue pots retained water longer.",
        "question": "What did the team find?",
        "options": {"A": "Weight", "B": "Water", "C": "Heat", "D": "Height"},
        "normalization_version": "unicode-nfc-lf-v1",
    }


def payload():
    return {"model": "teaching", "input": question(), "option_order": list("CADB")}


@pytest.fixture
def signer(tmp_path, monkeypatch):
    private = Ed25519PrivateKey.generate()
    path = tmp_path / "receipt-key.pem"
    path.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )
    )
    monkeypatch.setenv("CONTENT_RECEIPTS_ENABLED", "true")
    monkeypatch.setenv("CONTENT_RECEIPT_PRIVATE_KEY_FILE", str(path))
    monkeypatch.setenv("CONTENT_RECEIPT_KEY_ID", "test-1")
    monkeypatch.setenv("CONTENT_RECEIPT_ISSUER", "test-gateway")
    monkeypatch.setenv("CONTENT_RECEIPT_MODEL_FAMILIES", json.dumps({"observed-a": "family-a"}))
    return private.public_key()


def response(*, model="observed-a", content='{"selected_position":3}', finish="stop"):
    return {
        "model": model,
        "id": "observed-response-1",
        "choices": [{"finish_reason": finish, "message": {"content": content}}],
    }


def install(monkeypatch, result, *, status=200, seen=None):
    async def call(url, method, headers, body):
        if seen is not None:
            seen.append((url, headers, json.loads(body)))
        return status, {"content-type": "application/json"}, json.dumps(result).encode()

    monkeypatch.setattr(adapter, "_call", call)


def invoke(value=None, *, headers=None, kind="blind-answer-v1"):
    return run(
        adapter.app,
        "POST",
        f"/content-verification/{kind}",
        json=value or payload(),
        headers=headers or {"Authorization": "Bearer allowed-gateway-key"},
    )


def test_fixed_prompt_uses_actual_response_identity_and_signs_only_observed_fields(signer, monkeypatch):
    seen = []
    install(monkeypatch, response(), seen=seen)
    result = invoke()
    assert result.status_code == 200 and result.headers["cache-control"] == "no-store"
    value = result.json()
    assert value["model"] == "observed-a" and value["model_family"] == "family-a"
    assert value["selected_position"] == 3 and value["option_order"] == list("CADB")
    token = value.pop("gateway_receipt")
    claims = jwt.decode(
        token, signer, algorithms=["EdDSA"], audience="seeword-content-publication", issuer="test-gateway"
    )
    assert claims["receipt"] == value and claims["prompt_version"] == "blind-answer-v1"
    assert seen[0][0].endswith("/chat/completions") and seen[0][1]["authorization"] == "Bearer allowed-gateway-key"
    model_request = seen[0][2]
    assert model_request["metadata"]["logical_call_id"] == value["logical_call_id"]
    assert model_request["metadata"]["input_sha256"] == value["input_sha256"]
    assert model_request["stream"] is False and model_request["max_tokens"] == adapter.MODEL_MAX_OUTPUT_TOKENS
    model_input = json.loads(model_request["messages"][1]["content"])
    assert "correct_answer" not in str(model_request)
    assert model_input["options"][3] == {"position": 3, "text": "Water"}
    assert "Blue pots" not in json.dumps(claims) and "PRIVATE KEY" not in result.text


@pytest.mark.parametrize("extra", [{"messages": []}, {"model_family": "fake-family"}, {"verified": True}])
def test_callers_cannot_choose_prompt_or_attested_model_family(signer, monkeypatch, extra):
    async def never(*args):
        raise AssertionError("Malformed inputs must not call a model")

    monkeypatch.setattr(adapter, "_call", never)
    assert invoke({**payload(), **extra}).status_code == 422


@pytest.mark.parametrize(
    "model,content,finish",
    [
        ("unrecognized", '{"selected_position":3}', "stop"),
        ("observed-a", '{"selected_position":3}', "length"),
        ("observed-a", '{"selected_position":true}', "stop"),
        ("observed-a", "free-form explanation", "stop"),
    ],
)
def test_bad_or_incomplete_outputs_never_issue_receipts(signer, monkeypatch, model, content, finish):
    install(monkeypatch, response(model=model, content=content, finish=finish))
    result = invoke()
    assert result.status_code == 502 and "gateway_receipt" not in result.text


@pytest.mark.parametrize("status", [401, 403, 429, 503])
def test_gateway_auth_and_budget_errors_cannot_become_signed_success(signer, monkeypatch, status):
    install(monkeypatch, {"error": "rejected"}, status=status)
    result = invoke()
    assert result.status_code == status and "gateway_receipt" not in result.text


def test_missing_credentials_and_disabled_signer_fail_before_forwarding(monkeypatch):
    async def never(*args):
        raise AssertionError("No model call is allowed")

    monkeypatch.setattr(adapter, "_call", never)
    monkeypatch.setenv("CONTENT_RECEIPTS_ENABLED", "false")
    assert invoke(headers={"x-test": "no token"}).status_code == 401
    assert invoke().status_code == 503


def test_review_false_is_signed_as_false_not_promoted_to_pass(signer, monkeypatch):
    checks = {name: True for name in adapter.content_receipts.CHECKS}
    checks["one_correct_option"] = False
    install(monkeypatch, response(content=json.dumps(checks)))
    review = {
        "question": question(),
        "correct_answer": "B",
        "option_analyses": {k: k for k in "ABCD"},
        "hints": ["Compare the findings"],
        "analysis": {"summary": "A comparison"},
        "evidence": [{"quote": "Water"}],
    }
    result = invoke({"model": "teaching", "input": review}, kind="teaching-review-v1")
    assert result.status_code == 200 and result.json()["checks"]["one_correct_option"] is False


def test_cancelled_relay_does_not_cancel_the_dispatched_upstream(monkeypatch):
    async def exercise():
        started, release, finished = asyncio.Event(), asyncio.Event(), asyncio.Event()

        async def call(*args):
            started.set()
            await release.wait()
            finished.set()
            return 200, {}, b"ok"

        monkeypatch.setattr(adapter, "_call", call)
        task = asyncio.create_task(adapter._drained_call("http://gateway.test", "POST", {}, b"{}"))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert adapter._background and not finished.is_set()
        release.set()
        await asyncio.wait_for(finished.wait(), 1)
        await asyncio.gather(*list(adapter._background))
        await asyncio.sleep(0)
        assert not adapter._background

    asyncio.run(exercise())
