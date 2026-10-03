---
title: Repository Layout
tags: [workflow, conventions, knowledge-layer]
status: active
confidence: verified
related_code: []
related: [knowledge/wiki/guides/setup.md, knowledge/wiki/guides/release-checklist.md]
created: 2026-09-29
updated: 2026-10-03
---

# Where a file belongs

One directory, one kind of thing. Which directory holds what follows from the knowledge layer's own
rules, not from taste:

1. **Reading frequency sets the price.** What every session must read is hot (`.agent/`, `AGENTS.md`,
   `CONTEXT.md`); everything that records the past is cold (`knowledge/`), read on demand through
   `knowledge/INDEX.md`; what nobody reads in order to decide anything is material, not knowledge.
   Object cognition — one file or table's job, relations, contracts and constraints — is machine
   written and read through the AOCI tools, in its own layer (`aoci.*`, `.aoci/`).
2. **A fact has one home.** If a fact already lives somewhere, link to it instead of writing it into
   a second directory. `.agent/README.md` owns the fact → file table; this page owns the
   file → directory one. `.agent/README.md`'s seam test decides which layer a fact belongs to:
   **can it be written as a property of exactly one managed object?** Yes → the cognition layer.

## Three layers, one table

The knowledge layer is three layers (DEC-072, extending DEC-066). **Cognition** is the machine-authored
object layer — the AOCI volumes and their state — whose objects answer "what is this file or table, how
does it relate, what must I not break"; the session reads it through the AOCI tools, and the model
authors its semantics while the tool writes them. **Hot** is read every session and must be true *now*:
rules, the session contract, current state. **Cold** is everything that records the past, read on demand
and entered through `knowledge/INDEX.md`. `.agent/README.md` is the standard for all three, including
the three admission tests a hot fact must pass and the seam test that routes a fact between cognition and
prose. This page decides only *where* an entry lives.

`scripts/check-knowledge/layout.json` is the machine-checked version of the table below — same keys,
same layers — and the `layout` check fails when the two disagree in either direction, so they are
edited together.

| Entry | Layer | Holds | Add here when… |
|---|---|---|---|
| `.agent/` | hot | the facts every session loads: `README.md` (the layering standard), `state`, `invariants`, `owners` | the fact changes what the next session does before it knows the task |
| `.claude/` | tooling | project-level agent config and skills (`intake`, `knowledge-maintain`, `knowledge-verify`, `speaking-dev`, …) | a skill or a tool reads it at this fixed path |
| `.github/` | tooling | CI/CD workflows and dependabot | GitHub reads it at this fixed path |
| `backend/` | code | the FastAPI application (`app/`, `migrations/`, `tests/`, `scripts/`) | it is code, or a config the code reads |
| `docs/` | tooling | only the skills' fixed-path config (`agents/`) and material (`design/`) — see below | a tool looks for it at a fixed path, or it is something to look at |
| `frontend/` | code | the Next.js application | it is code, or a config the code reads |
| `knowledge/` | settled | the cold store: everything that records the past — `wiki/`, `adr/`, `plans/`, `progress/`, `requirements/`, `operations/`, `archive/`, `inbox/`, `decisions.md` + index, `system-map.md`, `CHANGELOG.md` | the value is "what happened" or "why it is this way" — read on demand, never needed to start a session |
| `logs/` | runtime | local run output; only `.gitkeep` and the audit raw output are tracked | never — it is the one directory that must stay untracked |
| `scripts/` | tooling | `check-knowledge/`, `release.sh` | a reusable project-level script (backend one-offs go to `backend/scripts/`) |
| `AGENTS.md` | entry | the routing table and the MUST / SHOULD / NEVER rules | every session starts here |
| `CLAUDE.md` | entry | a short redirect to `AGENTS.md` | the tool requires it at the root |
| `CONTEXT.md` | entry | the domain glossary — the glossary itself, not a pointer | the task needs domain language |
| `README.md` | entry | what the project is, and the directory structure | a human or GitHub lands here first |
| `CONTRIBUTING.md` | entry | contribution and commit process | GitHub discovers it at this path |
| `LICENSE` | entry | the private licence | it must sit at the root |
| `.gitignore` | tooling | ignore rules | git reads it at the root |
| `.gitattributes` | tooling | line endings and binary attributes | git reads it at the root |
| `.pre-commit-config.yaml` | tooling | the local commit gates | pre-commit reads it at the root |
| `docker-compose.yml` | deploy | the base compose file | production runs it at this path |
| `docker-compose.dev.yml` | deploy | local infrastructure (DB + Redis) | production runs it at this path |
| `docker-compose.prod.yml` | deploy | the production stack (nginx / gunicorn / celery / loki) | production runs it at this path |
| `deploy.sh` | deploy | the single-host deploy script | production runs it at this path |
| `deploy-oneclick.sh` | deploy | the one-click deploy script | production runs it at this path |
| `nginx.conf` | deploy | the dev / default nginx site | production runs it at this path |
| `nginx.ssl.conf` | deploy | production nginx (TLS, security headers, log redaction) | production runs it at this path |
| `promtail.yml` | deploy | log collection | production runs it at this path |
| `aoci.txt` | cognition | the AOCI cognition root manifest: the meta/code volumes and their ids, paths and dependencies | the AOCI tool reads it at the repository root |
| `aoci.meta.txt` | cognition | the AOCI meta volume: object protocol, FRAS discipline, S admission and the tag dictionaries | it defines how every entry in `aoci.code.txt` is written |
| `aoci.code.txt` | cognition | the AOCI object volume: one FRAS entry per managed object | a managed object is added, removed or re-scoped |
| `.aoci/` | cognition | the cognition layer's machine state: managed scope and budgets, overview delivery, and the source-byte baseline | the tool writes it; only the governance subset is tracked (`.aoci/.gitignore` whitelists `config.json` and `baseline.json`, because the baseline is what makes drift detection reproducible on a fresh clone) |

