"""Resumable operator collection, using actual Ed25519 receipts, no paid model."""

import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.core import database
from app.core.config import Settings
from app.core.errors import AppError
from app.models.user import RoleType
from app.services import teaching_gateway
from app.services.teaching import content, qualification
from scripts import content_verification_job as jobs
from scripts.qualify_teaching_content import manifests
from tests.conftest import TestSessionLocal
from tests.teaching_fixtures import original_candidate, seed_original_content
from tests.test_content_receipt_publication import load_gateway


def setup_job(tmp_path, candidate=None):
    path = tmp_path / "candidate.json"
    path.write_text(json.dumps(candidate or original_candidate()), encoding="utf-8")
    folder = tmp_path / "job"
    result = jobs.prepare(path, folder, ["alias-a", "alias-b"])
    assert not result["published"]
    return folder


@pytest.fixture
def gateway(tmp_path, monkeypatch):
    private = Ed25519PrivateKey.generate()
    path = tmp_path / "gateway-private.pem"
    path.write_bytes(
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
    monkeypatch.setenv("CONTENT_RECEIPT_PRIVATE_KEY_FILE", str(path))
    monkeypatch.setenv("CONTENT_RECEIPT_KEY_ID", "job-test")
    monkeypatch.setenv("CONTENT_RECEIPT_ISSUER", "job-gateway")
    monkeypatch.setenv(
        "CONTENT_RECEIPT_MODEL_FAMILIES", json.dumps({"observed-a": "family-a", "observed-b": "family-b"})
    )
    configured = Settings(
        _env_file=None,
        env="testing",
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret="test_content_job_secret_at_least_32_characters",
        content_receipts_enabled=True,
        content_receipt_public_keys={"job-test": public},
        content_receipt_issuer="job-gateway",
        content_verification_api_key="dedicated-virtual-key",
        llm_gateway_base_url="http://gateway.test",
        llm_gateway_governance_verified=True,
        llm_gateway_api_key="legacy-service-key",
        llm_gateway_admin_key="admin-key",
        llm_gateway_v2_team_id="team-test",
    )
    monkeypatch.setattr(teaching_gateway, "get_settings", lambda: configured)
    adapter = load_gateway(monkeypatch)
    requests = []

    async def upstream(_url, _method, headers, body):
        assert headers["authorization"] == "Bearer dedicated-virtual-key"
        payload = json.loads(body)
        requests.append(payload)
        value = json.loads(payload["messages"][1]["content"])
        if "options" in value:
            correct_text = original_candidate()["question_payload"]["options"]["B"]
            position = next(o["position"] for o in value["options"] if o["text"] == correct_text)
            result = {"selected_position": position}
        else:
            result = dict.fromkeys(
                ("evidence_entails_answer", "distractors_supported", "hints_non_revealing", "one_correct_option"), True
            )
        response = {
            "id": f"response-{len(requests)}",
            "model": "observed-" + payload["model"][-1],
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(result)}}],
        }
        return 200, {}, json.dumps(response).encode()

    monkeypatch.setattr(adapter, "_call", upstream)
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        return real_client(*args, transport=httpx.ASGITransport(app=adapter.app), **kwargs)

    monkeypatch.setattr(teaching_gateway.httpx, "AsyncClient", factory)
    return configured, adapter, requests


def test_plan_has_no_receipts_or_blind_answer_and_uses_same_review_hash(tmp_path):
    folder = setup_job(tmp_path)
    prepared = jobs.read_json(folder / "job.json")["plan"]
    assert not prepared["candidate"]["verification_report"]["blind_answers"]
    for step in prepared["steps"][:2]:
        assert "correct_answer" not in step["payload"]["input"]
        assert sorted(step["payload"]["option_order"]) == list("ABCD")
    assert (
        content.stable_hash(prepared["steps"][2]["payload"]["input"])
        == original_candidate()["verification_report"]["teaching_checks"][0]["input_sha256"]
    )
    with pytest.raises(FileExistsError):
        jobs.prepare(tmp_path / "candidate.json", folder, ["alias-a", "alias-b"])


@pytest.mark.parametrize("defect", ["model_rights", "evidence", "sources", "models"])
def test_invalid_material_cannot_create_a_job_or_send_content(tmp_path, defect):
    candidate = original_candidate()
    models = ["a", "b"]
    if defect == "model_rights":
        candidate["rights_policy"]["model_processing"] = False
    elif defect == "evidence":
        candidate["evidence"][0]["quote_hash"] = "0" * 64
    elif defect == "sources":
        candidate["verification_report"]["sources"] = []
    else:
        models = ["a", "a"]
    with pytest.raises(AppError):
        qualification.plan(candidate, models)
    assert not (tmp_path / "job").exists()


