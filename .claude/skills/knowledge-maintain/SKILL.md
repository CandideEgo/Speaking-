---
name: knowledge-maintain
description: Maintain long-term project knowledge after meaningful development changes. Use when completed work changes architecture, decisions, workflows, or reusable engineering knowledge.
---

# Project Knowledge Maintenance

## Purpose

Convert important development experience into future project understanding.

This is not a changelog.
This is not a task diary.

Only preserve knowledge that improves future decisions.

---

# The Knowledge Layer

`.agent/README.md` is the ownership table: which file owns which kind of fact, and the rules for
adding to them. Read it before writing anything.

| File | Owns |
|------|------|
| `.agent/README.md` | Which file owns which fact; the rules for adding to them |
| `.agent/invariants.md` | Rules that must keep holding; features that must not come back |
| `.agent/system-map.md` | Modules, non-obvious dependencies, critical paths, external boundaries |
| `.agent/context.md` | What the product is; domain vocabulary |
| `.agent/state.md` | Forward-looking state only |
| `.agent/decisions-index.md` | ID → date → title → ADR → status |
| `.agent/decisions.md` | The full reasoning of each decision; append-only |
| `.agent/archive/` | Frozen point-in-time records |
| `wiki/` | Long-form knowledge — `architecture/`, `problems/`, `guides/` |

Operational and environment knowledge belongs in `docs/operations/` and `.agent/state.md`.
There is no `memory/` layer in this project; do not route knowledge to one.

---

# Implicit Knowledge Filter

Before recording any knowledge, pass it through these three filters:

**Filter 1: Is this information hidden from code?**

If you can read it directly from the source code, do not record it.
Code already tells you what exists, what functions do, what types are used.
Only record what code cannot tell you:
- why something was designed this way
- what constraints exist that are not expressed in code
- what failure modes have been discovered
- what non-obvious interactions exist between components

**Filter 2: Will future changes benefit from knowing this?**

If no future developer (human or agent) would make a different decision
because of this knowledge, do not record it.
Trivia that does not affect decisions is noise.

**Filter 3: Does it explain why, not what?**

