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

## Context

Before major work, read:

.agent/context.md

.agent/decisions.md

.agent/state.md

.agent/system-map.md

## Skills

Available capabilities:

- project-context-bootstrap
- engineering-decision-support
- project-knowledge-maintenance
- knowledge-verification

Use them when they improve results.

## Knowledge Management

Record only knowledge that passes the Implicit Knowledge Filter:

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

This project is indexed by GitNexus as **Speaking-** (9564 symbols, 20266 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
