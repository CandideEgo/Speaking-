# check-knowledge

Deterministic integrity checks for the repository knowledge layer (`.agent/`, `wiki/`,
`docs/adr/`, `AGENTS.md`). No LLM, no network, standard library only.

The point is to stop the knowledge layer from drifting silently. Prose rules like "keep the docs in
sync" decay; a check that fails a build does not.

## Running

```bash
python scripts/check-knowledge/check_knowledge.py            # all checks
python scripts/check-knowledge/check_knowledge.py refs       # one check
```

Exit code 0 = clean, 1 = a violation not recorded in `knowledge-baseline.json`.

## The checks

| Check | Fails when |
|---|---|
| `refs` | A markdown link points at a missing file, or an `ADR-00xx` reference has no file in `docs/adr/`. Links inside fenced or inline code are ignored, and targets that cannot be paths (regex fragments, prose) are skipped |
| `frontmatter` | A `wiki/**` document lacks valid frontmatter schema, names a module that is not in `modules.json`, points `related` at a missing path, or leaves `related_code` empty in `architecture/` and `problems/` |
| `ownership` | A commit hash appears outside the locations allowed to narrate history (`.agent/decisions.md`, `.agent/decisions-index.md`, `.agent/archive/`, `docs/`, `CHANGELOG.md`) |
| `index` | `.agent/decisions-index.md` and `.agent/decisions.md` disagree on entry count, order, date or title, or an ID is out of sequence |
| `budget` | A knowledge file or tier exceeds its recorded size ceiling (`limit` + `slack`) |
| `paths` | A file that `invariants.json` declares forbidden exists, or a required one is missing |
| `stale` | (advisory, never fails on its own) Code under a module some `wiki/` document declares changed since that document was last verified — see below |

`frontmatter` also fails when a module in `modules.json` matches no file on disk **and** is
referenced somewhere. That is the drift detector: delete the code and the check tells you the
vocabulary is stale.

## The one advisory check: `stale`

The six checks above decide pass or fail. `stale` only reminds, because to re-read prose you need
a person, and a reminder that blocks a commit buys silence rather than accuracy.

`knowledge-stamps.json` records, per module, the date its documents were last verified and a
sha256 over the module's code. Change the code and the digest stops matching:

```
  [watch] exam-levels: code changed since its documents were verified on 2026-09-20
          wiki/architecture/exam-vocabulary.md
          run /knowledge-verify, then: ... --stamp-refresh --module exam-levels
```

Two things do fail, because a reminder with a hole in it is worse than no reminder: a stamp
naming a module that is not in `modules.json`, and a module some document declares that no stamp
covers. Adding a document that references a new module therefore costs one command:

```bash
python scripts/check-knowledge/check_knowledge.py --stamp-refresh --module <name>
```

`--stamp-refresh` without `--module` re-derives the whole watched set from the documents, so it
also prunes stamps for modules no document references any more. Refreshing claims the documents
still describe the code — it is not a way to clear a reminder you did not read.

`--strict` turns the notices into failures, for whoever wants the gate instead of the reminder.
Digests cover tracked files plus untracked-but-unignored ones, with CRLF normalised, so a local
run and CI agree; the checker's own state files are excluded so a stamp cannot invalidate itself.

## Archiving a file that hit its ceiling

A ceiling is meant to be hit. When `.agent/decisions.md` reaches its limit the reflex is
`--budget-refresh`, which is how debt becomes permanent: the file keeps growing and the next
reader pays. The alternative, used for the first time on 2026-09-20:

1. Move the **oldest era's** entry bodies verbatim into `.agent/archive/decisions-YYYY-MM.md`,
   under a provenance line saying what it is and that it is frozen.
2. Leave the entry headings in `.agent/decisions.md` as stubs, one line each pointing at that
   archive file. The `index` check matches headings, so the index keeps agreeing and no ID is
   issued, reassigned or reordered.
3. Lower the file's `limit` in `knowledge-budget.json` to the new size plus deliberate headroom,
   and record why in `_history` — otherwise the next reader sees a number and no reason.
