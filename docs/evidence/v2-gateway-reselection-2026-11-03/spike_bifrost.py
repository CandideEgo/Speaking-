"""Synthetic E3a reselection probe for Bifrost.

Runs against the disposable stack in docker-compose.bifrost.yml: one Bifrost
gateway, one synthetic OpenAI-compatible provider, no real provider credentials.
Each scenario uses its own virtual key with a $0.01 budget, seeded from
config.json, so scenarios cannot contaminate each other.
"""

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

BIFROST = "http://127.0.0.1:13200"
PROVIDER = "http://127.0.0.1:14002"
MODEL = "synthetic-teaching"
BUDGET_USD = 0.01
# input 10 * 0.00001 + output 80 * 0.0001
EXPECTED_COST_USD = 0.0081

results = []


def record(name, passed, **details):
    results.append({"name": name, "status": "passed" if passed else "failed", "details": details})
    print(f"{name}: {'passed' if passed else 'FAILED'}", flush=True)


def vk(case):
    return {"x-bf-vk": f"sk-bf-synthetic-{case}"}


def control(**fields):
    payload = {"reset": True, "delay": 0, "unknown_usage": False, "hold": False}
    payload.update(fields)
    with httpx.Client(timeout=10) as client:
        client.post(f"{PROVIDER}/control", json=payload).raise_for_status()


def provider_state():
    with httpx.Client(timeout=10) as client:
        return client.get(f"{PROVIDER}/control").json()


def usage(case):
    with httpx.Client(base_url=BIFROST, timeout=10) as client:
        data = client.get("/api/governance/virtual-keys/quota", headers=vk(case)).json()
    budget = data["budgets"][0]
    return float(budget.get("current_usage") or 0)


def chat_body(max_tokens=1000, stream=False):
    return {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Synthetic teaching probe."}],
        "max_tokens": max_tokens,
        "temperature": 0,
        "stream": stream,
    }


async def wait_started(count=1, timeout=30):
    for _ in range(int(timeout / 0.05)):
        if provider_state()["started"] >= count:
            return True
        await asyncio.sleep(0.05)
    return False


async def settle(case, timeout=45.0):
    """Bifrost flushes budget usage asynchronously; wait for a non-zero,
    stable reading (or return 0 after the timeout)."""
    previous = None
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        current = usage(case)
        if current > 0 and current == previous:
            return current
        previous = current
        await asyncio.sleep(0.5)
    return previous or 0.0


async def pre_dispatch_case(client):
    case = "pre"
    control(hold=True)
    async with httpx.AsyncClient(base_url=BIFROST, timeout=60) as relay:
        first = asyncio.create_task(relay.post("/v1/chat/completions", headers=vk(case), json=chat_body()))
        await wait_started(1)
        in_flight = usage(case)
        second = asyncio.create_task(relay.post("/v1/chat/completions", headers=vk(case), json=chat_body()))
        await asyncio.sleep(1)
        started = provider_state()["started"]
        control(hold=False)
        responses = await asyncio.gather(first, second)
    after = await settle(case)
    codes = [response.status_code for response in responses]
    record(
        "pre_dispatch_reservation_visible",
        in_flight > 0,
        in_flight_usage_usd=in_flight,
        note="Budget usage must move before the provider completes",
    )
    record(
        "second_request_blocked_while_first_in_flight",
        started == 1 and codes.count(200) == 1,
        upstream_requests=started,
        http_statuses=codes,
    )
    record(
        "last_budget_not_overshot",
        after <= BUDGET_USD + 1e-9,
        budget_usd=BUDGET_USD,
        settled_usage_usd=after,
    )


async def race_case(client):
    case = "race"
    control(hold=True)
    async with httpx.AsyncClient(base_url=BIFROST, timeout=60) as relay:
        tasks = [
            asyncio.create_task(relay.post("/v1/chat/completions", headers=vk(case), json=chat_body()))
            for _ in range(2)
        ]
        await asyncio.sleep(1)
        started = provider_state()["started"]
        control(hold=False)
        responses = await asyncio.gather(*tasks)
    after = await settle(case)
    codes = [response.status_code for response in responses]
    record(
        "concurrent_last_budget_race",
        started == 1 and codes.count(200) == 1 and after <= BUDGET_USD + 1e-9,
        upstream_requests=started,
        http_statuses=codes,
        budget_usd=BUDGET_USD,
        settled_usage_usd=after,
    )


async def unknown_usage_case(client):
    case = "unknown"
    control(delay=1, unknown_usage=True)
    async with httpx.AsyncClient(base_url=BIFROST, timeout=60) as relay:
        response = await relay.post("/v1/chat/completions", headers=vk(case), json=chat_body())
    after = await settle(case)
    record(
        "unknown_usage_is_not_written_as_zero",
        response.status_code == 200 and after > 0,
        http_status=response.status_code,
        settled_usage_usd=after,
    )
    record(
        "unknown_usage_charges_conservative_upper_bound",
        after + 1e-9 >= EXPECTED_COST_USD,
        settled_usage_usd=after,
        expected_cost_usd=EXPECTED_COST_USD,
    )


async def cancel_case(client):
    case = "cancel"
    control(hold=True)
    async with httpx.AsyncClient(base_url=BIFROST, timeout=60) as relay:
        task = asyncio.create_task(
            relay.post("/v1/chat/completions", headers=vk(case), json=chat_body(stream=True))
        )
        await wait_started(1)
        in_flight = usage(case)
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, httpx.HTTPError):
            pass
        control(hold=False)
    after = await settle(case)
    record(
        "cancel_does_not_refund_to_zero",
        in_flight > 0 and after > 0,
        in_flight_usage_usd=in_flight,
        after_disconnect_usage_usd=after,
    )
    record(
        "cancel_charge_covers_upper_bound",
        after + 1e-9 >= EXPECTED_COST_USD,
        after_disconnect_usage_usd=after,
        expected_cost_usd=EXPECTED_COST_USD,
    )


def auth_case():
    with httpx.Client(base_url=BIFROST, timeout=10) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"x-bf-vk": "sk-bf-not-a-real-key"},
            json=chat_body(),
        )
    record("invalid_virtual_key_rejected", response.status_code in (401, 403), http_status=response.status_code)


async def main(output):
    async with httpx.AsyncClient() as client:
        control()
        await pre_dispatch_case(client)
        await race_case(client)
        await unknown_usage_case(client)
        await cancel_case(client)
    auth_case()

    report = {
        "schema_version": 1,
        "checked_at": datetime.now(UTC).isoformat(),
        "candidate": "Bifrost (maximhq/bifrost:v2.4.0, OSS)",
        "image_digest": "sha256:a1c90607dcfd13c1fb2f9476ceb3bb24407a50ade7fdf3e61a59fb42b09e5c57",
        "synthetic_only": True,
        "real_provider_calls": 0,
        "budget_usd": BUDGET_USD,
        "expected_request_cost_usd": EXPECTED_COST_USD,
        "results": results,
        "governance_verified": False,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if all(row["status"] == "passed" for row in results) else 1


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("bifrost-results.json")
    sys.exit(asyncio.run(main(target)))