If it only describes what changed ("added Redis caching"), do not record it.
If it explains why ("added Redis caching because DB latency was the bottleneck
and read-heavy patterns made caching high-value"), record it.

Only knowledge that passes ALL THREE filters should be recorded.

---

# After Significant Changes

Ask:

Did this change affect:

- system understanding?
- architecture?
- important decisions?
- future development?

If no: do not create documentation.

If yes: apply the Implicit Knowledge Filter as a **gate**, not a suggestion.

For each piece of knowledge the agent considers recording:

1. Apply all three filter gates
2. If the knowledge FAILS any gate → output "Knowledge does not pass filter — not recorded" and stop
3. If the knowledge PASSES all gates → determine which file owns it (see Layer Routing below), then record

Do not record knowledge that fails the filter, even if it seems useful.
The filter exists to prevent knowledge bloat — the system's worst enemy is not missing knowledge, but noise.

---

# Knowledge Categories

## Project Understanding

Update:

.agent/context.md — when the product, its domain language, or a critical flow changes

.agent/system-map.md — when modules, their connections, or a boundary changes

.agent/invariants.md — when a rule that must keep holding is discovered, or a feature is removed

When:

- architecture changes
- major workflow changes
- important constraints change

---

## Engineering Decisions

Update:

.agent/decisions.md, plus one row in .agent/decisions-index.md

When:

- choosing between approaches
- changing architecture direction
- introducing important technology

Record:

```
## YYYY-MM-DD — Title

Problem:
Options:
Decision:
Reason:
Tradeoffs:
```

## Invariants

Update:

.agent/invariants.md

One line per rule: what must keep holding, why, and what enforces it
(a check, a test suite, or `review` where nothing does yet).

When:

- a rule that must keep holding is discovered
- a feature is removed and must not come back

---

## Reusable Lessons

Create:

wiki/problems/

When:

- difficult bugs
- deployment issues
- performance discoveries
- environment problems

Capture:

```
Problem:
Cause:
Solution:
Future Prevention:
```

---

# Layer Routing

After knowledge passes the filter, determine where to record it:

| Knowledge type | Record in | Reason |
|---------------|-----------|--------|
| Rule that must keep holding | `.agent/invariants.md` | Read before any code change; names what enforces it |
| Why a decision was made | `.agent/decisions.md` + a row in `.agent/decisions-index.md` | Referenced before future changes |
| How two modules relate | `.agent/system-map.md` | Non-obvious dependencies and boundaries |
| What a domain word means | `.agent/context.md` | Product vocabulary |
| Current project state | `.agent/state.md` | Always update after significant changes |
| Reusable problem/solution pattern | `wiki/problems/` | Structured long-term reference |
| How a subsystem is designed, in depth | `wiki/architecture/` | Long-form, with frontmatter |
| Operational failure mode or environment trap | `docs/operations/` and `.agent/state.md` | Environment-specific, not architectural |
| Dated record of what happened | `docs/progress/`, `CHANGELOG.md` | History, not understanding |

**Before adding anything, check**: does another `.agent/` or `wiki/` document already own this fact?
If yes, update that document or link to it — do not create a duplicate.

---

# Decisions Are Append-Only

`.agent/decisions.md` is immutable history.

- **Never edit or reorder an existing entry.** Not to correct it, not to update it, not to merge it.
- To change course: append a new entry at the **END** of `.agent/decisions.md`, then mark the old row
  `superseded by DEC-0NN` in `.agent/decisions-index.md`.
- A new decision requires **both**: the appended entry and a new row in the index.
- IDs are assigned in file order (`DEC-001` upward) and are never reassigned. The `index` check
  fails when the table and the file disagree on count, order, date or title, and it parses entry
  headings as `## YYYY-MM-DD — Title`.
- Never read `decisions.md` end to end. Open `decisions-index.md` first, then the one entry you need.

---

# Concision Check

When updating an existing knowledge document, check:
- Does this document contain "what" content that code already expresses?
- If yes, remove the "what" and keep only the "why"
- A document should shrink over time, not grow

Knowledge documents are compressed understanding, not growing archives.

---

# Wiki Document Format

If creating wiki documents, use this frontmatter:

```markdown
---
title: [title]
tags: [tags from unified system]
status: active
confidence: verified
related_code: [module IDs from scripts/check-knowledge/modules.json]
related: [repo-relative paths that exist]
created: [ISO date]
updated: [ISO date]
---
```

The `frontmatter` check enforces this schema on `wiki/**/*.md`:

- All eight keys are required. `status` is `active`/`deprecated`/`archived`;
  `confidence` is `verified`/`assumed`/`unverified`; `created` and `updated` are ISO dates and
  `updated` may not precede `created`.
- `related_code` takes module IDs, **not file paths**, and `scripts/check-knowledge/modules.json`
  is the only vocabulary. An ID that is not in that file fails the check, and a module whose globs
  match no real file fails it too — that is how deleting code surfaces as documentation drift. If a
  new area needs to be referenceable, add the module to `modules.json` first.
- `wiki/architecture/**` and `wiki/problems/**` must declare at least one module; `wiki/guides/**`
  may declare none, because guides describe process rather than code.
- `related` entries are repo-relative paths, and every one of them must exist.

## Dual Metadata: Status + Confidence

Knowledge documents carry two independent dimensions:

### Status (Knowledge Lifecycle)

| Status | Meaning | When |
|--------|---------|------|
| `active` | Document describes current reality | Created based on code analysis |
| `deprecated` | Knowledge superseded by new implementation | knowledge-verify detected drift |
| `archived` | Records past decisions, no longer current | Decision no longer active but explains why things are |

### Confidence (Knowledge Trustworthiness)

| Confidence | Meaning | When |
|------------|---------|------|
| `verified` | Document checked against current code | Created from code analysis, or verified by knowledge-verify |
| `assumed` | Document written from partial understanding | Agent inferred without full code review |
| `unverified` | Document not yet checked against code | Imported from external source, or stale |

These are orthogonal. Example:
- An `archived` decision can still be `verified` (it was true, just no longer active)
- An `active` document can be `assumed` (we think it's right but haven't verified)

Default for AI-written docs: `status: active`, `confidence: verified`.

## Unified Tags

Do not create arbitrary tags. Use only:

| Category | Tags |
|----------|------|
| Domain | video, audio, text, image, ai, data |
| Layer | backend, frontend, database, infrastructure |
| Concern | architecture, performance, security, bug, decision |
| Type | feature, workflow, pattern, anti-pattern |

---

# Always Update

Regardless of knowledge value, always update:

.agent/state.md

It is forward-looking only, and it has exactly these five sections:

```markdown
# Project State

## Last Updated

Date: YYYY-MM-DD

- [what changed in the layer's understanding of the state]

## Recently Completed

- [newest first, one line each, cite the decision ID]

## Current Focus

- [what is being worked on now]

## Next Steps

1. [what comes next]

## Known Issues

- [add or remove issues]
```

- Completed work does not accumulate here. It belongs in `.agent/decisions-index.md`,
  `CHANGELOG.md` or `.agent/archive/`; `## Recently Completed` holds a short tail, newest first.
- `## Last Updated` holds a `Date: YYYY-MM-DD` line plus a few bullets. It is the staleness signal:
  once it is more than 14 days old, run `/knowledge-verify`.
- Keep the file small — it is read every session, and `scripts/check-knowledge/knowledge-budget.json`
  caps it.

---

# Avoid

Do not record:

- every commit
- every file modification
- temporary debugging

The goal is knowledge compression.

---

# Task Reflection

After completing a task that involved significant changes, consider:

Did this work produce any of the following?

- [ ] New architectural constraint
- [ ] New failure mode discovered
- [ ] New design trade-off that was not obvious
- [ ] Reusable engineering experience

If any box is checked, pass the knowledge through the Implicit Knowledge Filter.
If it passes all three filters, create or update the appropriate knowledge document.
If none, only update .agent/state.md.

**When to trigger this reflection:**
- Modified 3+ files in a single task
- Changes crossed module boundaries
- Modified interfaces, APIs, or public contracts
- Changed configuration that affects behavior

Do not trigger for trivial changes (typo fixes, formatting, etc.).

This reflection is the seed of semi-automatic knowledge extraction (Phase 3).
It does not automatically write knowledge — it prompts the agent to consider
whether knowledge is worth recording.

---

# Mechanical Drift vs Judgement Drift

`scripts/check-knowledge/check_knowledge.py` runs in pre-commit and in the CI `Knowledge` workflow.
Six checks — `refs`, `frontmatter`, `ownership`, `index`, `paths`, `budget` — already catch, deterministically:

1. A markdown link that no longer resolves, or an ADR reference with no file in `docs/adr/`
2. Invalid `wiki/` frontmatter, an unknown `related_code` module, or a module whose code was deleted
3. A commit hash in a stable knowledge file (`.agent/*.md`, `wiki/*.md`) — point at the decision ID instead
4. `.agent/decisions-index.md` drifting from `.agent/decisions.md` in count, order, date or title
5. A forbidden or missing path, and knowledge files growing past their size ceiling

Do not hand-check those. What the checks cannot read is prose that no longer matches reality — that
is what `/knowledge-verify` is for.

Run it directly:

```bash
python scripts/check-knowledge/check_knowledge.py
```

Fix your own violations. The checker, `knowledge-budget.json` and `knowledge-baseline.json` are not
edited to make a change pass. `.agent/archive/` is exempt — frozen records are not held to today's
links or schema.

Still unimplemented: automatically flagging a wiki document whose `related_code` module changed.
Until that exists, changing code in a documented module means running `/knowledge-verify` before
committing.
