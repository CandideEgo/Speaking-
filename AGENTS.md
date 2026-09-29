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
| Before changing code | `.agent/invariants.md` + `knowledge/system-map.md` |
| You need a decision's reasoning | `knowledge/decisions-index.md`, then that one entry |
| You need past knowledge you cannot name | `knowledge/INDEX.md` — every cold file, one line each |
| The task needs domain vocabulary | `CONTEXT.md` |
| Resuming work | `.agent/state.md` |
| Debugging something that feels familiar | `knowledge/wiki/problems/` |
| Operating a deployment | `knowledge/operations/` |
| Deciding where a file belongs, or adding a top-level directory | `knowledge/wiki/guides/repository-layout.md` |
| The user dictated a wall of ideas to place | `knowledge/inbox/README.md`, then `/intake` |

Never read `knowledge/decisions.md` end to end — it is the largest file in the layer and only grows.
`.agent/README.md` is the layering standard: which fact belongs in which layer, and how to add one.

### Task → document map

| Touching | Read as well |
|---|---|
| `tasks/video_processing.py`, `services/transcription`, `services/translation` | [video-pipeline](knowledge/wiki/architecture/video-pipeline.md) · [translation safety net](knowledge/wiki/architecture/translation-quality-safety-net.md) |
| `services/ai_service.py`, `services/word_notes.py`, `api/v1/words.py`, `services/ecdict.py` | [exam vocabulary](knowledge/wiki/architecture/exam-vocabulary.md) |
| `api/v1/media.py`, `services/video_access.py`, `services/video_cache.py` | [cache & media-gate blindspots](knowledge/wiki/problems/cache-invalidation-and-media-gate-blindspots.md) |
| `api/dependencies.py`, `core/security.py`, `frontend/src/stores/` | [auth system](knowledge/wiki/architecture/auth-system.md) |
| `frontend/src/app/`, `components/`, `lib/` | [frontend architecture](knowledge/wiki/architecture/frontend-architecture.md) |
| any other backend service or task | [backend services](knowledge/wiki/architecture/backend-services.md) |
| scoring, recommendations, rankings | [backend services](knowledge/wiki/architecture/backend-services.md) |
| ECDICT gloss or exam annotation behaving oddly | [ASR / annotation diagnosis](knowledge/wiki/problems/asr-annotation-quality-diagnosis.md) |
| a review-fix round repeating an old mistake | [review/fix failure modes](knowledge/wiki/problems/review-fix-failure-modes.md) |
| servers, media topology, credentials | [runbook](knowledge/operations/RUNBOOK.md) · [media topology](knowledge/operations/MEDIA-TOPOLOGY.md) |
| local setup, running tests, pushing | [setup](knowledge/wiki/guides/setup.md) · [testing](knowledge/wiki/guides/testing.md) · [release checklist](knowledge/wiki/guides/release-checklist.md) |
| splitting one task across multiple agents | [module owners](.agent/owners.md) · [handoff format](.agent/handoffs/README.md) |

## Knowledge Layers

Two layers, one directory each. The standard — which fact belongs where, and how to add one — is
`.agent/README.md`; this table is only the routing summary.

| Layer | Where | What belongs | Does NOT belong |
|-------|-------|--------------|-----------------|
| **Hot** | `AGENTS.md`, `CONTEXT.md`, `.agent/` | What a session must know before it knows the task, and what is true **now** | Anything in the past tense: history, "used to", "was fixed by" |
| **Cold** | `knowledge/`, entered through `knowledge/INDEX.md` | Everything that records the past: decisions, plans, ADRs, progress, operations, archives | Anything needed to decide today's next action |
| **Code** | The codebase itself | What exists; what functions do | Why it was designed this way; non-obvious constraints |

**One fact, one home.** A hot file states the conclusion and points at the cold file that explains it;
neither restates the other. Byte sizes are reported (`--size-report`) and never capped, because a byte
wall at the moment of writing buys shorter sentences rather than fewer facts (DEC-067). What keeps the
cold store usable is not its size but its index: every file under `knowledge/` is listed there exactly
once, and every listed path exists — both machine-checked.

Older skill versions route operational knowledge to a user-level `memory/` directory. That layer was
never instantiated in this project and is not used; operational knowledge lives in `.agent/state.md`
and `knowledge/operations/`.

## Knowledge Management Rules

### Enforced by machine

`scripts/check-knowledge/check_knowledge.py` runs in pre-commit and in the `Knowledge` CI workflow.
It fails on: broken links, `ADR-00xx` with no file, invalid `knowledge/wiki/` frontmatter, unknown or dead
`related_code` modules, commit hashes in stable knowledge files, index/entry drift, a tracked
top-level entry missing from `scripts/check-knowledge/layout.json`, a capture whose content changed
after it was sealed or whose segments lost their disposition, a ticket in `.agent/handoffs/` whose
fields or blockers do not hold, and a configured knowledge path that is not on disk. A ninth check,
`stale`, names the `knowledge/wiki/` pages whose code changed since they were verified — a reminder,
not a failure. Run it directly with `pre-commit run knowledge-check --all-files`.

### MUST (强制执行)

- 跨模块变更后（改动了 ≥2 个 service/模块的接口或行为），MUST 执行 `/knowledge-maintain` 再提交
- 引入新功能/改架构/选技术/不可逆变更前，MUST 执行 `/decision-support`
- 新增决策时，MUST 在 `knowledge/decisions.md` **末尾追加**条目，并在 `knowledge/decisions-index.md` 补一行（检查会校验二者的数量、顺序、日期与标题一致）
- 删除代码后，MUST 清理引用它的 `related_code` 模块与文档（检查会因模块匹配不到文件而失败）
- 冷仓新增、搬动或删除文件后，MUST 同步 `knowledge/INDEX.md`（检查会因漏登记或死链而失败）

### SHOULD (强烈建议)

- 新会话首次进入项目时，SHOULD 按上面的 Start Here 表取用（而非执行 `/context-bootstrap`）
- `.agent/state.md` 的 Last Updated 超过 14 天时，SHOULD 执行 `/knowledge-verify`

### NEVER

- NEVER 修改或重排 `knowledge/decisions.md` 里已存在的条目。改变主意 = 追加新条目 + 在索引里把旧条目标为 `superseded by DEC-0xx`
- NEVER 把 git 提交哈希写进热层或 `knowledge/wiki/` 的稳定文件；历史属于决策记录与 `knowledge/CHANGELOG.md`
- NEVER 给知识层设字节上限或字节目标（DEC-067）。体积只被报告、不被判定；要收敛的是「放对层了吗」，不是「写短一点」
- NEVER 在 `memory/` 中重复记录热层或 `knowledge/wiki/` 已覆盖的架构知识
- NEVER 修改 `knowledge/inbox/*/raw.md` 的正文。原话只增不改：改一个字封存摘要就失败，`--capture-seal` 也会拒绝重签。要修订 = 另起一张 capture，旧的 `triage.md` 指过去

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

## Agent skills

### Issue tracker

Issues live in GitHub Issues (repo `CandideEgo/Speaking-`), via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles map 1:1 to label strings of the same name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` (includes domain terms) + `knowledge/adr/` at the repo root. See `docs/agents/domain.md`.
