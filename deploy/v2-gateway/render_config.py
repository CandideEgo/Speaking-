"""Render the production LiteLLM config from the template and environment.

Only known placeholders are substituted; a missing required value fails before
the gateway starts. The rendered file may contain the database URL and Redis
password, so it is written outside the repository with 0600 semantics.
"""

import os
import sys
from pathlib import Path

PLACEHOLDERS = (
    "COMMANDCODE_MODEL",
    "V2_INPUT_COST_PER_TOKEN",
    "V2_OUTPUT_COST_PER_TOKEN",
    "V2_MAX_INPUT_TOKENS",
    "V2_MAX_OUTPUT_TOKENS",
    "GATEWAY_REDIS_HOST",
    "GATEWAY_REDIS_PORT",
    "GATEWAY_REDIS_DB",
    "LITELLM_DB_POOL_LIMIT",
)


def main() -> int:
    template = Path(sys.argv[1] if len(sys.argv) > 1 else "/spike/config.prod.template.yaml")
    target = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/config.yaml")
    text = template.read_text(encoding="utf-8")
    for name in PLACEHOLDERS:
        value = os.environ.get(name)
        if value is None or not str(value).strip():
            raise SystemExit(f"{name} must be set")
        text = text.replace("${" + name + "}", str(value))
    if "${" in text:
        raise SystemExit("unreplaced placeholders remain in the rendered config")
    target.write_text(text, encoding="utf-8")
    print(f"rendered {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
