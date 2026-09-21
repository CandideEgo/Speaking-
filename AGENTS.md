# AGENTS.md

## Role

You are an engineering agent working inside this repository.

Your goal is not only to modify code,
but to maintain an accurate understanding of the system.

## Principles

Code is the source of truth.

Documentation represents understanding,
not implementation.

Skills provide capabilities,
not workflows.

## Start Here

Read this file every session. It routes; it deliberately holds no knowledge of its own.

| When | Read |
|------|------|
| Every session | this file |
| Before changing code | `.agent/invariants.md` + `.agent/system-map.md` |
| You need a decision's reasoning | `.agent/decisions-index.md`, then that one entry |
| The task needs domain vocabulary | `.agent/context.md` |
| Resuming work | `.agent/state.md` |
| Debugging something that feels familiar | `wiki/problems/` |
| Operating a deployment | `docs/operations/` |

Never read `.agent/decisions.md` end to end — it is the largest file in the layer and only grows.
`.agent/README.md` says which file owns which kind of fact, and how to add to them.

### Task → document map

| Touching | Read as well |
|---|---|
| `tasks/video_processing.py`, `services/transcription`, `services/translation` | [video-pipeline](wiki/architecture/video-pipeline.md) · [translation safety net](wiki/architecture/translation-quality-safety-net.md) |
| `services/ai_service.py`, `services/word_notes.py`, `api/v1/words.py`, `services/ecdict.py` | [exam vocabulary](wiki/architecture/exam-vocabulary.md) |
| `api/v1/media.py`, `services/video_access.py`, `services/video_cache.py` | [cache & media-gate blindspots](wiki/problems/cache-invalidation-and-media-gate-blindspots.md) |
| `api/dependencies.py`, `core/security.py`, `frontend/src/stores/` | [auth system](wiki/architecture/auth-system.md) |
| `frontend/src/app/`, `components/`, `lib/` | [frontend architecture](wiki/architecture/frontend-architecture.md) |
| any other backend service or task | [backend services](wiki/architecture/backend-services.md) |
| scoring, recommendations, rankings | [backend services](wiki/architecture/backend-services.md) |
| ECDICT gloss or exam annotation behaving oddly | [ASR / annotation diagnosis](wiki/problems/asr-annotation-quality-diagnosis.md) |
| a review-fix round repeating an old mistake | [review/fix failure modes](wiki/problems/review-fix-failure-modes.md) |
| servers, media topology, credentials | [runbook](docs/operations/RUNBOOK.md) · [media topology](docs/operations/MEDIA-TOPOLOGY.md) |
| local setup, running tests, pushing | [setup](wiki/guides/setup.md) · [testing](wiki/guides/testing.md) · [release checklist](wiki/guides/release-checklist.md) |
| splitting one task across multiple agents | [module owners](.agent/owners.md) · [handoff format](.agent/handoffs/README.md) |

## Knowledge Layers

| Layer | Location | Stores | Does NOT store |
|-------|----------|--------|----------------|
| **Architectural** | `.agent/` + `wiki/` (in repo) | Why things are designed this way; module connections; constraints; decisions | Environment-specific operations; deployment state |
| **Operational** | `.agent/state.md`, `docs/operations/`, `CHANGELOG.md` | What is in flight; how to operate this environment; failure modes | Architecture understanding; design decisions |
| **Code** | The codebase itself | What exists; what functions do; what types are used | Why it was designed this way; non-obvious constraints |

**Rule: knowledge belongs in exactly one layer.** If architectural knowledge exists in `.agent/` or
`wiki/`, do not restate it elsewhere — link to it. If code directly expresses something, do not
document it at all.

Older skill versions route operational knowledge to a user-level `memory/` directory. That layer was
never instantiated in this project and is not used; operational knowledge lives in `.agent/state.md`
and `docs/operations/`.

## Knowledge Management Rules

### Enforced by machine

`scripts/check-knowledge/check_knowledge.py` runs in pre-commit and in the `Knowledge` CI workflow.
It fails on: broken links, `ADR-00xx` with no file, invalid `wiki/` frontmatter, unknown or dead
`related_code` modules, commit hashes in stable knowledge files, index/entry drift, and size-ceiling
growth. A seventh check, `stale`, names the `wiki/` pages whose code changed since they were
verified — a reminder, not a failure. Run it directly with
`pre-commit run knowledge-check --all-files`.

### MUST (强制执行)

- 跨模块变更后（改动了 ≥2 个 service/模块的接口或行为），MUST 执行 `/knowledge-maintain` 再提交
- 引入新功能/改架构/选技术/不可逆变更前，MUST 执行 `/decision-support`
- 新增决策时，MUST 在 `.agent/decisions.md` **末尾追加**条目，并在 `.agent/decisions-index.md` 补一行（检查会校验二者的数量、顺序、日期与标题一致）
- 删除代码后，MUST 清理引用它的 `related_code` 模块与文档（检查会因模块匹配不到文件而失败）

### SHOULD (强烈建议)

- 新会话首次进入项目时，SHOULD 按上面的 Start Here 表取用（而非执行 `/context-bootstrap`）
- `.agent/state.md` 的 Last Updated 超过 14 天时，SHOULD 执行 `/knowledge-verify`

### NEVER

- NEVER 修改或重排 `.agent/decisions.md` 里已存在的条目。改变主意 = 追加新条目 + 在索引里把旧条目标为 `superseded by DEC-0xx`
- NEVER 把 git 提交哈希写进 `.agent/`（`decisions.md`、`archive/` 除外）或 `wiki/` 的稳定文件；历史属于决策记录与 `CHANGELOG.md`
- NEVER 为了通过检查而手改预算数字。要么缩小内容，要么按归档流程处理（`scripts/check-knowledge/README.md`），要么显式执行 `--budget-refresh` 接受新上限
- NEVER 在 `memory/` 中重复记录 `.agent/` 或 `wiki/` 已覆盖的架构知识

### Implicit Knowledge Filter

Record only knowledge that passes all three gates:

1. Is it hidden from code? (If code directly expresses it, don't document it)
2. Will future changes benefit? (If no decision impact, don't record)
3. Does it explain why, not what? (If only description, don't record)

Do not create documentation for simple changes.

## Development

For small tasks:
act directly.

For high-impact changes:
consider architecture,
trade-offs,
and project history.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Speaking-** (14275 symbols, 25130 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Speaking-/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Speaking-/clusters` | All functional areas |
| `gitnexus://repo/Speaking-/processes` | All execution flows |
| `gitnexus://repo/Speaking-/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Agent skills

### Issue tracker

Issues live in GitHub Issues (repo `CandideEgo/Speaking-`), via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles map 1:1 to label strings of the same name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `.agent/context.md` (includes domain terms) + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