4. Re-run the check: `refs` follows the new link, `index` re-checks the headings.

Archived bodies are frozen — `.agent/archive/` is exempt from every check, and markdown links
inside them were written for their pre-move location in `.agent/`.

## Write density and the growth ladder (DEC-054)

The layer pays rent every session — `tier:session_total` loads into context before any task is
known — so what may be written, and at what detail, is policy, not taste.

### The two strata: must-read vs settled (DEC-055)

Every fact lives in one of two strata, and the stratum prices it:

| Stratum | Files | Loaded | Cost |
|---|---|---|---|
| **Must-read (热层)** | the five `tier:session_total` files: `AGENTS.md`, `CLAUDE.md`, `state.md`, `invariants.md`, `system-map.md` | every session, before the task is known | per byte, every session |
| **Settled (冷层)** | `wiki/`, `docs/adr/`, `docs/progress/`, `decisions.md` bodies, `archive/`, CHANGELOG | on demand, for the one task that needs it | only when actually read |

**详略由读取频率决定** — the same fact earns different detail per stratum: the hot file keeps the
compressed form (one line + a pointer); the expansion (full reasoning, code-level detail) goes to
the settled file. A hot-file fact needing more than a couple of lines is the signal to write the
expansion in `wiki/` and leave the pointer — never to grow the hot file. The pricing explains the
ceiling spread: `state.md` pays for ~5 KB every session, an ADR is loaded never and consulted
deliberately, so 24 KB is fine there.

Everything below (density rules, headroom, ladder) applies with that asymmetry built in: hot
files get the strictest budgets and the tersest prose, settled files may run long but must still
earn their length with "why", not "what".

### What gets recorded, per file