Every `Layer` value comes from the closed vocabulary the `layout` check enforces: `cognition`, `hot`,
`settled`, `input`, `material`, `code`, `tooling`, `runtime`, `entry`, `deploy`. `input` and `material`
are valid but unused at the top level today — `knowledge/inbox/` and `docs/design/` sit *inside* `settled`
and `tooling`. Twenty of the entries are files: six `entry`, three `tooling` config, eight `deploy`,
three `cognition` volumes.

## What `docs/` holds now

`docs/` used to be the settled layer for this repository's own knowledge — ADRs, plans, progress
records, requirements, operations. All of it now lives under `knowledge/`. What is left is exactly the
two kinds of file that cannot move:

- `docs/agents/` — configuration the installed skills read at a fixed path: `issue-tracker.md`,
  `triage-labels.md`, `domain.md`. A skill looks for it there and nowhere else, so the path is part of
  the contract.
- `docs/design/` — material, meaning artefacts to look at rather than read to decide (see "Material is
  not knowledge").

Nothing settled goes into `docs/` any more: a new engineering document belongs under `knowledge/`, with
a line in its index.

## `knowledge/INDEX.md` is the contract

The cold store is entered through one file. `knowledge/INDEX.md` lists every markdown file under
`knowledge/` exactly once — the `archive/` tree excepted, because frozen history is an archaeology site
rather than an index entry — and every listed path has a real file behind it. The `index` check
enforces the listing side: a file with no row fails, and so does a file with two. `refs` enforces the
other, because each row is an ordinary markdown link. A document added to `knowledge/` without a row, or
a row whose file has moved away, is therefore the run going red rather than something to notice later.

## Adding a directory

A new top-level entry needs three things: a reason it cannot live under an existing one, a row in
`scripts/check-knowledge/layout.json` naming the layer that owns it, and — when it is a new *kind*
of thing rather than a new instance of one — a decision entry. The `layout` check fails on a tracked
top-level entry with no row, on a row with nothing tracked at it, on a layer outside the vocabulary
above, and on a row with no `purpose`, so this table cannot rot silently. The row goes in both places:
this page and `layout.json` are the same table, one written for a reader and one for the machine.

## Why `knowledge/inbox/` is not ours to edit

The cold store is *settled*: written by us, edited, and held to today's links and schema. A capture
under `knowledge/inbox/` is the opposite on all three counts — dictated, never to be edited, and frozen
by a content digest. That is why it has its own format (`knowledge/inbox/README.md`), its own `captures`
check (DEC-064) and the layer's one exemption: `raw.md` is the only file `refs` skips, because a rule
nobody is allowed to fix is worse than no rule at all.

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
- **Delivered plans stay in `knowledge/plans/`.** ADRs, archived tickets and migration docstrings cite
  them by path; citation stability beats directory purity.
- **`backend/` runtime directories keep their names** (`media/`, `data/`, `logs/`, `temp/`, `tmp/`,
  `transcripts/`, `reprocess_export/`). Renaming them means changing app config and production
  volumes.
- **Root files are tool entry points** — 17 in all: the six `entry` files (`AGENTS.md`, `CLAUDE.md`,
  `CONTEXT.md`, `README.md`, `CONTRIBUTING.md`, `LICENSE`), the three config dotfiles (`.gitignore`,
  `.gitattributes`, `.pre-commit-config.yaml`) and the eight `deploy` files. `knowledge/CHANGELOG.md`
  is not one of them: it is the log of what shipped, so it belongs in the cold store.
