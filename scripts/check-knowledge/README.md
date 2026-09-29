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
| `index` | `.agent/decisions-index.md` and `.agent/decisions.md` disagree: a row's ID is out of sequence or duplicated, a row's date or title differs from its entry, or the entry set is not covered by the rows plus the `Retired N — …` line |
| `budget` | A tier exceeds its ceiling, or a file matched by a glob exceeds it. Per-file `limit`s are targets: over one prints a notice, and only `--strict` makes it fail |
| `paths` | A file that `invariants.json` declares forbidden exists, or a required one is missing |
| `layout` | A top-level entry git tracks at depth 1 is missing from `layout.json`, or an entry in it has nothing tracked there any more (a removed file, an empty directory) |
| `captures` | A capture's content changed after it was sealed, its cut markers are not `S01..Sn` in order, a segment has no row in `triage.md` or a disposition outside the closed vocabulary, an `<id>#Sxx` citation anywhere in the repo names no real segment, or `captures.json` and `inbox/` disagree about which captures exist |
| `stale` | (advisory, never fails on its own) Code under a module some `wiki/` document declares changed since that document was last verified — see below |

`frontmatter` also fails when a module in `modules.json` matches no file on disk **and** is
referenced somewhere. That is the drift detector: delete the code and the check tells you the
vocabulary is stale.

## Repository layout (the `layout` check)

Two rules, both about the repo's top level and nothing below it: every entry git tracks at depth 1
must be in `layout.json` with the layer that owns it, and every registered entry must still have
something tracked under it — otherwise the entry is stale and should go. A wrong `layer` value also
fails, so the vocabulary (`hot`, `settled`, `input`, `material`, `code`, `tooling`, `runtime`,
`entry`, `deploy`) stays closed.

Need a new top-level directory, or wondering which layer owns something? The doctrine, and what to
do when an existing layer already covers what you need, is in `wiki/guides/repository-layout.md`.

## The capture pipeline (the `captures` check)

`inbox/` holds the user's dictated ideas verbatim — one directory per capture, `raw.md` plus
`triage.md`. The format, the seven dispositions and the seal are `inbox/README.md`'s business; this
check only enforces that those contracts hold. The content must match the digest `--capture-seal`
recorded, over the body with cut markers and whitespace removed — formatting is free, content is
not. The cut markers must read `S01..Sn`, so the segments tile the body and nothing between them is
unaccounted for. Every segment needs exactly one triage row with a disposition from the closed
vocabulary, so an idea said out loud cannot be dropped without the check noticing where it went.
Every `<id>#Sxx` citation anywhere in the repo must resolve, so a plan or a handoff cannot point at
a segment that does not exist. And a seal may not outlive the directory it froze.

`--capture-seal <id>` is the only writer of `captures.json`, and it refuses to re-seal content that
changed: that refusal is the mechanism working, not an obstacle to route around.

## The one advisory check: `stale`

The eight checks above decide pass or fail, with one exception inside `budget`: a per-file target over
its limit prints and never blocks a commit (DEC-062). `stale` is the one wholly advisory check — it
only reminds, because to re-read prose you need a person, and a reminder that blocks a commit buys
silence rather than accuracy.

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

## Archiving a decision that no longer governs the code

The trigger is status, not age and not a byte count: an entry whose decision stopped applying —
`superseded` by a later entry, or never implemented — is archived (DEC-062). Entry bodies are the
only thing that grows without bound, and what retires them is the code moving on.

1. Move that era's entry bodies verbatim into `.agent/archive/decisions-YYYY-MM.md`, under a
   provenance line saying what it is and that it is frozen.
2. Leave the entry headings in `.agent/decisions.md` as stubs, one line each pointing at that
   archive file. The `index` check matches headings, so the index keeps agreeing and no ID is
   issued, reassigned or reordered.
3. Drop the retired entries' rows from `.agent/decisions-index.md` and name their IDs on its
   `Retired N — DEC-xxx, … — …` line. The `index` check reconciles rows plus that line against the
   headings, so a row dropped without naming the ID fails, and so does naming an entry that is
   still active.
4. Re-run the check: `refs` follows the new link, `index` re-checks the headings and the
   reconciliation.

Step 3 does **not** lower the file's `limit`. A ceiling that follows the file down is a ratchet, and
the ceiling that actually prices the layer is the tier, not the file (DEC-062) — lowering a per-file
target after every round is how the numbers in `knowledge-budget.json` came down 44032 → 24576 B in
six days while the tiers were still half empty.

Archived bodies are frozen — `.agent/archive/` is exempt from every check, and markdown links
inside them were written for their pre-move location in `.agent/`.

## What is enforced (DEC-062)

The split, in one place:

