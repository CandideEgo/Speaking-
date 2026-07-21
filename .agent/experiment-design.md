# Phase 1 Validation: A/B Experiment Design

## Goal

Validate the core hypothesis:

> **Maintaining project context (.agent/ + wiki/) significantly improves Agent engineering capability compared to no context.**

## What We're Measuring

Not "can the Agent write code" — that's baseline capability.
We're measuring whether context makes the Agent:

1. **Make fewer wrong assumptions** about the codebase
2. **Avoid re-exploring** already-understood areas
3. **Make better decisions** that align with existing architecture
4. **Not repeat mistakes** that are documented in decisions.md

## Experiment Design

### Task Selection

Choose a task that:
- Requires understanding of multiple modules (not a single-file fix)
- Has non-obvious constraints (things code doesn't directly express)
- Has documented decisions that affect the approach
- Is realistic (not contrived)

**Candidate tasks for Speaking project:**

| Task | Why it tests context | Difficulty |
|------|---------------------|------------|
| A. Add comment notification dedup | Crosses community + notification services; existing pattern of 4 trigger points without dedup is documented | Medium |
| B. Fix WS push observability | notification_service.py silent exception is a known unfixed issue (#11); requires understanding fail-open pattern | Medium |
| C. Add video re-processing flow | Touches video pipeline head/tail, checkpoint resume, callback lock; many non-obvious constraints | Hard |
| D. Implement behavior event collection | ADR-0011 prerequisite; requires understanding recommendation system design | Medium-Hard |

**Recommended: Task A or B** — medium difficulty, crosses modules, has documented context that should help.

### Group A: No Context (Control)

```bash
# Setup
rm -rf .agent/ wiki/
# Replace AGENTS.md with minimal version (no Context/Skills/Knowledge sections)
# Disable context skills
```

Agent starts with:
- Only the codebase itself
- CLAUDE.md / CONTEXT.md (existing, not part of our system)
- No .agent/ files
- No wiki/
- No context skills

### Group B: Full Context (Experimental)

```bash
# Setup
# .agent/ with context.md, decisions.md, state.md, system-map.md
# wiki/ with all architecture/problem/guide documents
# AGENTS.md with full template including Implicit Knowledge Filter
# All 4 context skills active
```

Agent starts with:
- Everything in Group A
- Plus .agent/ context files
- Plus wiki/ knowledge base
- Plus context skills

### Measurement Criteria

For each group, measure:

| Metric | How to Measure |
|--------|---------------|
| **Time to first meaningful action** | How long before the Agent starts modifying code (vs exploring) |
| **Wrong assumptions** | Count statements that contradict code reality |
| **Repeated exploration** | How many times Agent re-reads files it should already understand |
| **Architecture alignment** | Does the solution respect documented constraints and patterns? |
| **Decision quality** | Does the Agent consider documented trade-offs before choosing an approach? |
| **Knowledge captured** | Does the Agent update .agent/ after changes? (Group B only) |

### Scoring Rubric

Each metric scored 1-5:

| Score | Meaning |
|-------|---------|
| 5 | Excellent — no issues, context used effectively |
| 4 | Good — minor issues, context mostly helpful |
| 3 | Neutral — some issues, context partially helpful |
| 2 | Poor — significant issues, context not used well |
| 1 | Bad — fundamental misunderstandings, context ignored or harmful |

### Experiment Protocol

1. **Prepare both environments** from the same git commit
2. **Run Group A first** — Agent performs the task with no context
3. **Reset to same commit**
4. **Run Group B** — Agent performs the same task with full context
5. **Score both runs** using the rubric above
6. **Compare results**

### Expected Outcomes

If the hypothesis is correct:
- Group B should score higher on architecture alignment and decision quality
- Group B should have fewer wrong assumptions
- Group B should start meaningful work faster (less exploration)
- The difference should be **noticeable**, not marginal

If the hypothesis is wrong:
- Both groups perform similarly
- Context files are noise that the Agent ignores
- The system adds overhead without value

### Threats to Validity

| Threat | Mitigation |
|--------|-----------|
| Same Agent, sequential runs (learning effect) | Use different tasks or different Agents |
| Task too simple (context doesn't matter) | Choose cross-module tasks with non-obvious constraints |
| Task too hard (both groups fail) | Choose medium-difficulty tasks |
| Scorer bias | Pre-define scoring criteria; ideally have independent scorer |
| Context files are stale/wrong | Run knowledge-verification first (already done) |

### Minimum Viable Experiment

If a full A/B test is too expensive, do a **single-session qualitative test**:

1. Give Agent a task WITH context
2. Observe whether it uses context.md, decisions.md, system-map.md
3. Observe whether it respects documented constraints
4. Observe whether it avoids known pitfalls
5. Compare subjectively to your experience of Agent without context

This is weaker than A/B but still provides signal.

## Current Status

- [x] Context system deployed (4 skills + .agent/ + wiki/)
- [x] Knowledge verification completed (6 drifts found and fixed)
- [x] docs/architecture/SYSTEM-MAP.md marked as outdated
- [x] Experiment design documented
- [ ] Select specific task
- [ ] Run Group A (no context)
- [ ] Run Group B (with context)
- [ ] Score and compare
- [ ] Document results
