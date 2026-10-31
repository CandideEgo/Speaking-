#!/usr/bin/env python3
"""Render the Redis ACL file from ``deploy/redis/users.acl.template``.

Passwords never live in git: the template has ``{REDIS_PASSWORD}`` and
``{REDIS_GPU_PASSWORD}`` placeholders, and this script substitutes them from
the environment into a git-ignored output file.

    ISOLATION_REDIS_PASSWORD=... ISOLATION_REDIS_GPU_PASSWORD=... \
        python scripts/isolation/render_redis_acl.py --out deploy/redis/users.acl.generated

Production rollout uses the same script (see D6 §5.2); only the variable values
differ. The script refuses empty/whitespace passwords, values that would break
the ACL line syntax, leftover placeholders, and writing over the template.
It prints the output path and the user names, never the passwords.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = REPO_ROOT / "deploy" / "redis" / "users.acl.template"

PLACEHOLDERS = {
    "{REDIS_PASSWORD}": "REDIS_PASSWORD",
    "{REDIS_GPU_PASSWORD}": "REDIS_GPU_PASSWORD",
}

# Redis ACL rules are whitespace-separated; a password containing whitespace,
# a quote or a backslash would silently change the user's permissions. `-`,
# `+`, `&` and `~` are legal inside a `>password` token, so they are allowed
# (production passwords commonly contain `-`).
_FORBIDDEN_IN_PASSWORD = set(" \t\r\n'\"\\#")
_MIN_PASSWORD_LENGTH = 12


def _password(env_name: str) -> str:
    value = os.environ.get(env_name, "")
    if not value:
        raise SystemExit(f"{env_name} is empty; refusing to render an ACL with a blank password")
    if len(value) < _MIN_PASSWORD_LENGTH:
        raise SystemExit(f"{env_name} is shorter than {_MIN_PASSWORD_LENGTH} characters")
    bad = sorted(set(value) & _FORBIDDEN_IN_PASSWORD)
    if bad:
        raise SystemExit(f"{env_name} contains characters that break ACL syntax: {''.join(bad)!r}")
    return value


def render(template: Path, out: Path) -> None:
    if template.resolve() == out.resolve():
        raise SystemExit("refusing to overwrite the template")
    if not template.is_file():
        raise SystemExit(f"template not found: {template}")

    text = template.read_text(encoding="utf-8")
    for token, env_name in PLACEHOLDERS.items():
        text = text.replace(token, _password(env_name))

    leftovers = [token for token in PLACEHOLDERS if token in text]
    if leftovers:
        raise SystemExit(f"unreplaced placeholders remain: {leftovers}")

    # Redis' ACL file parser accepts only `user` lines: it treats a leading `#`
    # as a malformed username ("should start with user keyword"). Keep the
    # commentary in the template for humans and strip it from the rendered file.
    body = "\n".join(line for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")) + "\n"

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body, encoding="utf-8", newline="\n")
    try:
        os.chmod(out, 0o600)
    except OSError:  # Windows: mode bits are advisory only
        pass

    users = [line.split()[1] for line in body.splitlines() if line.startswith("user ") and len(line.split()) > 1]
    print(f"rendered {out} (users: {', '.join(users)})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the Redis ACL file (no passwords in git)")
    parser.add_argument("--template", default=str(TEMPLATE))
    parser.add_argument("--out", default=str(REPO_ROOT / "deploy" / "redis" / "users.acl.generated"))
    args = parser.parse_args()
    render(Path(args.template), Path(args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
