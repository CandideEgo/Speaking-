"""One real-provider smoke through the adapter → LiteLLM → shim path.

Requires the real gateway stack from docker-compose.real.yml and a bootstrapped
team. Prints status, response prefix, usage and settled key spend; never prints
provider or master keys.
"""

import json
import os
import sys
import time

import httpx

LITELLM = os.environ.get("LITELLM_URL", "http://127.0.0.1:15001")
ADAPTER = os.environ.get("ADAPTER_URL", "http://127.0.0.1:15000")
MASTER = os.environ.get("LITELLM_MASTER_KEY", "")
TEAM_ID = os.environ.get("TEAM_ID", "")
USER_ID = os.environ.get("SMOKE_USER_ID", "real-smoke-user")


def main() -> int:
    if not MASTER or not TEAM_ID:
        raise SystemExit("LITELLM_MASTER_KEY and TEAM_ID must be set")

    admin = {"Authorization": f"Bearer {MASTER}", "Content-Type": "application/json"}
    with httpx.Client(timeout=60) as client:
        # The per-run key alone auto-creates the user row but not the team
        # membership; without the membership the member-budget check cannot
        # verify spend and fail-closed rejects the call.
        client.post(
            f"{LITELLM}/user/new",
            headers=admin,
            json={"user_id": USER_ID, "teams": [TEAM_ID], "auto_create_key": False},
        )
        key_response = client.post(
            f"{LITELLM}/key/generate",
            headers=admin,
            json={
                "team_id": TEAM_ID,
                "user_id": USER_ID,
                "duration": "10m",
                "max_budget": 0.02,
                "max_parallel_requests": 1,
                "models": ["teaching"],
                "metadata": {"run_id": "real-smoke", "budget_domain": "v2"},
            },
        )
        key_response.raise_for_status()
        key = key_response.json()["key"]

        response = client.post(
            f"{ADAPTER}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "teaching",
                "max_tokens": 128,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": 'Return only JSON {"intent":"show_analysis"}',
                    },
                    {"role": "user", "content": "Synthetic connection check."},
                ],
            },
        )
        body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        content = ""
        try:
            content = body["choices"][0]["message"]["content"][:160]
        except (KeyError, IndexError, TypeError):
            content = json.dumps(body, ensure_ascii=False)[:160]
        time.sleep(6)
        info = client.get(f"{LITELLM}/key/info", headers=admin, params={"key": key})
        spend = None
        if info.status_code == 200:
            spend = info.json().get("info", {}).get("spend")
        client.post(f"{LITELLM}/user/delete", headers=admin, json={"user_ids": [USER_ID]})

    print(
        json.dumps(
            {
                "adapter_status": response.status_code,
                "content_prefix": content,
                "usage": body.get("usage"),
                "key_spend_usd": spend,
                "team_id": TEAM_ID,
            },
            ensure_ascii=False,
        )
    )
    return 0 if response.status_code == 200 else 1


if __name__ == "__main__":
    sys.exit(main())
