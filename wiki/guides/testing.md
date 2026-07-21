---
title: Testing Guide
tags: [workflow, testing, ci]
status: active
confidence: verified
related_code: [pytest-suite, pre-commit]
related: [wiki/guides/setup.md]
created: 2026-07-21
updated: 2026-07-21
---

# Backend Tests

```bash
cd backend && pytest tests/ -v
cd backend && pytest tests/test_ai_cache.py -v          # single test file
cd backend && pytest tests/test_ai_cache.py::test_fn -v  # single test
```

# Frontend Checks

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm run build
cd frontend && npm run check   # typecheck + lint + format:check (used by pre-commit)
```

# CI

Runs on push/PR via `.github/workflows/ci.yml`:
- Backend: pytest + mypy baseline
- Frontend: tsc + lint + build
- E2E: Playwright

# Lint & Format

Pre-commit hooks (`.pre-commit-config.yaml`): ruff (lint+format) on `backend/`, prettier on `frontend/`, trailing-whitespace/end-of-file-fixer/check-yaml/large-files/private-key/no-commit-to-master.

```bash
pre-commit run --all-files   # run all hooks manually
```

Backend: ruff config in `backend/pyproject.toml`. Frontend: eslint + prettier.