async def test_signed_collection_is_resumable_and_does_not_publish(tmp_path, gateway):
    folder = setup_job(tmp_path)
    configured, _, requests = gateway
    result = await jobs.execute(folder)
    assert result["status"] == "qualified" and not result["published"] and len(requests) == 4
    manifest = jobs.read_json(folder / "manifest.json")
    content.validate_candidate(manifest)
    checkpoint = (folder / "job.json").read_text(encoding="utf-8")
    assert (
        "dedicated-virtual-key" not in checkpoint and "PRIVATE KEY" not in checkpoint and "admin-key" not in checkpoint
    )
    # Pure assembly/revalidation does not need dispatch credentials or governance.
    configured.content_verification_api_key = ""
    configured.llm_gateway_governance_verified = False
    assert (await jobs.execute(folder))["status"] == "qualified"
    assert len(requests) == 4


@pytest.mark.parametrize("defect", ["governance", "master", "missing_key", "verifier"])
async def test_dispatch_guards_leave_pending_steps_untouched(tmp_path, gateway, defect):
    configured, _, requests = gateway
    folder = setup_job(tmp_path)
    if defect == "governance":
        configured.llm_gateway_governance_verified = False
    elif defect == "master":
        configured.content_verification_api_key = configured.llm_gateway_admin_key
    elif defect == "missing_key":
        configured.content_verification_api_key = ""
    else:
        configured.content_receipts_enabled = False
    with pytest.raises(AppError):
        await jobs.execute(folder)
    assert not requests
    assert all(s["status"] == "pending" for s in jobs.read_json(folder / "job.json")["steps"])


async def test_lost_response_never_retries_and_signed_recovery_continues_remaining_steps(
    tmp_path, gateway, monkeypatch
):
    folder = setup_job(tmp_path)
    _, _, requests = gateway
    collect = teaching_gateway.collect_content_receipt
    lost = {}

    async def lose_second(kind, payload):
        receipt = await collect(kind, payload)
        # The durable marker must precede the billable call.
        saved = jobs.read_json(folder / "job.json")["steps"][len(requests) - 1]
        assert saved["status"] == "running"
        if len(requests) == 2:
            lost.update(receipt)
            raise AppError(503, "SERVICE_UNAVAILABLE", "upstream secret must not persist")
        return receipt

    monkeypatch.setattr(teaching_gateway, "collect_content_receipt", lose_second)
    assert (await jobs.execute(folder))["status"] == "uncertain"
    assert len(requests) == 2
    assert (await jobs.execute(folder))["status"] == "uncertain" and len(requests) == 2
    assert "upstream secret" not in (folder / "job.json").read_text(encoding="utf-8")
    path = tmp_path / "recovered.json"
    path.write_text(json.dumps({**lost, "model_family": "forged"}), encoding="utf-8")
    with pytest.raises(AppError):
        await jobs.recover(folder, 1, path)
    path.write_text(json.dumps(lost), encoding="utf-8")
    await jobs.recover(folder, 1, path)
    monkeypatch.setattr(teaching_gateway, "collect_content_receipt", collect)
    assert (await jobs.execute(folder))["status"] == "qualified" and len(requests) == 4


async def test_crashed_dispatch_and_changed_plan_are_not_silently_restarted(tmp_path, gateway):
    folder = setup_job(tmp_path)
    _, _, requests = gateway
    job = jobs.read_json(folder / "job.json")
    job["steps"][0]["status"] = "running"
    jobs._write(folder / "job.json", job)
    assert (await jobs.execute(folder))["status"] == "uncertain" and not requests
    job["plan"]["steps"][0]["payload"]["input"]["question"] = "changed"
    jobs._write(folder / "job.json", job)
    with pytest.raises(AppError) as exc:
        await jobs.execute(folder)
    assert exc.value.code == "CONTENT_REVISION_MISMATCH" and not requests


async def test_signed_wrong_answer_stops_further_spend_and_is_not_retried(tmp_path, gateway, monkeypatch):
    folder = setup_job(tmp_path)
    _, adapter, requests = gateway
    original = adapter._call

    async def wrong(*args):
        status, headers, body = await original(*args)
        data = json.loads(body)
        data["choices"][0]["message"]["content"] = '{"selected_position":0}'
        return status, headers, json.dumps(data).encode()

    monkeypatch.setattr(adapter, "_call", wrong)
    assert (await jobs.execute(folder))["status"] == "rejected" and len(requests) == 1
    assert (await jobs.execute(folder))["status"] == "rejected" and len(requests) == 1
    assert not (folder / "manifest.json").exists()


