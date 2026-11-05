"""Reproducible E3a acceptance probe against the isolated synthetic gateway only.

Start `docker compose -f docker-compose.v2-gateway.yml up -d`, then run
`docker compose -f docker-compose.v2-gateway.yml --profile check run --rm probe`.
Exit 1 is a failed governance gate, not permission to weaken a requirement.
"""

import argparse
import asyncio
import hashlib
import json
import math
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
from redis.asyncio import Redis

MASTER = "sk-seeword-v2-synthetic-only"
GATEWAY = "http://127.0.0.1:14000"
PROVIDER = "http://127.0.0.1:14001"
REDIS_HOST = "127.0.0.1"
REDIS_PORT = 16381
MODEL = "synthetic-teaching"
IMAGE = "ghcr.io/berriai/litellm:v1.106.6@sha256:37e2dafb088a7723beb998590682957386dfc83ffea1848486f8e0e5cfac0b06"
OUTPUT_RESERVATION = 128 * 0.0001


class Probe:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30, limits=httpx.Limits(max_connections=120), trust_env=False)
        self.redis = Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        self.results = []
        self.prefix = f"synthetic-{uuid.uuid4().hex[:10]}"

    async def close(self):
        await self.client.aclose()
        await self.redis.aclose()

    async def wait_ready(self):
        for _ in range(90):
            try:
                response = await self.client.get(
                    GATEWAY + "/health/readiness", timeout=2, headers={"Authorization": f"Bearer {MASTER}"}
                )
                if response.status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            await asyncio.sleep(1)
        raise RuntimeError("synthetic gateway did not become ready within 90 seconds")

    async def admin(self, path, body=None, *, params=None):
        response = await self.client.request(
            "GET" if body is None else "POST",
            GATEWAY + path,
            json=body,
            params=params,
            headers={"Authorization": f"Bearer {MASTER}"},
        )
        if response.status_code >= 300:
            raise RuntimeError(f"control-plane {path} HTTP {response.status_code}")
        return response.json()

    async def control(self, *, delay=0, unknown=False, hold=False):
        response = await self.client.post(
            PROVIDER + "/control", json={"reset": True, "delay": delay, "unknown_usage": unknown, "hold": hold}
        )
        response.raise_for_status()

    async def provider_state(self):
        response = await self.client.get(PROVIDER + "/control")
        response.raise_for_status()
        return response.json()

    async def fixture(self, label, users=1):
        midnight = (datetime.now(UTC) + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        team = await self.admin(
            "/team/new",
            {
                "team_alias": f"{self.prefix}-{label}",
                "max_budget": 1.0,
                "budget_duration": "1d",
                "budget_reset_at": midnight.isoformat(),
                "team_member_budget": 0.1,
                "team_member_budget_duration": "1d",
                "models": [MODEL],
            },
        )
        team_id = team["team_id"]
        ids = []
        for i in range(users):
            uid = f"{self.prefix}-{label}-{i}"
            await self.admin("/user/new", {"user_id": uid, "teams": [team_id], "auto_create_key": False})
            ids.append(uid)
        return team, ids

    async def key(self, team_id, user_id, *, parallel=1):
        result = await self.admin(
            "/key/generate",
            {
                "team_id": team_id,
                "user_id": user_id,
                "duration": "10m",
                "max_budget": 0.02,
                "models": [MODEL],
                "max_parallel_requests": parallel,
                "metadata": {"budget_domain": "v2", "run_id": str(uuid.uuid4())},
            },
        )
        return result["key"]

    def body(self, **extra):
        return {
            "model": MODEL,
            "messages": [{"role": "user", "content": "Synthetic teaching probe."}],
            "max_tokens": 128,
            "temperature": 0,
            **extra,
        }

    async def chat(self, key, **extra):
        return await self.client.post(
            GATEWAY + "/chat/completions", json=self.body(**extra), headers={"Authorization": f"Bearer {key}"}
        )

    async def spend(self, key):
        hashed = hashlib.sha256(key.encode()).hexdigest()
        value = await self.redis.get(f"spend:key:{hashed}")
        if value is None:
            info = await self.admin("/key/info", params={"key": hashed})
            return float(info["info"].get("spend") or 0)
        return float(value)

    def record(self, name, passed, **details):
        self.results.append({"name": name, "status": "passed" if passed else "failed", "details": details})
        print(f"{name}: {'passed' if passed else 'FAILED'}", flush=True)

    async def wait_started(self):
        for _ in range(100):
            if (await self.provider_state())["started"]:
                return
            await asyncio.sleep(0.05)
        raise RuntimeError("no synthetic provider dispatch observed")

    async def offer_concurrently(self, keys):
        """Keep every admitted provider call pending until all offers are classified."""
        await self.control(hold=True)
        tasks = [asyncio.create_task(self.chat(key)) for key in keys]
        complete = False
        for _ in range(150):
            state = await self.provider_state()
            if state["started"] + sum(task.done() for task in tasks) >= len(tasks):
                complete = True
                break
            await asyncio.sleep(0.1)
        await self.client.post(PROVIDER + "/control", json={"hold": False})
        responses = await asyncio.gather(*tasks)
        return responses, (await self.provider_state())["started"], complete

    async def normal_and_unknown(self):
        for unknown in (False, True):
            label = "unknown_usage_conservative_charge" if unknown else "reserve_then_reliable_settle"
            team, users = await self.fixture(label)
            key = await self.key(team["team_id"], users[0])
            await self.control(delay=2, unknown=unknown)
            pending = asyncio.create_task(self.chat(key))
            await self.wait_started()
            reserved = await self.spend(key)
            response = await pending
            await asyncio.sleep(0.5)
            settled = await self.spend(key)
            success = response.status_code == 200
            if unknown:
                passed = success and settled + 1e-9 >= reserved and reserved >= OUTPUT_RESERVATION
            else:
                passed = success and reserved >= OUTPUT_RESERVATION and math.isclose(settled, 0.0081, abs_tol=1e-6)
            self.record(
                label,
                passed,
                http_status=response.status_code,
                in_flight_spend=reserved,
                settled_spend=settled,
                upstream_usage_present=not unknown,
                minimum_output_reservation=OUTPUT_RESERVATION,
            )

    async def races(self):
        team, users = await self.fixture("oversized-reserve")
        key = await self.key(team["team_id"], users[0])
        await self.control()
        oversized = await self.chat(key, max_tokens=300)
        dispatched = (await self.provider_state())["started"]
        self.record(
            "reject_estimate_above_run_remaining",
            oversized.status_code != 200 and dispatched == 0,
            http_status=oversized.status_code,
            upstream_requests=dispatched,
            output_only_estimate_usd=0.03,
            run_limit_usd=0.02,
        )
        team, users = await self.fixture("run-race")
        key = await self.key(team["team_id"], users[0], parallel=2)
        responses, started, barrier = await self.offer_concurrently([key, key])
        self.record(
            "run_last_budget_race",
            barrier and started == 1 and sum(r.status_code == 200 for r in responses) == 1,
            upstream_requests=started,
            http_statuses=[r.status_code for r in responses],
            run_limit_usd=0.02,
            admission_barrier_complete=barrier,
        )

        for label, user_count, per_user in (("member_budget_reservation", 1, 9), ("v2_team_budget_reservation", 12, 8)):
            team, users = await self.fixture(label, users=user_count)
            keys = [await self.key(team["team_id"], uid) for uid in users for _ in range(per_user)]
            responses, started, barrier = await self.offer_concurrently(keys)
            limit = 0.1 if user_count == 1 else 1.0
            ceiling = math.floor(limit / OUTPUT_RESERVATION)
            self.record(
                label,
                barrier and 0 < started <= ceiling and any(r.status_code != 200 for r in responses),
                offered=len(keys),
                upstream_requests=started,
                output_only_max_admitted=ceiling,
                http_status_counts={
                    str(code): sum(r.status_code == code for r in responses)
                    for code in {r.status_code for r in responses}
                },
                limit_usd=limit,
                admission_barrier_complete=barrier,
            )

    async def cancel_and_lifecycle(self):
        team, users = await self.fixture("cancel")
        key = await self.key(team["team_id"], users[0])
        # No usage on the wire: the outcome is genuinely uncertain, so the
        # adapter must keep a conservative charge instead of refunding it.
        await self.control(delay=6, unknown=True)
        request = self.client.build_request(
            "POST",
            GATEWAY + "/chat/completions",
            json=self.body(stream=True, stream_options={"include_usage": True}),
            headers={"Authorization": f"Bearer {key}"},
        )
        pending = asyncio.create_task(self.client.send(request, stream=True))
        await self.wait_started()
        reserved = await self.spend(key)
        pending.cancel()
        try:
            await pending
        except (asyncio.CancelledError, Exception):
            pass
        await asyncio.sleep(9)
        uncertain = await self.spend(key)
        self.record(
            "cancel_retains_uncertain_upper_bound",
            reserved >= OUTPUT_RESERVATION and uncertain + 1e-9 >= reserved,
            in_flight_spend=reserved,
            after_disconnect_spend=uncertain,
            requirement="Keep full reserve while provider completion/usage is uncertain",
        )
        state = await self.provider_state()
        self.record(
            "synthetic_late_work_observed",
            state["completed"] == 1,
            completed_upstream_work=state["completed"],
            disconnected_upstream=state["disconnected"],
        )
        await self.admin("/user/delete", {"user_ids": users})
        after_delete = await self.chat(key)
        self.record(
            "user_delete_revokes_existing_run_key",
            after_delete.status_code in {401, 403},
            http_status=after_delete.status_code,
        )

    async def utc_windows(self):
        team, _users = await self.fixture("utc-window")
        info = await self.admin("/team/info", params={"team_id": team["team_id"]})
        value = info.get("team_info", info).get("budget_reset_at")
        reset = datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
        passed = bool(reset and reset.utcoffset() == timedelta(0) and reset.hour == reset.minute == reset.second == 0)
        self.record(
            "team_initial_reset_is_utc_midnight",
            passed,
            observed_budget_reset_at=value,
            limitation="Does not prove rollover, member reset alignment, or late-settle bucket identity",
        )
        # A current timestamp is not evidence for the safety properties below.
        self.record(
            "midnight_late_settle_and_member_utc_day",
            False,
            reason="Not demonstrated by this bounded probe; native 1d must not be assumed sufficient",
        )


async def main(output):
    probe = Probe()
    try:
        operations = (
            probe.wait_ready,
            probe.normal_and_unknown,
            probe.races,
            probe.cancel_and_lifecycle,
            probe.utc_windows,
        )
        for operation in operations:
            try:
                await operation()
            except Exception as exc:
                probe.record(operation.__name__, False, error_type=type(exc).__name__, error=str(exc)[:180])
                if operation == probe.wait_ready:
                    break
        report = {
            "schema_version": 1,
            "checked_at": datetime.now(UTC).isoformat(),
            "image": IMAGE,
            "synthetic_only": True,
            "real_provider_calls": 0,
            "team_daily_usd": 1,
            "member_daily_usd": 0.1,
            "run_lifetime_usd": 0.02,
            "results": probe.results,
            "llm_gateway_governance_verified": False,
        }
        # Even all bounded tests cannot set the deployment flag; review includes
        # privacy, reliable pricing upper bounds and midnight/failure recovery.
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return 0 if all(row["status"] == "passed" for row in probe.results) else 1
    finally:
        await probe.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--container-network", action="store_true", help="Use isolated Compose service names")
    arguments = parser.parse_args()
    if arguments.container_network:
        GATEWAY = "http://adapter:4000"
        PROVIDER = "http://synthetic-provider:4010"
        REDIS_HOST = "gateway-redis"
        REDIS_PORT = 6379
    sys.exit(asyncio.run(main(arguments.output)))
