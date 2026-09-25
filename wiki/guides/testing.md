---
title: Testing Guide
tags: [workflow, testing, ci]
status: active
confidence: verified
related_code: [pytest-suite, pre-commit, ci-workflows]
related: [wiki/guides/setup.md]
created: 2026-07-21
updated: 2026-09-25
---

# Backend Tests

**Name the venv interpreter — do not rely on bare `pytest`.** Bare `pytest`/`python` resolves
through PATH, and on this machine PATH reaches a stale system Python (starlette 0.37.2, mypy
2.1.0) instead of the pinned set (`requirements.txt`: starlette 1.6.0; `.venv`: mypy 2.3.1).
The failure mode is convincing and wrong: `status.HTTP_413_CONTENT_TOO_LARGE` missing from the
old starlette turns `tests/test_profile.py` into 5 avatar-upload failures, and the old mypy
reports a `file:code` set that no longer matches `.mypy-baseline`. Both vanish under `.venv`.

```bash
cd backend && ./.venv/Scripts/python.exe -m pytest tests/ -v      # Windows
cd backend && ./.venv/bin/python -m pytest tests/ -v              # Linux/macOS
cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_ai_cache.py -v          # single file
cd backend && ./.venv/Scripts/python.exe -m pytest tests/test_ai_cache.py::test_fn -v # single test
```

**On Windows, prefix with `PYTHONUTF8=1`:**

```bash
cd backend && PYTHONUTF8=1 ./.venv/Scripts/python.exe -m pytest tests/ -v
```

Without it, collection fails with `UnicodeDecodeError: 'gbk' codec can't decode ...` — `slowapi`'s
`Limiter` reads `backend/.env` using the system default encoding, which is GBK on a Chinese Windows
install, and the file is UTF-8. CI runs on Linux, where UTF-8 is already the default, so this only
affects local Windows runs.

# Frontend Checks

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm run build
cd frontend && npm run check   # typecheck + lint + format:check (used by pre-commit)
```

# CI

Two workflows, both on push/PR to `master`/`main`:

| Workflow | Jobs |
|----------|------|
| `.github/workflows/ci.yml` | Backend (ruff → mypy baseline → pytest → pip-audit), Frontend (prettier → tsc → vitest → eslint → npm audit → build), E2E (Playwright, chromium). Skipped entirely for markdown-only changes |
| `.github/workflows/knowledge.yml` | Knowledge layer + repo-convention invariants (`scripts/check-knowledge/`). Runs always — it is stdlib-only and takes about a second |

The backend `Type check` step is a **baseline gate**: it fails only on `file:error-code` pairs not
already listed in `backend/.mypy-baseline`. Lower the baseline as you fix existing errors.

# Lint & Format

Pre-commit hooks (`.pre-commit-config.yaml`):

| Hook | Scope |
|------|-------|
| ruff, ruff-format | `backend/` |
| prettier | `frontend/` |
| knowledge-check | `.agent/`, `wiki/`, `docs/` and the agent entry points |
| knowledge-stale | code changed under a module some `wiki/` page describes. Advisory: prints a reminder to run `/knowledge-verify` and then refresh the stamp; it fails only on a hole in `scripts/check-knowledge/knowledge-stamps.json` |
| trailing-whitespace, end-of-file-fixer, check-yaml, check-added-large-files, detect-private-key | all files |

There is **no** `no-commit-to-branch` hook; earlier versions of this page claimed one.

```bash
pre-commit run --all-files              # all hooks
pre-commit run knowledge-check --all-files   # just the knowledge layer
pre-commit run knowledge-stale --all-files   # just the staleness reminder
```

Backend: ruff config in `backend/pyproject.toml` (includes `TID251` banning direct `openai` imports,
per INV-005). Frontend: eslint + prettier.

Backend ruff is pinned in **two places that must agree**: `backend/requirements-dev.txt` and the
`astral-sh/ruff-pre-commit` rev in `.pre-commit-config.yaml`. Ruff's formatter output can change
between minor versions, so an open range lets CI and local pre-commit disagree — which is exactly
what happened (CI resolved 0.16.4 while pre-commit pinned 0.15.18). Bump both in one commit.
