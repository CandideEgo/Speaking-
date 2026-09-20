# Handoffs

> State transfer between agents. When one task is split across owners
> (see `.agent/owners.md`), each execution agent writes one file here before its
> session ends; the next agent — or the planner doing acceptance — reads these files
> instead of replaying chat history. This directory holds **only** the current split
> task's entries; finished entries move to `.agent/archive/handoffs/`.

## Two disciplines

1. **Conclusions only.** Record decisions and outcomes, never reasoning or logs.
   The reasoning dies with the execution session; that is what keeps it cheap.
2. **Contracts are bidirectional.** If the task touched a contract file
   (see `.agent/owners.md`), the entry must say exactly what changed at each end.
   If there were no contract changes, say so explicitly — absence must be visible.

No commit hashes here (ownership check); reference decisions as `DEC-0xx` / `ADR-00xx`
and commits by subject line and date.

## Lifecycle

1. Planner creates one entry per subtask, filled with the task description and
   acceptance criteria, before dispatching.
2. The execution agent completes **已完成** / **契约变更** / **关键决策** / **遗留**
   at the end of its session.
3. Acceptance: planner checks machine gates, then reads only the contract-change
   sections plus the diffs of the contract files themselves.
4. When the task lands in `state.md` Recently Completed, move the entry to
   `.agent/archive/handoffs/`.

## Template

```markdown
# Handoff: <task id or short slug>

- Owner: <owner name from owners.md>
- Status: dispatched | in progress | done
- Planner acceptance: <what "done" means, written by the planner>

## 任务
<what this agent must do, one short paragraph>

## 已完成
<bullet: file changed + one-line behaviour change>

## 契约变更
<each contract file: what changed at each end; or "无">

## 关键决策
<only decisions the next agent or reviewer must know; cite DEC/ADR>

## 遗留
<unrun tests, follow-ups for other owners, or "无">
```

See `2026-09-20-baseline.md` for a worked example.
