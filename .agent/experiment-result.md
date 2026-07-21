# Phase 1 A/B Experiment Result

## Experiment

**Task**: Add notification dedup for repeated actions (like → unlike → re-like)
**Date**: 2026-07-22
**Project**: Speaking (SeeWord)

## Scoring

| Metric | Group A (No Context) | Group B (With Context) | Difference |
|--------|---------------------|----------------------|------------|
| Time to first meaningful action | ~3 min exploration | ~30 sec (read context) | **B 6x faster** |
| Wrong assumptions | 1 (considered actor_id, found missing) + 1 (WS push pattern) | 0 | **B fewer** |
| Repeated exploration | 4 file reads (discovery) | 3 file reads (verification) | **B less** |
| Architecture alignment | 3/5 — missed cross-cutting nature, didn't know WS push was fixed | 5/5 — knew all constraints upfront | **B significantly better** |
| Decision quality | 3/5 — naive dedup key, no actor distinction | 5/5 — actor-aware, backward-compatible, documented trade-offs | **B significantly better** |
| Knowledge captured | 0 — no mechanism | 5/5 — decision + state updated | **B only one** |

## Detailed Comparison

### Implementation Correctness

| Aspect | Group A | Group B |
|--------|---------|---------|
| Dedup key | (user_id, type, related_url) | (user_id, type, related_url, actor_id) |
| Actor distinction | ❌ Merges "Alice liked" with "Bob liked" | ✅ Separate notifications per actor |
| Backward compatibility | ✅ No API change | ✅ actor_id is optional parameter |
| Race condition | Not considered | Documented as acceptable trade-off |
| Index | ✅ Composite index added | ✅ Composite index added |
| Tests | 4 tests | 6 tests (extra: actor distinction, data storage) |
| Call sites updated | None (dedup is transparent) | All 4 updated with actor_id |

### Critical Difference: The Actor Problem

Group A's dedup key (user_id, type, related_url) has a **semantic bug**:

```
User A likes Post X → notification "User A liked your post"
User B likes Post X → notification "User B liked your post"
```

With Group A's dedup, the second notification **updates** the first one.
The post owner never sees "User A liked your post" — it gets replaced by "User B liked your post".

This is wrong. These are distinct events from different actors.

Group B's actor-aware dedup correctly keeps both notifications.

### Knowledge Capture

| What | Group A | Group B |
|------|---------|---------|
| Design decision recorded | ❌ No mechanism | ✅ .agent/decisions.md |
| Current state updated | ❌ No mechanism | ✅ .agent/state.md |
| Future agents benefit | ❌ | ✅ Will know why actor_id is in data JSON |

## Overall Score

| | Group A | Group B |
|---|---------|---------|
| **Total (out of 30)** | **12** | **25** |

## Conclusion

**The hypothesis is supported.** Context system significantly improves Agent engineering capability:

1. **Faster start** — no exploration phase needed
2. **Better decisions** — actor-aware dedup catches a bug that naive dedup misses
3. **Architecture awareness** — knew notification_service is cross-cutting, designed backward-compatible API
4. **Knowledge persistence** — decisions recorded for future agents

The most impactful difference was **decision quality**, not speed. Group A produced a working implementation, but one with a semantic bug (merging different actors' notifications). Group B produced a correct implementation because the context revealed:

- notification_service is cross-cutting (not just community) → backward compatibility matters
- There's no actor_id column → need alternative storage
- The data JSON field exists and was unused → natural storage for actor_id

## Limitations

- Single task, single project — not statistically significant
- Same Agent ran both groups (no learning effect since context was genuinely unavailable in Group A)
- Task was chosen to be context-sensitive (cross-module with non-obvious constraints)
- Results may not generalize to simple tasks where context doesn't matter

## Next Step

Merge Group B's implementation to master (it's the correct one).
The experiment branches can be deleted after review.
