# check-knowledge

Deterministic integrity checks for the repository knowledge layer — the hot layer (`AGENTS.md`,
`CONTEXT.md`, `.agent/`) and the cold store (`knowledge/`, entered through `knowledge/INDEX.md`).
No LLM, no network, standard library only.

The point is to stop the knowledge layer from drifting silently. Prose rules like "keep the docs in
sync" decay; a check that fails a build does not.

## Running

```bash
python scripts/check-knowledge/check_knowledge.py            # all checks
python scripts/check-knowledge/check_knowledge.py refs       # one check
python scripts/check-knowledge/check_knowledge.py --size-report   # bytes, reported not judged
```

Exit code 0 = clean, 1 = a violation not recorded in `knowledge-baseline.json`.

## The checks

| Check | Fails when |
|---|---|
| `refs` | A markdown link points at a missing file, or an `ADR-00xx` reference has no file in `knowledge/adr/`. Links inside fenced or inline code are ignored, and targets that cannot be paths (regex fragments, prose) are skipped |
| `frontmatter` | A `knowledge/wiki/**` document lacks valid frontmatter schema, names a module that is not in `modules.json`, points `related` at a missing path, or leaves `related_code` empty in `architecture/` and `problems/` |
| `ownership` | A commit hash appears outside the locations allowed to narrate history (`knowledge/decisions.md`, `knowledge/decisions-index.md`, `knowledge/archive/`, `docs/`, `knowledge/CHANGELOG.md`) |
| `index` | `knowledge/decisions-index.md` and `knowledge/decisions.md` disagree: a row's ID is out of sequence or duplicated, a row's date or title differs from its entry, or the entry set is not covered by the rows plus the `Retired N — …` line |
| `paths` | A file that `invariants.json` declares forbidden exists, a required one is missing, or a knowledge path that `paths.json` marks `required` is not on disk |
| `layout` | A top-level entry git tracks at depth 1 is missing from `layout.json`, or an entry in it has nothing tracked there any more (a removed file, an empty directory) |
| `captures` | A capture's content changed after it was sealed, its cut markers are not `S01..Sn` in order, a segment has no row in `triage.md` or a disposition outside the closed vocabulary, an `<id>#Sxx` citation anywhere in the repo names no real segment, or `captures.json` and `knowledge/inbox/` disagree about which captures exist |
| `stale` | (advisory, never fails on its own) Code under a module some `knowledge/wiki/` document declares changed since that document was last verified — see below |

`frontmatter` also fails when a module in `modules.json` matches no file on disk **and** is
referenced somewhere. That is the drift detector: delete the code and the check tells you the
vocabulary is stale.

## Where the paths live (paths.json)

The checker holds no knowledge path as a string literal. Which files `frontmatter` and `ownership`
scan, where `refs` looks for ADRs, which directory the `captures` check reads, which decisions and
handoff files the `index` and `handoff` checks open, which files the `stale` digest skips — all of
it comes from `scripts/check-knowledge/paths.json`. Two rules make the indirection worth it:

- **One key names one location, and one location is written down once.** A list section names
  `paths` keys, never paths, so moving `knowledge/wiki/` to `knowledge/knowledge/wiki/` is a single value edit and no
  path can be updated in one place and forgotten in another. A gate builds its `startswith()`
  prefix from the entry's declared `kind`, so a directory is spelled the same way for the
  existence check and for the prefix match that scans it.
- **An entry marked `"required": true` must exist on disk.** If it does not, the `paths` check
  fails, naming the config key and the path.

The second rule is what the first is for. A gate reads a prefix, so a rename nobody recorded here
would leave `frontmatter`, `ownership` or `captures` scanning an empty set and printing `[ok]` on
it — green CI verifying nothing. **Renaming a knowledge directory without updating `paths.json`
must fail the run, never pass quietly.**

`"required": false` is used only where absence is legitimate: `CLAUDE.md` (a tool-specific redirect
the repo may drop) and `knowledge/archive/handoffs/` (git does not track an empty directory, and an
unresolvable blocker fails the `handoff` check in its own right).

The same file feeds `--size-report`: the hot files it lists are read every session, the cold
directories it totals are read on demand. Neither list gates anything, so both are free to edit.

## Repository layout (the `layout` check)

Two rules, both about the repo's top level and nothing below it: every entry git tracks at depth 1
must be in `layout.json` with the layer that owns it, and every registered entry must still have
something tracked under it — otherwise the entry is stale and should go. A wrong `layer` value also
fails, so the vocabulary (`hot`, `settled`, `input`, `material`, `code`, `tooling`, `runtime`,
`entry`, `deploy`) stays closed.

Need a new top-level directory, or wondering which layer owns something? The doctrine, and what to
do when an existing layer already covers what you need, is in `knowledge/wiki/guides/repository-layout.md`.

