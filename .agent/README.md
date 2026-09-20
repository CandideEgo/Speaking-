# The Knowledge Layer

> One fact, one home — find which file already owns a fact before adding it.

## Files

| File | Holds | Changes | Read when |
|------|-------|---------|-----------|
| `context.md` | what the product is; domain vocabulary | rarely | the task needs domain language |
| `system-map.md` | modules, non-obvious dependencies, critical paths, external boundaries | rarely | before changing code |
| `invariants.md` | rules that must keep holding; removed features | rarely | before changing code |
| `decisions-index.md` | ID → date → title → ADR → status | per decision | always, before opening an entry |
| `decisions.md` | the full reasoning of each decision | append-only | you need one decision's reasoning |
| `state.md` | what is in flight, what is next, what is broken | every session | session start |
| `owners.md` | routing table for multi-agent splits | rarely | splitting a task across agents |
| `handoffs/` | per-task state transfer between agents | per split task | pickup/acceptance of a split task |
| `archive/` | frozen point-in-time records | never | archaeology |

Sibling layers: `wiki/` (long-form — `architecture/`, `problems/`, `guides/`), `docs/adr/`, `docs/progress/`, `CHANGELOG.md`, `docs/operations/`.

## Read order

1. `AGENTS.md` — every session; it routes to everything else.
2. `invariants.md` + `system-map.md` — before changing code.
3. `decisions-index.md`, then the single entry you need — never read `decisions.md` end to end.
4. The `wiki/` document for the subsystem you touch.

## Which file owns which fact

| The fact is… | It belongs in |
|---|---|
| A rule that must keep holding | `invariants.md` |
| Why a decision was made, and what it cost | `decisions.md`, indexed by `decisions-index.md` |
| What a domain word means | `context.md` |
| How two modules relate | `system-map.md` |
| What is being worked on right now | `state.md` |
| A reusable failure mode (a trap worth remembering) | `wiki/problems/` |
| How a subsystem is designed, in depth | `wiki/architecture/` |
| A dated record of what happened | `docs/progress/`, `CHANGELOG.md` |
| How to operate the deployed system | `docs/operations/` |

If a fact fits two rows, the more specific one owns it; the other links.

## Rules

- **Never edit or reorder an existing decision entry.** To change course, append a new entry and
  mark the old one `superseded by DEC-0xx` in `decisions-index.md`.
- **No commit hashes** outside `decisions.md`, `archive/`, `docs/` and `CHANGELOG.md`. A knowledge
  file that narrates git history goes stale; point at the decision instead.
- **Every `wiki/` document declares `related_code`** via module IDs from
  `scripts/check-knowledge/modules.json`; a module matching no file fails — code deletion surfacing
  as drift.
- **Size ceilings are ceilings, not targets.** `knowledge-budget.json` records them as `limit` +
  `slack`; lower by hand, or raise deliberately with `--budget-refresh`.
- **`.agent/archive/` is exempt from the checks.** Frozen records are correct as written, not held
  to today's links.

## Enforcement

`scripts/check-knowledge/check_knowledge.py` runs in pre-commit and the `Knowledge` CI workflow —
broken links, missing ADRs, invalid frontmatter, unknown modules, misplaced git hashes, index/entry
drift, budget growth. Whether prose still matches reality is the `/knowledge-verify` skill's job.
