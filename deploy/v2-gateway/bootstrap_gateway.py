"""Create/verify the V2 LiteLLM team used by the teaching gateway.

Run once after the real gateway is reachable (default http://127.0.0.1:4001,
which is the host-loopback publish of the gateway admin port):

    LITELLM_URL=http://127.0.0.1:4001 \
    LITELLM_MASTER_KEY=... \
    LLM_GATEWAY_V2_TEAM_ID=... python bootstrap_gateway.py --check

With `--create` it creates the team if the alias is absent. It prints the team
id and budget settings, never keys or provider credentials.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta

DEFAULT_ALIAS = "seeword-v2"
TEAM_DAILY_USD = 1.0
MEMBER_DAILY_USD = 0.10
MODEL_ALIAS = "teaching"


def _call(method: str, base: str, path: str, master: str, body=None, params=None):
    url = base.rstrip("/") + path
    if params:
        from urllib.parse import urlencode

        url += "?" + urlencode(params)
    request = urllib.request.Request(
        url,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {master}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:300]


def list_teams(base, master):
    status, data = _call("GET", base, "/team/list", master)
    if status != 200:
        raise SystemExit(f"cannot list teams: HTTP {status} {data}")
    rows = data if isinstance(data, list) else data.get("teams") or data.get("data") or []
    return [row for row in rows if isinstance(row, dict)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("LITELLM_URL", "http://127.0.0.1:4001"))
    parser.add_argument("--alias", default=os.environ.get("V2_TEAM_ALIAS", DEFAULT_ALIAS))
    parser.add_argument("--create", action="store_true", help="create the team when the alias is absent")
    parser.add_argument("--check", action="store_true", help="only report current state")
    args = parser.parse_args()

    master = os.environ.get("LITELLM_MASTER_KEY", "")
    if not master:
        raise SystemExit("LITELLM_MASTER_KEY must be set")

    model_status, model_info = _call("GET", args.url, "/model/info", master)
    model_names = []
    if model_status == 200:
        rows = model_info.get("data", model_info) if isinstance(model_info, dict) else model_info
        model_names = [row.get("model_name") for row in rows if isinstance(row, dict)]

    teams = list_teams(args.url, master)
    existing = next((team for team in teams if team.get("team_alias") == args.alias), None)
    if existing is None and not args.create:
        print(json.dumps({"alias": args.alias, "exists": False, "model_present": MODEL_ALIAS in model_names}, ensure_ascii=False))
        return 1

    if existing is None:
        midnight = (datetime.now(UTC) + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        status, data = _call(
            "POST",
            args.url,
            "/team/new",
            master,
            {
                "team_alias": args.alias,
                "max_budget": TEAM_DAILY_USD,
                "budget_duration": "1d",
                "budget_reset_at": midnight.isoformat(),
                "team_member_budget": MEMBER_DAILY_USD,
                "team_member_budget_duration": "1d",
                "models": [MODEL_ALIAS],
            },
        )
        if status != 200:
            raise SystemExit(f"cannot create team: HTTP {status} {data}")
        existing = data
        action = "created"
    else:
        action = "existing"

    team_id = existing.get("team_id") or existing.get("team_info", {}).get("team_id")
    print(
        json.dumps(
            {
                "action": action,
                "alias": args.alias,
                "team_id": team_id,
                "team_daily_usd": existing.get("max_budget", TEAM_DAILY_USD),
                "budget_reset_at": existing.get("budget_reset_at"),
                "member_daily_usd": existing.get("team_member_budget", MEMBER_DAILY_USD),
                "model_alias_present": MODEL_ALIAS in model_names,
                "model_names": model_names,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