- **Fails a commit**: the three `tiers` (a session's real cost is `tier:session_total`), the two
  `globs` (`wiki/**/*.md` 8 KB — this page should split; `docs/adr/*.md` 24 KB — this page has run
  away), dead links, `index` drift, and `invariants.json` paths.
- **Prints only**: a per-file `limit` and the `_targets` block. Over a target the check prints
  `[target] … not a failure` and exits 0; `--strict` turns those notices into failures for whoever
  wants the gate.
- **Size never blocks a commit except through a tier.** Per-file bytes are a proxy for what a
  session loads; a wall at the moment of writing buys shorter sentences, not fewer facts, and no
  check can see either loss.
- **Archiving is driven by status, not age**: an entry is archived when its decision stopped
  governing the code, never because a number was reached.
- **The index lists what still governs the code**: a retired entry loses its row and is named on
  the `Retired N — …` line, so the table converges on the constraints that are still live.

The reasoning, the alternatives and the cost of this choice are in `.agent/decisions.md` DEC-062
(revision of DEC-054/055).

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

### The write standard: line pricing, three classes (S2 / DEC-062)

Bytes price the layer; the reader is what that price protects. So the unit is the line — every line
added to a hot file must be one of three things:

| The line is… | Test |
|---|---|
| **a constraint** | remove it and the next agent does something wrong |
| **a pointer** | it says where the truth lives; the expansion stays cold |
| **a live decision** | it still governs the code; if it no longer does, it retires |

Shape, aimed at rather than imposed: one assertion per line, lines under ~160 characters, paragraphs
under four lines, no code blocks in the hot layer (cite a path or a decision ID instead). Pressure
then points the right way — adding a fact is always affordable, saying it vaguely is not.
`check_knowledge.py` cannot read any of this yet: it is the rule at write time, and
`/knowledge-verify` is where it gets audited.

### How much headroom, and what happens at the ceiling

What a session pays is the tier, so the tier is the gate; a per-file `limit` is a target (DEC-062).
The traffic lights below still read a file against its target — that is the prompt to trim, not a
verdict — while `tier:session_total` and the two globs can fail the run.

- **Evergreen files** (everything in `tier:session_total`, plus `.agent/README.md`): target =
  size + ~10%, one ordinary maintain round of growth. These files are edited, not appended — over
  the target, shrink or move; do not refresh.
- **Append-only files** (`decisions.md`, `decisions-index.md`): target = size + 2–3 entries; over
  it, run the archive round above. The index shrinks by retirement, not by raising anything — a row
  leaves when its decision stops governing the code, and its ID moves to the `Retired` line.
- **`wiki/**` pages**: 8 KB per page, enforced; a full page splits, it does not grow.
- **The tiers**: `session_start` (what every session loads) and `session_total` (the whole hot
  layer) are the numbers that must not rise casually; both are gates.

Traffic lights (see them with `--budget-report`, whose `GATE` / `target` column says which rows can
fail):

| Zone | Usage | Action |
|---|---|---|
| green | < 85% | write normally |
| yellow | 85–95% | audit density before each write; trim the file during maintain |
| red | > 95% | the ladder below, in order |

Red-zone ladder, in order: ① shrink or move — stable content goes to a colder layer (state →
`docs/progress/` or CHANGELOG, long wiki page → two pages, decision bodies → archive); ② the
archive round, for entries whose decision no longer governs the code; ③ for a tier, raise it only
when a new subject area genuinely entered the hot layer, with the reason in the commit message.
Phrasing-level growth never earns a raise, and `--budget-refresh` is not a routine step.

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

1. **Observe** — `--budget-report` names the red files and which rows are gates; `stale` notices
   name the drift.
2. **Fix** — red files through the ladder; stale docs verified or corrected (quality bar above).
3. **Record the ratio** — what retired and what was added: entries moved to `archive/` and their
   IDs named on the index's `Retired` line, against the decisions taken this round. A shrinking
   ceiling is no longer the loop's visible output (DEC-062) — retiring entries and recording new
   ones is, and it is what makes the layer converge instead of merely stopping growth.
4. **Target** — the `_targets` block in `knowledge-budget.json` holds the non-enforced goal sizes;
   the trend to watch is red-zone count → 0 and `tier:session_total` → its target (32768 B).

## modules.json

The canonical vocabulary for the `related_code` field. Every module needs at least one glob that
matches a real file. Adding a module is the only way to make a new code area referenceable from
`wiki/`; removing code without removing the module fails the check.

Use one convention — lower-case slugs, not paths. `video-service`, not `services/video_service`.

## Baselines, budgets, stamps

Three separate files, three separate flags. Do not mix them up: `knowledge-baseline.json` (accepted
violations) with `--baseline-update`, `knowledge-budget.json` (tier ceilings and per-file targets) with
`--budget-refresh`, and `knowledge-stamps.json` (what was verified when) with `--stamp-refresh`.

`knowledge-baseline.json` records violations that already exist and are scheduled to be paid off.
Anything not in it fails. The mypy baseline gate in `ci.yml` works the same way.

```bash
python scripts/check-knowledge/check_knowledge.py --baseline-update   # accept current violations
```

`knowledge-budget.json` holds the size model. A tier is a gate; a per-file `limit` is a target —
treat an overage as a signal to shrink or move the file, not as a broken build (DEC-062).

```bash
python scripts/check-knowledge/check_knowledge.py --budget-report     # who is over what, worst first
python scripts/check-knowledge/check_knowledge.py --budget-refresh    # raise the tier limits to now
```

`--budget-refresh` raises **tier limits only**, to the tiers' current measured size. It no longer
touches per-file `limit`s: a target that tracks the file's current size is not a target, and
rewriting them after every round was the ratchet that took `decisions.md` down 44032 → 24576 B in
six days. The two glob limits are hand-set policy and stay put as well. Run it only when the growth
in the hot layer was a decision you would defend in review; `slack` is left alone, because the
ceiling is `limit + slack` and folding slack in would grant it twice.

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
`inbox/*/raw.md` is exempt from `refs` alone, with every other check still applying it: it holds the
user's own words, which the repo is not allowed to edit, so a broken link inside a capture would be
a failure nobody may fix. Nothing else is exempt; if a check is wrong, fix the check.

## Scope note

New files are picked up even before `git add`, so a local run sees the same tree a commit would.

## Wiring

`knowledge-check` runs all of it in pre-commit; `knowledge-stale` runs the reminder alone with
`verbose: true`, because pre-commit hides the output of a hook that passes and a reminder nobody
sees is not a reminder. The CI `Knowledge` workflow runs the same command as the first hook, so the
notices reach its log without failing the job.

Neither ruff config covers this directory yet, so keep it PEP 8 clean by hand.
