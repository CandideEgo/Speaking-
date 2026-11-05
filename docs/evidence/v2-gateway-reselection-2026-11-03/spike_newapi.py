"""Synthetic E3a reselection probe for New API.

Runs against the disposable stack in docker-compose.newapi.yml: one New API
gateway, one synthetic OpenAI-compatible provider, no real provider credentials.

Each scenario uses a fresh token so asynchronous settlement from an earlier
request cannot contaminate the next baseline.

Exit 0 means every bounded check passed; a failed governance check is evidence,
not permission to weaken the requirement.
"""

import asyncio
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

NEW_API = "http://127.0.0.1:13000"
PROVIDER = "http://127.0.0.1:14001"
ADMIN_USER = "root"
ADMIN_PASSWORD = "V2-synthetic-newapi-only-2026!"
MODEL = "synthetic-teaching"
# model_ratio=5 => $0.01/1K input; completion_ratio=4 => $0.04/1K output.
MODEL_RATIO = 5
COMPLETION_RATIO = 4
QUOTA_PER_USD = 500_000
# The synthetic provider reports completion_tokens=80 and prompt_tokens=10.
EXPECTED_ACTUAL_QUOTA = (10 + 80 * COMPLETION_RATIO) * MODEL_RATIO

results = []


def record(name, passed, **details):
    results.append({"name": name, "status": "passed" if passed else "failed", "details": details})
    print(f"{name}: {'passed' if passed else 'FAILED'}", flush=True)


class Admin:
    def __init__(self, client: httpx.Client):
        self.client = client
        self.headers = {}

    def login(self):
        data = self.client.post(
            "/api/user/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD}
        ).json()
        token = data["data"]["access_token"]
        self.headers = {"Authorization": f"Bearer {token}", "New-Api-User": "1"}

    def options(self):
        return {row["key"]: row["value"] for row in self.client.get("/api/option/", headers=self.headers).json()["data"]}

    def put_option(self, key, value):
        response = self.client.put("/api/option/", headers=self.headers, json={"key": key, "value": value})
        response.raise_for_status()

    def ensure_setup(self):
        ratios = json.loads(self.options()["ModelRatio"])
        completions = json.loads(self.options()["CompletionRatio"])
        if ratios.get(MODEL) != MODEL_RATIO or completions.get(MODEL) != COMPLETION_RATIO:
            ratios[MODEL] = MODEL_RATIO
            completions[MODEL] = COMPLETION_RATIO
            self.put_option("ModelRatio", json.dumps(ratios))
            self.put_option("CompletionRatio", json.dumps(completions))

    def ensure_channel(self):
        rows = self.client.get("/api/channel/?p=1&page_size=50", headers=self.headers).json()["data"]["items"]
        if any(MODEL in (row.get("models") or "") for row in rows):
            return
        response = self.client.post(
            "/api/channel/",
            headers=self.headers,
            json={
                "mode": "single",
                "channel": {
                    "name": "synthetic-provider",
                    "type": 1,
                    "key": "synthetic-not-a-provider-key",
                    "base_url": "http://synthetic-provider:4010",
                    "models": MODEL,
                    "group": "default",
                    "model_mapping": "",
                    "priority": 0,
                    "weight": 1,
                    "status": 1,
                },
            },
        )
        response.raise_for_status()

    def new_token(self, name, remain_quota):
        for row in self.tokens():
            if row["name"] == name:
                self.delete_token(row["id"])
        self.client.post(
            "/api/token/",
            headers=self.headers,
            json={
                "name": name,
                "remain_quota": remain_quota,
                "expired_time": -1,
                "unlimited_quota": False,
                "model_limits_enabled": True,
                "model_limits": MODEL,
                "group": "default",
            },
        ).raise_for_status()
        row = next(r for r in self.tokens() if r["name"] == name)
        key = None
        for attempt in range(5):
            response = self.client.post(f"/api/token/{row['id']}/key", headers=self.headers)
            if response.status_code == 200:
                key = response.json()["data"]["key"]
                break
            if response.status_code != 429:
                response.raise_for_status()
            time.sleep(1 + attempt)
        if key is None:
            raise RuntimeError("token key endpoint kept rate limiting")
        return row["id"], key

    def tokens(self):
        return self.client.get("/api/token/?p=1&page_size=100", headers=self.headers).json()["data"]["items"]

    def token(self, token_id):
        return self.client.get(f"/api/token/{token_id}", headers=self.headers).json()["data"]

    def set_quota(self, token_id, remain_quota):
        current = self.token(token_id)
        body = {key: current[key] for key in ("id", "name", "expired_time", "unlimited_quota", "model_limits_enabled", "model_limits", "group")}
        body["remain_quota"] = remain_quota
        self.client.put("/api/token/", headers=self.headers, json=body).raise_for_status()
        return self.token(token_id)["remain_quota"]

    def delete_token(self, token_id):
        self.client.delete(f"/api/token/{token_id}", headers=self.headers)


