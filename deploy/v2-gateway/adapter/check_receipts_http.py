"""Local real-HTTP smoke with synthetic upstream; no DB, provider or network needed.

Run in the adapter image with --network none and mount the backend verifier
read-only, then pass --backend-verifier /verify/content_receipts.py.
"""

import argparse
import asyncio
import importlib.metadata
import importlib.util
import json
import os
import socket
import sys
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path

import httpx
import uvicorn
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# Prefer the sibling adapter on Windows; a mounted smoke uses the image workdir.
adapter_dir = Path(__file__).resolve().parent
if not (adapter_dir / "app.py").is_file():
    adapter_dir = Path.cwd()
sys.path.insert(0, str(adapter_dir))
import app as adapter


@contextmanager
def serve(application):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(application, lifespan="off", access_log=False, log_level="error"))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    thread.start()
    try:
        yield server, f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        listener.close()
        if thread.is_alive():
            raise RuntimeError("HTTP smoke server failed to stop")


async def ready(server):
    async with asyncio.timeout(5):
        while not server.started:
            await asyncio.sleep(0.01)


async def main(verifier_path: Path):
    spec = importlib.util.spec_from_file_location("backend_public_receipt_verifier", verifier_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load backend verifier")
    backend = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backend)
    upstream = FastAPI()

    @upstream.post("/chat/completions")
    async def completion(request: Request):
        if request.headers.get("authorization") != "Bearer synthetic-only-key":
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        body = await request.json()
        assert body["stream"] is False and body["max_tokens"] > 0
        return {
            "id": "synthetic-http-response",
            "model": "synthetic-observed-model",
            "choices": [{"finish_reason": "stop", "message": {"content": '{"selected_position":3}'}}],
        }

    private = Ed25519PrivateKey.generate()
    public = (
        private.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    with tempfile.TemporaryDirectory(prefix="receipt-http-") as folder:
        path = Path(folder) / "gateway-private.pem"
        path.write_bytes(
            private.private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
            )
        )
        os.environ.update(
            {
                "CONTENT_RECEIPTS_ENABLED": "true",
                "CONTENT_RECEIPT_PRIVATE_KEY_FILE": str(path),
                "CONTENT_RECEIPT_KEY_ID": "http-smoke",
                "CONTENT_RECEIPT_ISSUER": "synthetic-http-gateway",
                "CONTENT_RECEIPT_MODEL_FAMILIES": json.dumps({"synthetic-observed-model": "synthetic-family"}),
                "NO_PROXY": "127.0.0.1,localhost",
            }
        )
        with serve(upstream) as (upstream_server, upstream_url):
            await ready(upstream_server)
            adapter.LITELLM_BASE = upstream_url
            with serve(adapter.app) as (gateway_server, gateway_url):
                await ready(gateway_server)
                value = {
                    "model": "synthetic-alias",
                    "option_order": list("CADB"),
                    "input": {
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
                    },
                }
                async with httpx.AsyncClient(trust_env=False, timeout=5) as client:
                    response = await client.post(
                        gateway_url + "/content-verification/blind-answer-v1",
                        json=value,
                        headers={"Authorization": "Bearer synthetic-only-key"},
                    )
                    assert response.status_code == 200, response.status_code
                    receipt = response.json()
                    options = {
                        "keys": {"http-smoke": public},
                        "issuer": "synthetic-http-gateway",
                        "max_age_seconds": 86400,
                    }
                    assert backend.verify_receipt(receipt, **options)
                    assert not backend.verify_receipt({**receipt, "model_family": "forged-family"}, **options)
                    denied = await client.post(
                        gateway_url + "/content-verification/blind-answer-v1",
                        json=value,
                        headers={"Authorization": "Bearer wrong-key"},
                    )
                    assert denied.status_code == 401 and "gateway_receipt" not in denied.text
                    assert "PRIVATE KEY" not in response.text
    print("PASS real loopback HTTP: gateway signature → backend public-key verification")
    print("PASS unauthorized upstream and tampered model family rejected")
    print("Runtime:", {name: importlib.metadata.version(name) for name in ("PyJWT", "cryptography", "fastapi")})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-verifier", type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(main(args.backend_verifier))