## The capture pipeline (the `captures` check)

`knowledge/inbox/` holds the user's dictated ideas verbatim — one directory per capture, `raw.md` plus
`triage.md`. The format, the seven dispositions and the seal are `knowledge/inbox/README.md`'s business; this
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

The eight checks above decide pass or fail, and `stale` is the ninth: the one wholly advisory part of
the run. It only reminds, because to re-read prose you need a person, and a reminder that blocks a
commit buys silence rather than accuracy.

`knowledge-stamps.json` records, per module, the date its documents were last verified and a
sha256 over the module's code. Change the code and the digest stops matching:

```
  [watch] exam-levels: code changed since its documents were verified on 2026-09-20
          knowledge/wiki/architecture/exam-vocabulary.md
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

1. Move that era's entry bodies verbatim into `knowledge/archive/decisions-YYYY-MM.md`, under a
   provenance line saying what it is and that it is frozen.
2. Leave the entry headings in `knowledge/decisions.md` as stubs, one line each pointing at that
   archive file. The `index` check matches headings, so the index keeps agreeing and no ID is
   issued, reassigned or reordered.
3. Drop the retired entries' rows from `knowledge/decisions-index.md` and name their IDs on its
   `Retired N — DEC-xxx, … — …` line. The `index` check reconciles rows plus that line against the
   headings, so a row dropped without naming the ID fails, and so does naming an entry that is
   still active.
4. Re-run the check: `refs` follows the new link, `index` re-checks the headings and the
   reconciliation.

There is no ceiling to lower afterwards. The rule that matters is the one at the head of
`knowledge/decisions.md`: **the file is append-only — never edit or reorder an existing entry.**
Archiving is a move, not an edit. An entry whose decision stopped governing the code (superseded
by a later entry, or never implemented) keeps its heading in place as a one-line stub so its ID is
never reissued or reordered, and its body moves verbatim into the archive. Retirement is driven by
*status* — the decision no longer governing today's code — never by a byte count, because there is
none (DEC-062).

Archived bodies are frozen — `knowledge/archive/` is exempt from every check, and markdown links
inside them were written for their pre-move location in `.agent/`.

## What is enforced (DEC-062, DEC-067)

The split, in one place:

- **Fails a commit**: dead links and `ADR-00xx` references, `index` drift in both of its contracts, a
  knowledge path that moved without `paths.json` being updated, the `invariants.json` paths, a ticket
  whose shape, claims or blockers are broken, and a capture whose words changed after sealing.
- **Prints only**: `--size-report` and the `stale` reminders. `--strict` turns the reminders into
  failures for whoever wants the gate instead.
- **No byte number decides what may be written** (DEC-067). Nothing in the checker measures a file
  against a number: the size report exists to make a doubling visible, not to refuse a fact. A wall at
  the moment of writing buys shorter sentences, not fewer facts, and no check can see either loss.
- **Archiving is driven by status, not age and not size**: an entry is archived when its decision
  stopped governing the code, never because a number was reached.
- **The index lists what still governs the code**: a retired entry loses its row and is named on
  the `Retired N — …` line, so the table converges on the constraints that are still live.

The write standard lives in `.agent/README.md`: the hot layer's three admission tests, the cold
store's index contract, one fact per home, and "a fact that stops being current moves; nothing is
deleted". The reasoning behind deleting the byte machinery is `knowledge/decisions.md` DEC-067,
which supersedes DEC-062's per-file notices.

## modules.json

The canonical vocabulary for the `related_code` field. Every module needs at least one glob that
matches a real file. Adding a module is the only way to make a new code area referenceable from
`knowledge/wiki/`; removing code without removing the module fails the check.

Use one convention — lower-case slugs, not paths. `video-service`, not `services/video_service`.

## Baselines and stamps

Two separate files, two separate flags: `knowledge-baseline.json` (accepted violations) with
`--baseline-update`, and `knowledge-stamps.json` (what was verified when) with `--stamp-refresh`.

`knowledge-baseline.json` records violations that already exist and are scheduled to be paid off.
Anything not in it fails. The mypy baseline gate in `ci.yml` works the same way.

```bash
python scripts/check-knowledge/check_knowledge.py --baseline-update   # accept current violations
```

Sizes are not part of either file: `--size-report` reports and keeps no record.

```bash
python scripts/check-knowledge/check_knowledge.py --size-report    # hot files, then cold directories
```

It prints the bytes of each file a session loads before it knows the task, then a total and a file
count per knowledge directory, and exits 0 whatever it finds. Both lists live in `paths.json`.

## Exemptions

`knowledge/archive/` is frozen history — point-in-time records are not held to today's links or schema.
`knowledge/inbox/*/raw.md` is exempt from `refs` alone, with every other check still applying it: it holds the
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
