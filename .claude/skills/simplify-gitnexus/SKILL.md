---
name: simplify-gitnexus
description: "Code review that combines /simplify's 4-dimension cleanup (reuse, simplification, efficiency, altitude) with GitNexus impact analysis and execution-flow understanding. Use this skill whenever the user asks for a code review, wants to review changes, review a diff, review a PR, or says anything about cleaning up or simplifying their code — even if they don't explicitly mention 'review'. Also use when the user runs /simplify and the project has GitNexus indexed."
---

# Simplify + GitNexus Code Review

A four-phase code review that layers GitNexus risk assessment on top of `/simplify`'s cleanup review, producing safer and more informed fixes.

## Why this combination works

`/simplify` is excellent at finding cleanup opportunities (reuse, simplification, efficiency, altitude) but it doesn't know the codebase's dependency graph. GitNexus fills that gap:

- **Before** `/simplify`: GitNexus Impact tells you whether the changed code is safe to modify (risk level, blast radius)
- **After** `/simplify`: GitNexus Exploring confirms the fixes didn't break execution flows

Without GitNexus, `/simplify` might "fix" a symbol that 20 other modules depend on. With GitNexus, you know the risk before you touch it.

## Phase 0 — Index Check + Gather Diff

### 0a. Check GitNexus index freshness

The entire review depends on an up-to-date knowledge graph. Stale data means wrong impact analysis and missed execution flows.

1. Read `gitnexus://repo/{name}/context` to check staleness
2. If the resource reports the index is stale (or the indexed commit doesn't match `git rev-parse HEAD`), tell the user:
   ```
   ⚠️ GitNexus index is stale. Run `npx gitnexus analyze` in terminal to refresh,
   then restart this review. Stale data produces unreliable impact analysis.
   ```
3. If the user can't re-index right now, note it and proceed with reduced confidence (skip Phase 1 impact analysis, rely on `/simplify` alone)

### 0b. Gather the diff

Run `git diff HEAD` to get the working-tree diff. If there's a PR or branch argument, use `git diff main...HEAD` instead. This is the review scope.

Also run `gitnexus_detect_changes({scope: "all"})` to get the list of changed symbols — you'll need this for Phase 1.

## Phase 1 — Risk Assessment (GitNexus Impact)

Before running `/simplify`, assess the risk of the changes:

1. For each **code symbol** changed (not markdown/docs), run `gitnexus_impact({target: "symbolName", direction: "upstream"})`
2. Classify the overall risk:
   - **LOW** (<5 dependents, no critical processes) → proceed freely
   - **MEDIUM** (5-15 dependents or 2-5 processes) → proceed but flag in report
   - **HIGH/CRITICAL** (>15 dependents or auth/payment processes) → **warn the user before applying any fixes**

Report the risk assessment to the user before moving to Phase 2. If HIGH/CRITICAL, ask whether to proceed.

## Phase 2 — Cleanup Review (/simplify)

Launch 4 independent review agents in parallel, each with the diff and one angle:

### Reuse
Flag new code that re-implements something the codebase already has. Search for existing helpers, utilities, or patterns in adjacent files and shared modules. Name the existing helper to call instead.

### Simplification
Flag unnecessary complexity: redundant or derivable state, copy-paste with slight variation, deep nesting, dead code. Name the simpler form.

### Efficiency
Flag wasted work: redundant computation, repeated I/O, independent operations run sequentially, blocking work on startup/hot paths. Name the cheaper alternative.

### Altitude
Check that each change is at the right depth. Special cases layered on shared infrastructure suggest the fix isn't deep enough — prefer generalizing the underlying mechanism. Also flag config fields that are defined but never consumed (dead config), and workarounds that mask root causes.

Each agent returns findings as: `{ file, line, summary, cost, fix_hint }`

## Phase 3 — Dedup, Fix, and Verify

### 3a. Dedup findings

Merge findings that point at the same line or mechanism. When multiple angles flag the same issue, keep the most specific finding and note the other angles that agreed.

### 3b. Apply fixes

For each deduped finding, apply the fix directly. Skip a finding if:
- The fix would change intended behavior
- The fix requires changes well outside the reviewed diff
- The finding is a false positive

Note skips rather than arguing with them.

### 3c. Verify with GitNexus

After applying all fixes, run `gitnexus_detect_changes({scope: "all"})` to confirm:
- No new execution flows are affected
- Risk level hasn't escalated
- The fix scope matches expectations

If the fix introduced new risk, surface it to the user.

## Output Format

End with a summary table:

```
### Fixed (N)
| # | Dimension | What was fixed |
|---|-----------|---------------|
| 1 | Reuse     | ...           |

### Skipped (N)
| # | Reason | What was skipped |
|---|--------|-----------------|
| 1 | Out of scope | ...       |

### Risk Assessment
- Pre-review: MEDIUM (9 direct dependents on Settings)
- Post-fix: LOW (0 affected processes)
```

## When to skip phases

- **Stale or missing GitNexus index**: If Phase 0a reports staleness and the user can't re-index, skip Phase 1 and 3c. Run `/simplify` standalone and note that risk assessment was unavailable — the user should re-index and re-review before committing.
- **Docs-only changes**: If the diff only touches markdown files (CLAUDE.md, README, etc.), skip Phase 1 (impact analysis) — there are no code symbols to assess. Still run Phase 2 for content quality (reuse, simplification, altitude).
- **Single-line fix**: If the diff is trivial (1-2 lines, one file), skip the 4-agent parallel review. Do a quick inline check instead.
