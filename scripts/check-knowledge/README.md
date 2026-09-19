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
| `budget` | A knowledge file or tier exceeds its recorded size ceiling |

`frontmatter` also fails when a module in `modules.json` matches no file on disk **and** is
referenced somewhere. That is the drift detector: delete the code and the check tells you the
vocabulary is stale.

## modules.json

The canonical vocabulary for the `related_code` field. Every module needs at least one glob that
matches a real file. Adding a module is the only way to make a new code area referenceable from
`wiki/`; removing code without removing the module fails the check.

Use one convention — lower-case slugs, not paths. `video-service`, not `services/video_service`.

## Baselines and budgets

Two separate files, two separate flags. Do not mix them up.

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
would defend in review.

Tier ceilings cover a set of files read together, so a tier trips whenever any member grows —
`session_total` is the real cost of a coding session and should only ever fall. `slack` reserves
room for `AGENTS.md` and `CLAUDE.md`, whose GitNexus block `npx gitnexus analyze` rewrites.

## Exemptions

`.agent/archive/` is frozen history — point-in-time records are not held to today's links or schema.
Nothing else is exempt; if a check is wrong, fix the check.

## Scope note

New files are picked up even before `git add`, so a local run sees the same tree a commit would.

## Wiring

Runs as the `knowledge-check` pre-commit hook and as the CI `Knowledge` workflow. Neither ruff
config covers this directory yet, so keep it PEP 8 clean by hand.