| File | Only records | Shape |
|---|---|---|
| `.agent/state.md` | in-flight work, next steps, live breakage | 1–2 lines; finished items leave (history is CHANGELOG's) |
| `.agent/decisions.md` | problem → options → decision → reason | ≤ ~1.5 KB; longer reasoning becomes a `docs/adr/` file |
| `invariants.md` / `system-map.md` / `context.md` | rules / connections / vocabulary | one line or entry each; details belong in `wiki/` |
| `wiki/architecture/` | what the code cannot say: why, boundaries, traps | one page per subsystem, ≤ 8 KB (glob) |
| `wiki/problems/` | *recurring* failure modes (symptom → cause → fix → prevention) | one-off bugs live in commit messages |

Never written anywhere in the layer: pasted code, process narrative, a fact another file already
owns (link, don't copy). The write-time gate stays the three questions in `AGENTS.md`.

**Detail level = minimum complete information**: where it lives (`related_code`, path), why it is
that way, and when it starts to be suspect (`updated`, `confidence`). Self-test before writing:
if a future reader lacked this sentence, what decision would they get wrong? None — don't write it.

### How much headroom, and what happens at the ceiling

- **Evergreen files** (everything in `tier:session_total`, plus `.agent/README.md`): ceiling =
  size + ~10%, one ordinary maintain round of growth. These files are edited, not appended — at
  the ceiling, shrink or move; do not refresh.
- **Append-only files** (`decisions.md`, `decisions-index.md`): ceiling = size + 2–3 entries; at
  the ceiling run the archive round above. `--budget-refresh` is not for them. The index is the
  one file with no archive valve — its ceiling may be raised deliberately (it has been, twice).
- **`wiki/**` pages**: 8 KB per page; a full page splits, it does not grow.

Traffic lights (see them with `--budget-report`):

| Zone | Usage | Action |
|---|---|---|
| green | < 85% | write normally |
| yellow | 85–95% | audit density before each write; trim the file during maintain |
| red | > 95% | the ladder below, in order |

Red-zone ladder, in order: ① shrink or move — stable content goes to a colder layer (state →
`docs/progress/` or CHANGELOG, long wiki page → two pages, decision bodies → archive); ② the
archive round; ③ `--budget-refresh`, only when the growth is a new subject area or other
structural content, with the reason in the commit message. Phrasing-level growth never earns a
refresh.

**Nothing is ever deleted** — shrinking is moving. Decision bodies freeze in `.agent/archive/`,
finished state items are already mirrored by CHANGELOG, dead wiki pages get `status: deprecated`
instead of `rm`. The defence against information loss is colder layers, not larger ceilings.

**Quality does not drop when size does.** A shrink is a verify-grade edit, not a mechanical cut:
every fact that leaves a hot file must land in a colder one first, caveats and traps travel with
their fact, and what remains must still say why, not just what. Cutting is not the goal;
correct-sized true things are.

### The loop (DEC-055)

The layer is meant to get measurably better every round, not merely to stop growing. Each
`/knowledge-maintain` (after cross-module changes) and `/knowledge-verify` (14-day cadence) runs:

1. **Observe** — `--budget-report` names the red files; `stale` notices name the drift.
2. **Fix** — red files through the ladder; stale docs verified or corrected (quality bar above).
3. **Ratchet** — after any successful shrink, lower that file's `limit` by hand and record why in
   `_history`. Lowered limits are the loop's visible output: a ceiling that only ever rises means
   the loop is not running.
4. **Target** — the `_targets` block in `knowledge-budget.json` holds the non-enforced goal sizes;
   the trend to watch is red-zone count → 0 and `tier:session_total` → its target (32768 B).

## modules.json

The canonical vocabulary for the `related_code` field. Every module needs at least one glob that
matches a real file. Adding a module is the only way to make a new code area referenceable from
`wiki/`; removing code without removing the module fails the check.

Use one convention — lower-case slugs, not paths. `video-service`, not `services/video_service`.

## Baselines, budgets, stamps

Three separate files, three separate flags. Do not mix them up: `knowledge-baseline.json` (accepted
violations) with `--baseline-update`, `knowledge-budget.json` (size ceilings) with
`--budget-refresh`, and `knowledge-stamps.json` (what was verified when) with `--stamp-refresh`.

`knowledge-baseline.json` records violations that already exist and are scheduled to be paid off.
Anything not in it fails. The mypy baseline gate in `ci.yml` works the same way.

```bash
python scripts/check-knowledge/check_knowledge.py --baseline-update   # accept current violations
```

`knowledge-budget.json` holds size ceilings. A ceiling is a limit, not a target: lower it by hand
whenever you can, and treat a violation as a signal to shrink the file.

```bash
python scripts/check-knowledge/check_knowledge.py --budget-refresh    # raise every ceiling to now
```

`--budget-refresh` is how debt becomes permanent. Run it only when the growth was a decision you
would defend in review. It writes each file's *measured* size into `limit` and leaves `slack` alone,
so a refreshed file keeps its slack instead of absorbing it twice.

Tier ceilings cover a set of files read together, so a tier trips whenever any member grows —
`session_total` is the real cost of a coding session and should only ever fall. A tier's ceiling is
its own `limit` plus the slack of its members, so `--budget-refresh` leaves a tier with exactly the
headroom its files have, never zero.

`slack` is headroom for content the repo does not author by hand: machine-rewritten blocks
(entry-point injections in `AGENTS.md` / `CLAUDE.md`). Without it, a machine rewrite trips the
budget for a change no one made by hand. It is per-file only — a tier cannot be granted slack
its members do not have, or the tier would pass while every file in it was over.

## Exemptions

`.agent/archive/` is frozen history — point-in-time records are not held to today's links or schema.
Nothing else is exempt; if a check is wrong, fix the check.

## Scope note

New files are picked up even before `git add`, so a local run sees the same tree a commit would.

## Wiring

`knowledge-check` runs all of it in pre-commit; `knowledge-stale` runs the reminder alone with
`verbose: true`, because pre-commit hides the output of a hook that passes and a reminder nobody
sees is not a reminder. The CI `Knowledge` workflow runs the same command as the first hook, so the
notices reach its log without failing the job.

Neither ruff config covers this directory yet, so keep it PEP 8 clean by hand.
