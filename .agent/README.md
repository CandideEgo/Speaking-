# The Knowledge Layer

> Two layers, one directory each. This file is the standard for both: where a fact goes, how it is
> found again, and what is never done to it.

## The two layers

| | Hot — `.agent/`, `AGENTS.md`, `CONTEXT.md` | Cold — `knowledge/` |
|---|---|---|
| Read | every session, before the task is known | on demand, entered through `knowledge/INDEX.md` |
| Holds | what is true **now** | everything that records the past |
| Test | "if I skip it, will I do today's work wrong?" | "will someone need this to explain or operate something?" |
| Grows | it should not: a fact that stops being current moves out | yes, without limit |
| Size | printed by `--size-report` | printed, never capped |

Three admission tests for the hot layer — **all** must hold:

1. every session reads it, whatever the task;
2. it describes the present, not the past (past tense, "fixed", "used to" ⇒ cold);
3. reading it changes the next action, not just the understanding of a finished decision.

## Hot files

| File | Holds | Read when |
|------|-------|-----------|
| `AGENTS.md` | routing table + MUST / SHOULD / NEVER | session start, always |
| `CONTEXT.md` | what the product is; domain vocabulary | the task needs domain language |
| `.agent/README.md` (this file) | the layering standard | writing to either layer |
| `.agent/state.md` | what is in flight, what is next, what is broken | session start |
| `.agent/invariants.md` | rules that must keep holding; removed features | before changing code |
| `.agent/owners.md` | slices, tickets, parallel-work rules | splitting a task across agents |
| `.agent/handoffs/` | one file per **open** ticket; the fields are the state machine | claiming or accepting a ticket |

## Cold store

Everything that records the past is under `knowledge/`: `wiki/` (architecture / problems / guides),
`adr/`, `decisions.md` + `decisions-index.md`, `system-map.md`, `plans/`, `progress/`,
`requirements/`, `operations/`, `inbox/` (the user's own dictated words), `archive/` (frozen),
`CHANGELOG.md`.

`knowledge/INDEX.md` is the entry point: one line per file. The `index` check enforces both
directions — every file listed exactly once, every listed path real.

## Which file owns which fact

| The fact is… | It belongs in |
|---|---|
| A rule that must keep holding | `.agent/invariants.md` |
| Why a decision was made, and what it cost | `knowledge/decisions.md`, indexed by `knowledge/decisions-index.md` |
| What a domain word means | `CONTEXT.md` |
| How two modules relate | `knowledge/system-map.md` |
| What is being worked on right now | `.agent/state.md` |
| A reusable failure mode (a trap worth remembering) | `knowledge/wiki/problems/` |
| How a subsystem is designed, in depth | `knowledge/wiki/architecture/` |
| A dated record of what happened | `knowledge/progress/`, `knowledge/CHANGELOG.md` |
| How to operate the deployed system | `knowledge/operations/` |
| What the user actually said | `knowledge/inbox/` |

If a fact fits two rows, the more specific one owns it; the other links.

## Rules

- **One fact, one home.** A hot file states the conclusion and points; the detail lives cold.
  Restating a fact in both places is the failure this layer exists to prevent.
- **No byte ceiling and no byte target** (DEC-067). `--size-report` prints sizes and never fails a
  run. When a file feels too big, the question is which layer its facts belong in — not how to say
  less; a byte wall at the moment of writing buys shorter sentences, not fewer facts.
- **A fact that stops being current moves; nothing is deleted.** Move it cold, list it in the index.
- **Never edit or reorder a decision entry.** To change course, append a new entry and mark the old
  one `superseded by DEC-0xx` in `decisions-index.md`.
- **No commit hashes** in the hot layer or in stable `knowledge/wiki/` pages; history belongs in
  `knowledge/decisions.md`, `knowledge/archive/` and `knowledge/CHANGELOG.md`.
- **Every `knowledge/wiki/` document declares `related_code`** via module IDs from
  `scripts/check-knowledge/modules.json`; a module matching no file fails — code deletion surfacing
  as drift.
- **`knowledge/archive/` is exempt from the checks.** Frozen records are correct as written, not
  held to today's links; text that no longer constrains the code moves here and leaves a stub.

## Enforcement

`scripts/check-knowledge/check_knowledge.py` runs in pre-commit and the `Knowledge` CI workflow. The
checks it runs live in `scripts/check-knowledge/README.md`; the paths they scan live in
`scripts/check-knowledge/paths.json`, where a configured path that is missing fails the run — so
moving a knowledge directory without updating that file is loud, never silent. Whether prose still
matches reality is the `/knowledge-verify` skill's job.