def control(client: httpx.Client, **fields):
    payload = {"reset": True, "delay": 0, "unknown_usage": False, "hold": False}
    payload.update(fields)
    client.post(f"{PROVIDER}/control", json=payload).raise_for_status()


def provider_state(client: httpx.Client):
    return client.get(f"{PROVIDER}/control").json()


def chat_body(max_tokens=1000, stream=False):
    return {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Synthetic teaching probe."}],
        "max_tokens": max_tokens,
        "temperature": 0,
        "stream": stream,
    }


async def wait_started(client: httpx.Client, count=1, timeout=30):
    for _ in range(int(timeout / 0.05)):
        if provider_state(client)["started"] >= count:
            return True
        await asyncio.sleep(0.05)
    return False


async def settle_baseline(admin, token_id, quiet=1.5):
    """Wait until two consecutive readings agree, so async settlement is done."""
    previous = None
    for _ in range(40):
        current = admin.token(token_id)["remain_quota"]
        if current == previous:
            return current
        previous = current
        await asyncio.sleep(0.25)
    return previous


async def pre_consume_case(admin, client):
    token_id, key = admin.new_token("e3a-preconsume", 100_000)
    control(client, delay=3)
    before = admin.token(token_id)["remain_quota"]
    async with httpx.AsyncClient(base_url=NEW_API, timeout=60) as relay:
        task = asyncio.create_task(relay.post("/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=chat_body()))
        started = await wait_started(client, 1)
        in_flight = admin.token(token_id)["remain_quota"]
        response = await task
    settled = await settle_baseline(admin, token_id)
    reserved = before - in_flight
    spent = before - settled
    record(
        "pre_dispatch_deduction_observed",
        started and reserved > 0,
        upstream_started=started,
        reserved_quota=reserved,
        reserved_usd=round(reserved / QUOTA_PER_USD, 6),
    )
    record(
        "reservation_covers_actual_cost",
        reserved >= EXPECTED_ACTUAL_QUOTA,
        reserved_quota=reserved,
        expected_actual_quota=EXPECTED_ACTUAL_QUOTA,
        note="Pre-consume is prompt-token based; it does not reserve the output cap",
    )
    record(
        "reliable_usage_settles_to_actual",
        response.status_code == 200 and spent == EXPECTED_ACTUAL_QUOTA,
        http_status=response.status_code,
        settled_quota=spent,
        expected_actual_quota=EXPECTED_ACTUAL_QUOTA,
    )
    admin.delete_token(token_id)


async def insufficient_quota_case(admin, client):
    token_id, key = admin.new_token("e3a-insufficient", 1_000)
    control(client)
    async with httpx.AsyncClient(base_url=NEW_API, timeout=30) as relay:
        response = await relay.post("/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=chat_body())
    state = provider_state(client)
    after = await settle_baseline(admin, token_id)
    record(
        "insufficient_quota_blocks_before_dispatch",
        response.status_code != 200 and state["started"] == 0,
        http_status=response.status_code,
        upstream_requests=state["started"],
        body=response.text[:180],
    )
    record(
        "insufficient_quota_never_goes_negative",
        after >= 0,
        quota_before=1_000,
        quota_after=after,
        negative_by=abs(after) if after < 0 else 0,
    )
    admin.delete_token(token_id)


async def unknown_usage_case(admin, client):
    token_id, key = admin.new_token("e3a-unknown", 100_000)
    control(client, delay=2, unknown_usage=True)
    provider_unknown = provider_state(client)["unknown_usage"]
    before = admin.token(token_id)["remain_quota"]
    async with httpx.AsyncClient(base_url=NEW_API, timeout=60) as relay:
        task = asyncio.create_task(relay.post("/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=chat_body()))
        await wait_started(client, 1)
        in_flight = admin.token(token_id)["remain_quota"]
        response = await task
    settled = await settle_baseline(admin, token_id)
    reserved = before - in_flight
    spent = before - settled
    record(
        "unknown_usage_is_not_written_as_zero",
        response.status_code == 200 and spent > 0,
        http_status=response.status_code,
        provider_unknown_usage=provider_unknown,
        settled_quota=spent,
    )
    record(
        "unknown_usage_charges_conservative_upper_bound",
        spent >= EXPECTED_ACTUAL_QUOTA,
        provider_unknown_usage=provider_unknown,
        reserved_quota=reserved,
        settled_quota=spent,
        expected_actual_quota=EXPECTED_ACTUAL_QUOTA,
        note="Missing usage is re-estimated locally from tokens, not charged at the reserved upper bound",
    )
    admin.delete_token(token_id)


async def cancel_case(admin, client):
    token_id, key = admin.new_token("e3a-cancel", 100_000)
    # Keep the upstream call pending so the disconnect really happens mid-flight.
    control(client, hold=True)
    before = admin.token(token_id)["remain_quota"]
    async with httpx.AsyncClient(base_url=NEW_API, timeout=60) as relay:
        task = asyncio.create_task(
            relay.post("/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=chat_body(stream=True))
        )
        await wait_started(client, 1)
        in_flight = admin.token(token_id)["remain_quota"]
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, httpx.HTTPError):
            pass
        client.post(f"{PROVIDER}/control", json={"hold": False})
    settled = await settle_baseline(admin, token_id, quiet=3)
    record(
        "cancel_does_not_refund_to_zero",
        in_flight < before and settled <= in_flight,
        reserved_quota=before - in_flight,
        after_disconnect_spent=before - settled,
    )
    record(
        "cancel_charge_covers_upper_bound",
        before - settled >= EXPECTED_ACTUAL_QUOTA,
        after_disconnect_spent=before - settled,
        expected_actual_quota=EXPECTED_ACTUAL_QUOTA,
    )
    admin.delete_token(token_id)


async def last_quota_race_case(admin, client):
    quota = 2_000
    token_id, key = admin.new_token("e3a-race", quota)
    control(client, delay=4, hold=True)
    async with httpx.AsyncClient(base_url=NEW_API, timeout=60) as relay:
        tasks = [
            asyncio.create_task(relay.post("/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=chat_body()))
            for _ in range(2)
        ]
        started = await wait_started(client, 1)
        await asyncio.sleep(1)
        state = provider_state(client)
        client.post(f"{PROVIDER}/control", json={"hold": False})
        responses = await asyncio.gather(*tasks)
    codes = [response.status_code for response in responses]
    after = await settle_baseline(admin, token_id, quiet=3)
    record(
        "last_quota_race_does_not_overshoot",
        codes.count(200) <= 1 and after >= 0,
        upstream_requests=state["started"],
        http_statuses=codes,
        quota_before=quota,
        quota_after=after,
    )
    admin.delete_token(token_id)


def revoke_case(admin):
    token_id, key = admin.new_token("e3a-revoke", 100_000)
    admin.delete_token(token_id)
    with httpx.Client(base_url=NEW_API, timeout=30) as relay:
        response = relay.post("/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=chat_body())
    record("token_delete_revokes_access", response.status_code in (401, 403), http_status=response.status_code)


def main(output):
    with httpx.Client(base_url=NEW_API, timeout=30) as client:
        admin = Admin(client)
        admin.login()
        admin.ensure_setup()
        admin.ensure_channel()
        control(client)
        asyncio.run(pre_consume_case(admin, client))
        asyncio.run(insufficient_quota_case(admin, client))
        asyncio.run(unknown_usage_case(admin, client))
        asyncio.run(cancel_case(admin, client))
        asyncio.run(last_quota_race_case(admin, client))
        revoke_case(admin)

    report = {
        "schema_version": 1,
        "checked_at": datetime.now(UTC).isoformat(),
        "candidate": "New API (calciumion/new-api:v1.0.0-rc.47)",
        "image_digest": "sha256:938fa2713d4946723c9e9ce3076351c33f7770699fec92d23f3a26fd95791026",
        "synthetic_only": True,
        "real_provider_calls": 0,
        "quota_per_usd": QUOTA_PER_USD,
        "model_ratio": MODEL_RATIO,
        "completion_ratio": COMPLETION_RATIO,
        "pre_consume_source": "relay/helper/price.go: preConsumedTokens = promptTokens * InputPreConsumeMultiplier",
        "results": results,
        "governance_verified": False,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if all(row["status"] == "passed" for row in results) else 1


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("newapi-results.json")
    sys.exit(main(target))
