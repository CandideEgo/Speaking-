---
title: Release / Pre-Push Checklist
tags: [workflow, ci, release, testing]
status: active
confidence: verified
related_code: [pre-commit, ci-workflows, pytest-suite, frontend-package]
related: [wiki/guides/testing.md, docs/operations/RUNBOOK.md]
created: 2026-09-19
updated: 2026-09-22
---

# Why this checklist exists

**A green local tree does not imply a green CI.** Five separate mechanisms have already caused that
here — a formatter version skew, an `alembic` import path, a mirror without an audit endpoint,
formatting regressions that rode in on feature commits, and a UI rename that left an e2e assertion
behind. Each is listed below with its symptom.

# 1. Run the four gates locally

```bash
# Backend (PYTHONUTF8=1 is required on Windows — see wiki/guides/testing.md)
cd backend && PYTHONUTF8=1 pytest tests/ -v
cd backend && ruff check app/ tests/ && ruff format --check app/ tests/ && mypy app/ --ignore-missing-imports

# Frontend (--legacy-peer-deps is required: eslint 10 vs eslint-plugin-react-hooks)
cd frontend && npm run format:check && npx tsc --noEmit && npm run test:unit && npm run lint && npm run build

# Knowledge layer (fast, runs in pre-commit too)
pre-commit run knowledge-check --all-files
```

## The e2e suite is outside those four gates

CI's third job boots the whole stack and runs Playwright; nothing above touches it, so a UI rename
that leaves a locator behind is invisible locally. Run it when the change touches navigation,
labels, or routing:

```bash
cd frontend && npx playwright test --project=chromium
```

It needs the dev stack (backend on :8000, db, redis) and installed browsers — `playwright.config.ts`
starts the servers itself when `CI` is unset. Locally the dev rate limiter can 429 the registration
helper in `e2e/helpers.ts`, so a local run is a smoke, not a verdict: read *which* tests failed
before concluding anything.

# 2. Known traps

| Trap | Symptom | Fix |
|------|---------|-----|
| `alembic` invoked as a console script | `ModuleNotFoundError: No module named 'app'` from `migrations/env.py` | already fixed by `prepend_sys_path = .` in `backend/alembic.ini`; if it recurs, the cause is a missing/renamed `alembic.ini` key, or invoking alembic from outside `backend/` |
| ruff version skew | CI's `Format check` fails while local passes, or vice versa | `backend/requirements-dev.txt` and the `astral-sh/ruff-pre-commit` rev must name the same version; bump both in one commit |
| Formatting regression in a feature commit | `npm run format:check` / `ruff format --check` fails on files you did not just touch | run the formatter; if the file is committed and unmodified, it slipped in unformatted and CI never saw it |
| `npm audit` locally | `[NOT_IMPLEMENTED] /-/npm/v1/security/*` | the local npm registry is a mirror without an audit endpoint. Audit against the public one: `npm audit --omit=dev --registry=https://registry.npmjs.org`. CI uses the public registry |
| `npm ci` / `npm install` | peer dependency error on `eslint` | always pass `--legacy-peer-deps` (the project's `eslint@10` outruns `eslint-plugin-react-hooks@5`) |
| `mypy` baseline has rotted | CI's `Type check` fails on `file:code` pairs nobody remembers adding | see below |
| e2e locator left behind by a UI rename | local gates all green, CI's `e2e` job red on a `getByRole` / text locator that matches nothing | e2e specs assert on user-visible labels. When a nav item, tab or button is renamed, `grep -rn '<旧文案>' frontend/e2e/` before pushing. 2026-09-22: MobileTabBar 的「浏览」改成「频道」（DEC-046）漏改 `e2e/mobile.spec.ts`，master 上 e2e 红（83 passed / 1 failed） |

Watch the exit codes, not the tail of the output — piping into `tail` or `grep` replaces `$?` with
the pipe's status. Check `cmd > log 2>&1; echo $?`.

## Re-curating the mypy baseline

`backend/.mypy-baseline` is a **curated** list, not a generated one, so it rots silently. The gate
only compares against it, and it sat unmaintained from 2026-07-24 to 2026-09-19 — long enough to
accumulate 21 unreviewed `file:code` pairs — while the `Format check` failure upstream meant the
step never actually ran.

Regenerate with the **same mypy version CI installs**, and point it at the project's interpreter so
it sees the installed packages:

```bash
cd backend && mypy app/ --ignore-missing-imports --python-executable .venv/Scripts/python.exe
```

Then reduce each `file:line: ... [code]` line to `file:code`, normalise backslashes to forward
slashes, `sort -u`, and commit the diff. The normalisation matters: CI's Linux mypy emits
`app/x.py`, a Windows run emits `app\x.py`, and `comm` compares literally — skip it and every
entry looks new. Do not grow the list merely to make the gate green; read the pairs that appear.

# 3. Migrations

- **`alembic heads` must print exactly one revision.** Two heads means a merge revision is missing
  and `upgrade head` will refuse to run.
- **CI's e2e job runs `alembic upgrade head` against a fresh database.** A migration that works
  incrementally on an existing dev database can still fail on an empty one. If you added
  migrations, this is the job most likely to surprise you.
- Verify the online path locally before pushing, read-only:

```bash
cd backend && PYTHONUTF8=1 alembic current     # should print the same revision as `alembic heads`
```

# 4. Pushing after a long unpushed stretch

CI turns a long local history into a single result, so a failure tells you very little about which
commit caused it. Before the first push after a gap:

1. `git log origin/master..master --oneline | wc -l` — know the size of the unverified set.
2. Run all four gates from §1 on the **final** tree, not on individual commits.
3. Expect the e2e job to be the long pole (it boots Postgres, Redis, the backend and the frontend).
4. If CI fails, reproduce locally with the same command CI uses — not a near-equivalent one. The
   `alembic` case above was exactly this: the local skill ran `python -m alembic`, CI ran `alembic`,
   and only the latter was broken.
