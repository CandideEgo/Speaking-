---
name: context-bootstrap
description: Help an agent understand an unfamiliar project and create a lightweight long-term context layer. Use when entering a new project, when project context is missing, or when the agent needs a deeper understanding of the system.
---

# Project Context Bootstrap

## Purpose

This skill helps establish a project mental model.

It does not generate traditional documentation.

It creates a compressed understanding of the project that helps future agents make better decisions.

The goal is:

Better context, not more documents.

---

# Core Principles

## Code is the source of truth

The repository is the actual system.

Context files are only a representation of understanding.

Never assume documentation is correct without checking code.

## Do not document everything

Avoid creating:

- complete file lists
- API references
- function descriptions
- duplicated README content

Only capture information that affects future engineering decisions.

## Implicit Knowledge Filter

Before recording any knowledge, apply these three filters:

1. **Is this hidden from code?** — If code directly expresses it, don't record it.
2. **Will future changes benefit?** — If no decision impact, don't record it.
3. **Does it explain why, not what?** — If only description, don't record it.

Only knowledge passing all three filters should be recorded.

---

# When to Use

Use this skill when:

- The project is unfamiliar
- No project context exists
- Major architectural understanding is needed
- A new agent joins the project

Do not use for:

- Small fixes
- Simple changes
- Normal coding tasks

---

# If Context Already Exists

If `.agent/` files already exist, do NOT recreate them from scratch.

Instead:
1. Read `.agent/README.md` first — it is the ownership table, and it says which file holds which fact
2. Read the files it routes to, and identify sections that may be outdated (check `state.md` `## Last Updated`)
3. Spot-check outdated sections against current code
4. Update only the sections that have drifted
5. Preserve knowledge that is still accurate

Context bootstrap is for creating NEW context or REFRESHING stale context,
not for replacing working context.

---

# Process

## Pre-check

Before exploring, check:
- Does `.agent/` exist with the layer's files — `README.md`, `invariants.md`, `system-map.md`,
  `context.md`, `state.md`, `decisions-index.md`, `decisions.md`, `archive/`?
- Is `state.md` `## Last Updated` within 14 days?
- Does `.agent/README.md` name the file that owns each kind of fact?
- If `scripts/check-knowledge/check_knowledge.py` exists, run it — it is the deterministic gate over
  the layer, and it also tells you which files are expected

If the layer is present and fresh → read it instead of re-exploring.
If not → proceed with exploration, but preserve any existing knowledge that is still accurate.

## Exploration

Explore the project naturally.

Use available tools to understand:

- project purpose
- architecture
- important workflows
- key components
- technical constraints
- historical decisions if available

Decide what information will be valuable for future development.

---

# Relationship with Existing Documentation

If the project already has these documents, **extract from them, do not duplicate**:

| Existing Document | How to Handle |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | Already contains project info — context.md should complement, not copy |
| `CONTEXT.md` | Already contains domain terms — context.md should add architecture understanding |
| `docs/adr/` | Already contains decisions — decisions.md should reference, not repeat |
| `README.md` | Already contains project intro — context.md should add deeper understanding |
| `docs/operations/` | Already holds runbooks — link to it for operational knowledge instead of restating it |

---

# Create Context

Create only what is missing:

.agent/README.md

.agent/invariants.md

.agent/system-map.md

.agent/context.md

.agent/state.md

.agent/decisions-index.md

.agent/decisions.md

.agent/archive/

Wiki documents are a separate, long-form layer under `wiki/` (`architecture/`, `problems/`,
`guides/`). Create them only when there is knowledge worth a document, and always with the
frontmatter that `scripts/check-knowledge/check_knowledge.py` enforces.

## README.md — Suggested structure

The routing file: which file owns which kind of fact, the read order, and the rules.

```markdown
# The Knowledge Layer

| File | Holds | Read when |
|------|-------|-----------|
| `context.md` | what the product is; domain vocabulary | the task needs domain language |
| `system-map.md` | modules, dependencies, critical paths | before changing code |
| `invariants.md` | rules that must keep holding; removed features | before changing code |
| `decisions-index.md` | ID → date → title → ADR → status | always, before opening an entry |
| `decisions.md` | the full reasoning of each decision | you need one decision's reasoning |
| `state.md` | what is in flight, what is next, what is broken | session start |
| `archive/` | frozen point-in-time records | archaeology |

## Rules
- Never edit or reorder an existing decision entry. Append a new one and mark the old
  `superseded by DEC-0NN` in the index.
- No commit hashes in stable knowledge files — point at the decision ID instead.
- `archive/` is exempt from the checks.
```

## invariants.md — Suggested structure

```markdown
# Invariants

> Rules that must keep holding, and features that must not come back.

| ID | Rule | Why | Enforced by |
|----|------|-----|-------------|
| INV-001 | [what must be true] | [what breaks otherwise] | check / test / review |
```

## system-map.md — Suggested structure

```markdown
# System Map

## Module Overview
List key modules and their responsibility (one line each).

## Dependencies
How modules depend on each other.
Focus on non-obvious dependencies that code alone doesn't make clear.

## Data Flow
How data moves through the system.
Only critical paths, not every function call.

## External Boundaries
What the system connects to (APIs, databases, services).
What protocols and contracts are used.
```

system-map.md answers: **"How do the pieces connect?"**

While context.md answers "What is this system?",
system-map.md answers how the parts relate to each other.
For large projects, this is essential — context alone doesn't reveal
cross-module relationships and hidden dependencies.

Rules that must always hold live in `invariants.md`, not here — a map that doubles as a rulebook
stops being readable as a map.

## context.md — Suggested structure

```markdown
# Project Context

## Purpose
What problem does this project solve?

## System Understanding
How does the system currently work?

## Important Flows
Describe critical business or technical flows.

## Domain Terms
What the vocabulary means, and where it comes from.

## Constraints
Things future changes should be careful about.

## Known Issues
Important limitations.
```

## decisions-index.md — Suggested structure

The only navigation into `decisions.md`.

```markdown
| ID | Date | Title | ADR | Status |
|----|------|-------|-----|--------|
| DEC-001 | YYYY-MM-DD | [title, verbatim from the entry heading] | ADR-0001 | active / superseded by DEC-0NN |
```

IDs are assigned in file order, which is append order. A new decision requires both the entry at the
end of `decisions.md` and a row here — the `index` check fails when the two disagree on count, order,
date or title.

## decisions.md — Suggested structure

Append-only. Each entry starts with a heading the `index` check can parse:

```markdown
## YYYY-MM-DD — Title

**Problem**: Why this choice was needed
**Decision**: What was chosen
**Reason**: Why this option
**Alternatives**: What was considered but not chosen, and why
```

Never edit or reorder an existing entry; to change course, append a new one at the END and mark the
old row superseded in the index.

Only record decisions with genuine tradeoffs. Not obvious choices.

## state.md — Suggested structure

Forward-looking only. Exactly these five sections:

```markdown
# Project State

## Last Updated

Date: YYYY-MM-DD

- [a few bullets on what changed]

## Recently Completed

- [newest first, one line each, cite the decision ID]

## Current Focus

- [what is being worked on now]

## Next Steps

1. [what comes next]

## Known Issues

- [important known problems]
```

Completed work is recorded in `decisions-index.md`, `CHANGELOG.md` or `archive/`, not accumulated
here — `state.md` is read every session and is size-capped.

---

# Quality Criteria

Good context:

- explains why things exist
- helps future decisions
- reduces repeated exploration

Bad context:

- copies source code
- duplicates documentation
- records meaningless details