async def test_same_family_aliases_cannot_create_a_qualified_manifest(tmp_path, gateway, monkeypatch):
    folder = setup_job(tmp_path)
    monkeypatch.setenv("CONTENT_RECEIPT_MODEL_FAMILIES", json.dumps({"observed-a": "same", "observed-b": "same"}))
    assert (await jobs.execute(folder))["status"] == "rejected"
    assert not (folder / "manifest.json").exists()


async def test_collected_manifest_uses_existing_admin_publication_without_bypassing_verifier(
    tmp_path, gateway, db_session, monkeypatch
):
    user, _, _, candidate = await seed_original_content(db_session)
    user.role = RoleType.admin
    await db_session.commit()
    folder = setup_job(tmp_path, candidate)
    assert (await jobs.execute(folder))["status"] == "qualified"
    monkeypatch.setattr(database, "get_async_session_maker", lambda: TestSessionLocal)
    result, code = await manifests(
        folder / "manifest.json", publish=True, actor_id=user.id, operation_id="collected-batch"
    )
    assert code == 0 and result["published"] == 1 and result["items"][0]["receipts_authenticated"]
    replay, code = await manifests(
        folder / "manifest.json", publish=True, actor_id=user.id, operation_id="collected-batch"
    )
    assert code == 0 and replay["items"][0]["replayed"]


async def test_false_semantic_review_is_retained_and_stops_further_calls(tmp_path, gateway, monkeypatch):
    folder = setup_job(tmp_path)
    _, adapter, requests = gateway
    original = adapter._call

    async def fail_review(*args):
        status, headers, body = await original(*args)
        data = json.loads(body)
        result = json.loads(data["choices"][0]["message"]["content"])
        if "hints_non_revealing" in result:
            result["hints_non_revealing"] = False
        data["choices"][0]["message"]["content"] = json.dumps(result)
        return status, headers, json.dumps(data).encode()

    monkeypatch.setattr(adapter, "_call", fail_review)
    assert (await jobs.execute(folder))["status"] == "rejected" and len(requests) == 3
    saved = jobs.read_json(folder / "job.json")
    assert saved["steps"][2]["receipt"]["checks"]["hints_non_revealing"] is False
    assert not (folder / "manifest.json").exists()


def test_os_lock_excludes_a_second_writer_and_releases_normally(tmp_path):
    folder = setup_job(tmp_path)
    with jobs._locked(folder), pytest.raises(AppError) as exc:
        with jobs._locked(folder):
            pytest.fail("second writer acquired the lock")
    assert exc.value.status_code == 409
    with jobs._locked(folder):
        assert (folder / "job.json").is_file()


def test_os_lock_is_released_after_real_process_exit(tmp_path):
    folder = setup_job(tmp_path)
    process = subprocess.run(
        [
            sys.executable,
            "-c",
            "import os,sys; from pathlib import Path; from scripts.content_verification_job import _locked; lock=_locked(Path(sys.argv[1])); lock.__enter__(); os._exit(0)",
            str(folder),
        ],
        capture_output=True,
        timeout=20,
        env={**os.environ, "PYTHONUTF8": "1"},
    )
    assert process.returncode == 0, process.stderr.decode("utf-8", errors="replace")
    with jobs._locked(folder):
        assert (folder / "job.json").is_file()


def test_real_cli_guard_is_sanitized_and_does_not_change_prepared_job(tmp_path):
    folder = setup_job(tmp_path)
    process = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).resolve().parents[1] / "scripts/qualify_teaching_content.py"),
            "run-verification",
            "--job-dir",
            str(folder),
        ],
        cwd=tmp_path,
        capture_output=True,
        timeout=20,
        env={
            **os.environ,
            "PYTHONUTF8": "1",
            "LLM_GATEWAY_GOVERNANCE_VERIFIED": "false",
            "CONTENT_RECEIPTS_ENABLED": "false",
            "TEACHING_RUNS_ENABLED": "false",
        },
    )
    assert process.returncode == 2, process.stderr.decode("utf-8", errors="replace")
    result = json.loads(process.stdout)
    assert result["code"] == "SERVICE_UNAVAILABLE" and result["published"] == 0
    assert all(s["status"] == "pending" for s in jobs.read_json(folder / "job.json")["steps"])
