---
title: Repository Layout
tags: [workflow, conventions, knowledge-layer]
status: active
confidence: verified
related_code: []
related: [wiki/guides/setup.md, wiki/guides/release-checklist.md]
created: 2026-09-29
updated: 2026-09-29
---

# Where a file belongs

One directory, one kind of thing. Which directory holds what follows from the knowledge layer's own
rules, not from taste:

1. **Reading frequency sets the price.** What every session must read lives in `.agent/`; what one
   task consults lives in `wiki/` or `docs/`; what nobody reads in order to decide anything is
   material, not knowledge.
2. **A fact has one home.** If a fact already lives somewhere, link to it instead of writing it into
   a second directory. `.agent/README.md` owns the fact → file table; this page owns the
   file → directory one.

## The top level

| Entry | Layer | Holds | Add here when… |
|---|---|---|---|
| `.agent/` | hot | the facts every session loads: `context`, `system-map`, `invariants`, `decisions` + index, `state`, `owners`, `handoffs/`, `archive/` | the fact changes what the next session does before it knows the task |
| `wiki/` | settled | long-form engineering knowledge: `architecture/`, `problems/`, `guides/` | one subsystem's design, a recurring trap, or a process, in depth |
| `docs/adr/` | settled | the long reasoning behind a decision | the entry in `decisions.md` needs more room than a page |
| `docs/operations/` | settled | how to run the deployed system: runbook, production, media topology, GPU worker, security | the reader is operating the live system |
| `docs/progress/` | settled | dated records: dev logs, reviews, audit reports, handovers | the value is "what happened, dated" — including one-off analyses |
| `docs/plans/` | settled | engineering plans, delivered ones included | work is planned before code changes; the status line at the top says live or delivered |
| `docs/requirements/` | input | the product's source of truth | product intent, not engineering knowledge |
| `inbox/` | input | the user's dictated ideas, verbatim: one directory per capture (`raw.md` frozen by a content digest, `triage.md` one row per segment) | it is the user's own words, not ours — never edited, and kept so work can be cited back to what was actually said |
| `docs/agents/` | settled | agent workflow conventions (issue tracker, triage labels, domain docs) | it tells an agent how to work, and is consulted rarely |
| `docs/design/` | material | `mockups/`, `prototypes/`, `beta-launch/` — things to look at | it is an artefact to see, never something read to decide |
| `backend/` `frontend/` | code | the application | it is code or a config the code reads |
| `scripts/` | tooling | `check-knowledge/`, `release.sh` | a reusable project-level script (backend one-offs go to `backend/scripts/`) |
| `logs/` | runtime | local run output; only `.gitkeep` and the audit raw output are tracked | never — it is the one directory that must stay untracked |
| 18 root files | entry / deploy | see "Deliberate exceptions" | the tool requires it at the root |

## Adding a directory

A new top-level entry needs three things: a reason it cannot live under an existing one, a row in
`scripts/check-knowledge/layout.json` naming the layer that owns it, and — when it is a new *kind*
of thing rather than a new instance of one — a decision entry. The `layout` check fails on a tracked
top-level entry with no row, and on a row with nothing tracked at it, so this table cannot rot
silently.

## Why `inbox/` is a layer of its own

`docs/` is the settled layer: what is in it was written by us, edited, and made to link correctly.
A capture is the opposite on all three counts — dictated, never to be edited, and frozen by a
content digest. It is also the front door: the first thing a new idea touches, and the one thing a
reader must find without reading any documentation. So it gets its own layer (`input`), its own
format (`inbox/README.md`) and its own check (`captures`, DEC-064). A layer whose content no rule
may touch is exactly the case the section above asks for.

## Material is not knowledge

`docs/design/` holds artefacts that exist to be *looked at*: pre-implementation UI mockups, the HTML
prototypes the frontend was rebuilt from, and the beta-launch art. Nothing is decided by reading
them, they are not held to today's links or schema, and they never belong in the hot layer.
`docs/design/beta-launch/` is excluded from pre-commit's 1 MB large-file check on purpose: launch
posters are megabytes by nature.

## Deliberate exceptions

- **Deployment files stay at the root** (`docker-compose*.yml`, `nginx*.conf`, `promtail.yml`,
  `deploy*.sh`). They are what production actually runs, `docker` convention expects a compose file
  at the root, and moving them is a deploy rehearsal rather than a tidy-up.
- **Delivered plans stay in `docs/plans/`.** ADRs, handoffs and migration docstrings cite them by
  path; citation stability beats directory purity.
- **`backend/` runtime directories keep their names** (`media/`, `data/`, `logs/`, `temp/`, `tmp/`,
  `transcripts/`, `reprocess_export/`). Renaming them means changing app config and production
  volumes.
- **Root files are tool entry points**: `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `README.md`,
  `CHANGELOG.md`, `CONTRIBUTING.md` (GitHub discovers it), `LICENSE`, `.gitignore`,
  `.gitattributes`, `.pre-commit-config.yaml`.
