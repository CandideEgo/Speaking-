---
title: Testing Guide
tags: [workflow, testing, ci]
status: active
confidence: verified
related_code: [pytest-suite, pre-commit, ci-workflows]
related: [knowledge/wiki/guides/setup.md]
created: 2026-07-21
updated: 2026-10-11
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
cd frontend && npm run check   # typecheck + lint + format:check
```

# E2E（Playwright）

本地门禁跑**全部三个项目**（chromium / firefox / mobile-chrome，`mobile-iphone` 只匹配 `mobile.spec.ts`）：

```bash
cd frontend && npm run test:e2e -- <spec 名...>   # 不指定项目 = 全项目
```

**不要照抄 CI 的项目范围**：`ci.yml` 的 e2e job 只装/只跑 chromium（省时间），而只看 chromium 会漏掉移动形态的整类回归——`watch-return` 的移动壳返回键曾在 mobile-chrome 恒红 8 天而历轮「全套 chromium」全绿（10-11 修，见 CHANGELOG）。并行负载下仍有低概率单点 flake（每轮至多 1 个、spec 随机、隔离恒绿）：先隔离复跑，失败证据要**立刻**读 `test-results/*/error-context.md`（下一轮会把上一轮冲掉）。

**桌面专属断言不要按项目名过滤**：在 describe 里 `test.use({ viewport: { width: 1280, height: 900 } })` 强制桌面视口，让它们在每个项目里都真跑（先例：`repro-stage1` / `mobile-current-sentence-card` / `mobile-wordcard-drawer` 的「桌面端」describe、`watch.spec` 的文件级）。移动壳（≤1023px，DEC-069）下词卡是通栏 sheet、折叠键 `hidden lg:flex`，不强制视口就必红。

**读报告：serial 文件会级联**：`test.describe.configure({ mode: "serial" })` 的文件里一条失败，其后用例标为 `did not run`——不是失踪也不是 skip，统计时算回失败文件的后续段。

**守卫写 `waitFor` 不写 `isVisible({ timeout })`**：后者在这套 API 上忽略 timeout、未水合即返回 false——曾让 `repro-stage1`（10-02 发现）与 `watch.spec`（同轮发现）的「无视频就 skip」守卫在任何环境静默 skip，断言长期无人看（两处修复记于 CHANGELOG 10-11）。

**登录墙（D0）后的用例必须登录**：未登录 `goto("/")` 被 302 到 `/login`，断言就静默退化成对登录页的检查（`watch.spec` 4 条恒 skip、`video.spec` 2 条空转；修复记于 CHANGELOG 10-11）。两条合法路径：真注册 + `loginViaToken` / `loginViaUi`（`helpers.ts`）；或本地铸票 + abort `/api/**`（`container-align` / `home-sort-truth` 的 `mintToken` —— proxy 只查 cookie 存在且非空，不解 JWT）。

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
| knowledge-check | `.agent/`, `knowledge/wiki/`, `docs/` and the agent entry points |
| knowledge-stale | code changed under a module some `knowledge/wiki/` page describes. Advisory: prints a reminder to run `/knowledge-verify` and then refresh the stamp; it fails only on a hole in `scripts/check-knowledge/knowledge-stamps.json` |
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
