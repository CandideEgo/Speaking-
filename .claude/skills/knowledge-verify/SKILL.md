---
name: knowledge-verify
description: Verify project knowledge against code reality. Check whether wiki documents and .agent/ context match the current codebase. Detect knowledge drift, mark deprecated documents, and confirm active ones. Use when context may be stale, after significant code changes, or periodically to maintain knowledge accuracy.
---

# Knowledge Verification

Verify project knowledge against code reality.

## Purpose

Prevent the agent's understanding from becoming outdated.

Code is the source of truth.

Mechanical drift is already caught for you: `scripts/check-knowledge/check_knowledge.py` runs in
pre-commit and in the CI `Knowledge` workflow, and its six failure checks — `refs`, `frontmatter`,
`ownership`, `index`, `paths`, `budget` — cover broken links, missing ADRs, invalid wiki frontmatter,
unknown or dead `related_code` modules, commit hashes in stable knowledge files, index/entry drift,
forbidden paths and size-ceiling growth.

A seventh check, `stale`, says where to start: it compares each documented module against the digest
recorded in `scripts/check-knowledge/knowledge-stamps.json` when its pages were last verified, and
names the pages whose code has moved since. Treat it as a starting point, not a verdict — code
moving under a page does not make the page wrong.

This skill exists for what no check can parse: **prose that no longer matches the code**.

## Dual Metadata: Status + Confidence

Knowledge documents carry two independent dimensions:

### Status (Knowledge Lifecycle)

| Status | Meaning | Agent behavior |
|--------|---------|---------------|
| `active` | Document describes current reality | Trust directly |
| `deprecated` | Knowledge has been superseded | Warn user, do not base decisions on this |
| `archived` | Records past decisions that are no longer current | Useful for understanding why things are the way they are, not for current decisions |

### Confidence (Knowledge Trustworthiness)

| Confidence | Meaning | Agent behavior |
|------------|---------|---------------|
| `verified` | Document checked against current code | Can rely on this for decisions |
| `assumed` | Written from partial understanding | Use with caution, verify before relying |
| `unverified` | Not yet checked against code | Do not base decisions on this without verification |

These are orthogonal. Example:
- An `archived` decision can be `verified` (it was true, just no longer active)
- An `active` document can be `assumed` (we think it's right but haven't verified)

Default for AI-written docs: `status: active`, `confidence: verified`.

## Related Code

Each document declares `related_code` in frontmatter — module IDs, not file paths:

```yaml
related_code: [video-pipeline, celery-tasks]
```

`scripts/check-knowledge/modules.json` is the canonical vocabulary, and the `frontmatter` check
enforces it: an ID that is not in that file fails, and so does a module whose globs match no real
file. That is the drift detector — the vocabulary is how deleting code becomes visible as stale
documentation. Module IDs are more stable than file paths, so they survive refactors.

`wiki/architecture/**` and `wiki/problems/**` must declare at least one module.
`wiki/guides/**` may declare none.

## When to Verify

- User requests verification
- After significant code changes to a module
- After extended absence from the project
- `.agent/state.md` `## Last Updated` is more than 14 days old — that date is the staleness signal
- Approximately every 2 weeks during active development

## How to Verify

### 1. Read knowledge documents

Run the mechanical checks first — they are cheap, deterministic and fix nothing by themselves:

```bash
python scripts/check-knowledge/check_knowledge.py
```

Then read the knowledge layer, using the ownership table in `.agent/README.md`:

- `.agent/README.md`, `.agent/invariants.md`, `.agent/system-map.md`, `.agent/context.md`, `.agent/state.md`
- `.agent/decisions-index.md`, then only the entries you need — never read `.agent/decisions.md` end to end
- `.agent/archive/` — frozen records, exempt from the checks, opened only for archaeology
- `wiki/` documents (all files with frontmatter, except `INDEX.md`)

Note their `status`, `confidence`, `related_code`, and `updated` date. The `.agent/*.md` files carry no
frontmatter; for them the freshness signal is `state.md` `## Last Updated`.

### 2. Spot-check against code

For each document, check key claims against actual code:

- Do the described functions/classes still exist?
- Do the described flows still work the same way?
- Are the described patterns still in use?
- Are the described dependencies still accurate?

Focus on documents whose `related_code` modules were recently changed, and on claims no check can
parse — a described flow, an invariant, a "this is why" sentence.

### 3. Report drift

```
Knowledge Verification Report

Active (verified):
  video-pipeline.md — all 3 pipeline stages confirmed in code
  backend-services.md — key services and patterns confirmed

Active (assumed):
  auth-flow.md — partially verified, some claims unchecked

Deprecated:
  auth-system.md
    Claim: "createAuthStore factory converges 70% duplicate logic"
    Reality: createAuthStore does not exist, stores are separate implementations
    Action: update document or archive

Archived:
  [decisions that are archived — no longer current but explain why things are the way they are]
```

### 3.5 Check for duplicated facts

`.agent/README.md` gives each kind of fact exactly one home. For each claim, check:

- Does another `.agent/` or `wiki/` document already own it?
- If yes, is this version adding anything unique?
- If no → recommend: "Replace with a cross-reference to [owning file]"

For each document (any layer), check:
- Does it only describe "what" that code already expresses?
- If yes → recommend: "Remove — fails Implicit Knowledge Filter gate 1"

### 4. Fix or flag

For each drift:

- **Fix it now** — update the document, set `status: active`, `confidence: verified`
- **Mark deprecated** — set `status: deprecated` if knowledge has been superseded
- **Mark archived** — set `status: archived` if the knowledge explains past decisions but is no longer current
- **Downgrade confidence** — set `confidence: assumed` or `unverified` if partially verified
- **Supersede a decision** — never edit the entry. Append a new entry at the **END** of
  `.agent/decisions.md`, then mark the old row `superseded by DEC-0NN` in `.agent/decisions-index.md`.
  A new decision requires both the entry and its index row.
- **Recommend deletion** — if the document fails the Implicit Knowledge Filter (only describes "what", no decision value, not hidden from code), recommend deletion rather than updating

Do not silently rewrite knowledge.

## After Verification

Update both dimensions in frontmatter:

```yaml
status: active        # lifecycle: describes current reality
status: deprecated    # lifecycle: superseded by new implementation
status: archived      # lifecycle: past decision, no longer current

confidence: verified    # trust: checked against code
confidence: assumed     # trust: partially verified
confidence: unverified  # trust: not checked
```

Update the `updated` date, and keep all eight required keys (`title`, `tags`, `status`, `confidence`,
`related_code`, `related`, `created`, `updated`). The `frontmatter` check fails on a missing key, an
unknown `related_code` module, an empty `related_code` in `wiki/architecture/` or `wiki/problems/`,
a `related` path that does not exist, or an `updated` date earlier than `created`.

## Acknowledge the reminder

```bash
python scripts/check-knowledge/check_knowledge.py --stamp-refresh --module <module>
```

Refresh only the modules you actually re-read — a stamp claims its pages still describe the code.
Without `--module` the command re-derives the whole watched set from the documents, which is the bulk
form, for when the module vocabulary itself changed.

## Implicit Knowledge Filter

When updating documents after verification, apply the same filter as knowledge-maintenance:

1. Is this information hidden from code? (If code says it, don't document it)
2. Will future changes benefit from knowing this? (If no decision impact, don't record)
3. Does it explain why, not what? (If only description, don't record)

Verification may reveal that a document should not exist at all —
if it only describes what code already says, remove it rather than updating it.
