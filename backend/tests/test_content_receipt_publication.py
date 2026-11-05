"""Gateway signing → backend public-key verification → actual admin publication.

The upstream is synthetic. No paid model, provider bill or real exam is claimed.
"""

import copy
import importlib.util
import json
import sys
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import func, select

from app.core.config import Settings
from app.core.security import create_token
from app.models.teaching import ExamAnalysisRevision
from app.models.user import RoleType
from app.services import teaching_gateway
from app.services.teaching.content import normalized_question, validate_candidate
from tests.teaching_fixtures import seed_original_content


def load_gateway(monkeypatch):
    root = Path(__file__).resolve().parents[2] / "deploy" / "v2-gateway" / "adapter"
    for name, filename in (("content_receipts", "content_receipts.py"), ("receipt_gateway_under_test", "app.py")):
        spec = importlib.util.spec_from_file_location(name, root / filename)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
    return sys.modules["receipt_gateway_under_test"]


async def test_signed_gateway_evidence_reaches_publication_without_a_true_verifier_stub(
    client, db_session, monkeypatch, tmp_path
):
    user, original, _, candidate = await seed_original_content(db_session)
    user.role = RoleType.admin
    await db_session.commit()
    headers = {"Authorization": f"Bearer {create_token(user.id)}"}
    private = Ed25519PrivateKey.generate()
    key_path = tmp_path / "gateway-only-key.pem"
    key_path.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )
    )
    public = (
        private.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    monkeypatch.setenv("CONTENT_RECEIPTS_ENABLED", "true")
    monkeypatch.setenv("CONTENT_RECEIPT_PRIVATE_KEY_FILE", str(key_path))
    monkeypatch.setenv("CONTENT_RECEIPT_KEY_ID", "bridge-1")
    monkeypatch.setenv("CONTENT_RECEIPT_ISSUER", "bridge-gateway")
    monkeypatch.setenv(
        "CONTENT_RECEIPT_MODEL_FAMILIES", json.dumps({"observed-a": "family-a", "observed-b": "family-b"})
    )
    # The backend receives public keys only. Its real receipt verifier is used.
    settings = Settings(
        _env_file=None,
        env="testing",
        jwt_secret="test_secret_for_receipts_at_least_32_chars",
        database_url="sqlite+aiosqlite:///:memory:",
        content_receipts_enabled=True,
        content_receipt_public_keys={"bridge-1": public},
        content_receipt_issuer="bridge-gateway",
    )
    monkeypatch.setattr(teaching_gateway, "get_settings", lambda: settings)
    gateway = load_gateway(monkeypatch)
    observed = []

    async def upstream(_url, _method, call_headers, body):
        assert call_headers["authorization"] == "Bearer synthetic-service-key"
        request = json.loads(body)
        value = json.loads(request["messages"][1]["content"])
        observed.append(request)
        if "options" in value:
            assert "correct_answer" not in value
            result = {
                "selected_position": next(
                    row["position"]
                    for row in value["options"]
                    if row["text"] == candidate["question_payload"]["options"]["B"]
                )
            }
        else:
            result = {check: True for check in gateway.content_receipts.CHECKS}
        return (
            200,
            {"content-type": "application/json"},
            json.dumps(
                {
                    "id": f"observed-call-{len(observed)}",
                    "model": "observed-a" if request["model"] == "alias-a" else "observed-b",
                    "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(result)}}],
                }
            ).encode(),
        )

    monkeypatch.setattr(gateway, "_call", upstream)
    question = normalized_question(candidate["question_payload"])
    review = {
        "question": question,
        "correct_answer": candidate["correct_answer"],
        "option_analyses": candidate["option_analyses"],
        "hints": candidate["reviewed_hints"],
        "analysis": candidate["analysis_payload"],
        "evidence": candidate["evidence"],
    }
    candidate["verification_report"]["blind_answers"] = []
    candidate["verification_report"]["teaching_checks"] = []
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=gateway.app), base_url="http://gateway.test"
    ) as upstream_client:
        for alias, order in (("alias-a", list("CADB")), ("alias-b", list("BDAC"))):
            for kind, value in (
                ("blind-answer-v1", {"model": alias, "input": question, "option_order": order}),
                ("teaching-review-v1", {"model": alias, "input": review}),
            ):
                response = await upstream_client.post(
                    f"/content-verification/{kind}",
                    headers={"Authorization": "Bearer synthetic-service-key"},
                    json=value,
                )
                assert response.status_code == 200, response.text
                target = "blind_answers" if kind == "blind-answer-v1" else "teaching_checks"
                candidate["verification_report"][target].append(response.json())
    assert len(observed) == 4
    validate_candidate(candidate)
    base = "/api/v1/admin/teaching-content/drafts"
    created = await client.post(base, headers=headers, json={"operation_id": "signed-create", "manifest": candidate})
    assert created.status_code == 201
    released = await client.post(
        f"{base}/{created.json()['id']}/publish",
        headers=headers,
        json={"operation_id": "signed-publish", "expected_version": 1},
    )
    assert released.status_code == 200, released.text
    assert released.json()["published_revision_id"] != original.id
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 2
    forged = copy.deepcopy(candidate)
    forged["verification_report"]["blind_answers"][0]["model_family"] = "forged-family"
    validate_candidate(forged)  # Shape/consensus alone would accept this claim.
    created = await client.post(base, headers=headers, json={"operation_id": "forged-create", "manifest": forged})
    rejected = await client.post(
        f"{base}/{created.json()['id']}/publish",
        headers=headers,
        json={"operation_id": "forged-publish", "expected_version": 1},
    )
    assert rejected.status_code == 422
    assert await db_session.scalar(select(func.count()).select_from(ExamAnalysisRevision)) == 2
