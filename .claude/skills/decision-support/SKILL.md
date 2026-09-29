---
name: decision-support
description: Improve engineering decisions by analyzing context, assumptions, alternatives and tradeoffs. Use for architectural changes, major features, refactoring, or decisions with long-term impact.
---

# Engineering Decision Support

## Purpose

Help the agent reason like an experienced engineer.

This skill does not make decisions for humans.

It improves the quality of decisions.

---

# Philosophy

The goal is not more questions.

The goal is better understanding.

Do not force a checklist.

Do not follow a fixed interview process.

Use judgment.

---

# When to Use

Consider using this skill when:

- introducing a major feature
- changing architecture
- selecting technology
- making irreversible decisions
- performing large refactors

Avoid using for:

- simple bug fixes
- formatting
- trivial changes

---

# Before Making Decisions

Understand:

## Existing Reality

Check:

- current implementation
- existing architecture
- `.agent/invariants.md` — the rules the change must not break
- **cross-module impact** — trace the callers of affected symbols (grep the call sites) to assess blast radius

Do not rely only on memory.

## Existing Decisions

Review:

knowledge/decisions-index.md

knowledge/decisions.md — only the one entry you need

Never read `decisions.md` end to end; the index exists so you don't have to.

Understand why previous choices were made.

---

# Decision Analysis

When uncertainty exists, analyze:

## Problem

What problem are we actually solving?

## Assumptions

What assumptions are being made?

## Options

What possible approaches exist?

## Tradeoffs

What are the advantages and disadvantages?

## Recommendation

Provide a recommendation with reasoning.

Example:

```
Current understanding:
...

Decision:
...

Possible approaches:
  A:
    Advantages:
    Risks:
  B:
    Advantages:
    Risks:

Recommendation:
  Choose A because...
```

---

# Important

Do not optimize only for short-term implementation.

Consider:

- maintainability
- complexity
- future changes
- project direction

---

# Record Decision

If a non-obvious choice was made, record it in `knowledge/decisions.md`:

```markdown
## YYYY-MM-DD — Title

**Problem**: Why this choice was needed
**Decision**: What was chosen
**Reason**: Why this option
**Alternatives**: What was considered but not chosen
```

The heading form matters: the `index` check parses entries as `## YYYY-MM-DD — Title`.

`knowledge/decisions.md` is append-only and immutable:

- **Never edit, reorder or delete an existing entry.** Not to correct it, not to update it.
- To change course, append a new entry at the **END** of the file, then mark the old row
  `superseded by DEC-0NN` in `knowledge/decisions-index.md`.
- A new decision requires **both** the appended entry and a new row in the index. IDs are assigned
  in file order, and the title in the index must match the entry heading verbatim — the `index`
  check fails on any disagreement, and on an ID out of sequence.

If the project has a `knowledge/adr/` system, create an ADR as well.

## Where to Record

- Decisions with ADR-level impact → `knowledge/adr/` (one file per accepted ADR) + the entry in
  `knowledge/decisions.md` + its row in `knowledge/decisions-index.md`
- Decisions with module-level impact → `knowledge/decisions.md` + its index row
- Decisions that are obvious or low-impact → do not record (fails Implicit Knowledge Filter gate 2)

Operational knowledge is not a decision: it belongs in `knowledge/operations/` or `.agent/state.md`.
