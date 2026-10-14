---
title: Spec Flow WorkItems
tags: [workflow, knowledge-layer]
status: active
confidence: verified
related_code: []
related: [.agents/skills/spec-flow/SKILL.md, docs/agents/issue-tracker.md, .agent/owners.md]
created: 2026-10-14
updated: 2026-10-14
---

# Spec Flow WorkItems

Spec Flow is the durable control plane for work that will not fit in one session. It is not a
second issue tracker and not a replacement for a design record. It keeps intent, research, the
chosen solution, the implementation plan and slice evidence together, while GitHub keeps the
execution facts: who claimed a slice, what blocks it, and whether it is still open.

The operating procedure lives in [`.agents/skills/spec-flow/SKILL.md`](../../.agents/skills/spec-flow/SKILL.md)
and its Claude mirror. This file is the schema and ownership reference those commands read.

## One fact, one home

| Fact | Home |
|---|---|
| Global result, boundaries, phase map, slice map, current frontier, effects | WorkItem `README.md` |
| Problem, desired outcome, success criteria, constraints, source pointers | `intent.md` |
| Verified facts, open questions, options and research evidence | `research.md` |
| Chosen solution, alternatives, contracts, failure paths, rollback | `solution.md` |
| Implementation order, slice contracts, dependencies, rollout and test strategy | `plan.md` |
| One session's context, acceptance, evidence and result | `slices/Sxx-*.md` |
| Claim, blocking edges, PRs, issue state | GitHub Issues |
| Why a non-obvious choice was made | `knowledge/decisions.md` + index |
| What one file, table or component is and what it cannot break | AOCI, never copied into WorkItem prose |

`README.md` may link to every other home. It does not restate their contents.

## Directory shape

```text
knowledge/work/W-YYYYMMDD-NN-<slug>/
  README.md
  intent.md
  research.md       # created when research starts
  solution.md       # created when solution drafting starts
  plan.md           # created when planning starts
  slices/
    S01-<slug>.md
    S02-<slug>.md
```

The WorkItem ID is allocated at creation by `scripts/spec-flow/spec_flow.py new`. It never
changes. A slice ID is stable too: a cancelled slice keeps its number and status, so later work
cannot silently reuse an identity.

## Root frontmatter

```yaml
---
work_item: W-20261014-01
title: 产品缺口推进
status: solution_review
created: 2026-10-14
updated: 2026-10-14
sources: [knowledge/plans/产品缺口-2026-10.md]
parent_issue: null
sync_state: pending
---
```

`status` is one of:

`intake`, `clarifying`, `solution_review`, `solution_approved`, `planning`, `plan_review`,
`plan_approved`, `executing`, `verifying`, `done`, `paused`, `rejected`, `superseded`.

`sync_state` is `pending` while local authoring is ahead of GitHub, and `synced` only after the
helper has reconciled the parent and child issue mapping. A missing GitHub mapping blocks
execution; it does not invalidate an offline research or solution session.

## Stage frontmatter

Each phase file carries the phase identity and its approval state:

```yaml
---
phase: solution
status: review
revision: 1
approved_by: null
approved_at: null
approval_ref: null
---
```

The valid phase statuses are `draft`, `review`, `approved`, `stale` for solution and plan;
`draft`, `final` for intent; and `open`, `closed` for research.

Approval is a human act. `approved_by`, `approved_at` and an issue-comment `approval_ref` are
required once a solution or plan is approved. A substantive change to an approved upstream
artifact marks every downstream artifact `stale`; the workflow returns to the relevant review
gate instead of silently carrying old consent forward.

## Slice frontmatter

```yaml
---
slice: S01
title: 服务环境验收
status: blocked
issue: null
depends_on: []
evidence: null
---
```

Slice statuses are `specified`, `ready`, `in_progress`, `verifying`, `done`, `blocked`,
`deferred`, `cancelled`. `depends_on` contains slice IDs in the same WorkItem. A slice marked
`done` must carry an evidence pointer; otherwise `verifying` is the highest honest state.

## GitHub mapping

The parent issue represents the WorkItem; each child issue represents one slice. The helper
uses `spec-flow:workitem` and `spec-flow:slice` labels and GitHub's native dependency relation
for `depends_on`. The child issue's assignee is the claim; closed child issues unlock the
frontier. The parent stays open until every non-cancelled slice is done or explicitly deferred
with a revisit condition.

The issue body is an index into the WorkItem, not a second copy of the spec. Approval comments
record the two gates; acceptance, evidence and rollback stay in the slice file.

## When to use a WorkItem

Use one when the work is expected to cross sessions, contains multiple independently verifiable
deliverables, or needs both a solution decision and a staged implementation plan. Small,
single-session fixes stay in the normal task flow; a one-off design document stays in
`knowledge/plans/`.

The workflow is deliberately manual. It does not add a heartbeat, a local dependency queue,
automatic issue creation before approval, or autonomous continuation across slices.
