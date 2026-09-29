# Invariants

> Rules that must keep holding, and features that must not come back. Read this before changing
> code. If a change breaks one of these, the change is wrong — not the invariant.

**Enforcement coverage: 2 machine checks, 6 test suites, 1 known gap, 10 review-only.** The
`Enforced by` column is a to-do list: every `review` that could be a check, should be one. See
`scripts/check-knowledge/README.md` for the check layer.

## Architecture and boundaries

| ID | Rule | Why | Enforced by |
|----|------|-----|-------------|
| INV-001 | The GPU worker must not have DB access or OSS credentials | it runs on an untrusted GPU host; the boundary is the whole reason the pipeline is split into Head/GPU/Tail | runtime guard in [start_gpu_worker.py](../backend/scripts/start_gpu_worker.py), asserted by `TestGPUWorkerSecurity` in [test_pending_processing.py](../backend/tests/test_pending_processing.py) |
| INV-002 | Every Redis dependency must fail-open — never block or raise when Redis is unavailable | Redis is cache/lock/queue, not the source of truth; a cache blip must not take down the site | review (the limiter has an in-memory fallback and a test) |
| INV-003 | Video processing is admin/catalog-triggered only — there is no user-facing submit path | GPU/LLM cost must be driven by the operating rhythm, not by user demand | test — [test_architecture_invariants.py](../backend/tests/test_architecture_invariants.py) audits every state-changing video route for admin auth |
| INV-004 | Tailwind v4 is CSS-first — never create `tailwind.config.js` | v4 reads config from `globals.css`; a JS config is silently ignored and misleads the next reader | check — `paths` rule in [invariants.json](../scripts/check-knowledge/invariants.json) |
| INV-005 | AI calls go through `ai_service.py` or `services/translation/*`, never `AsyncOpenAI` directly in a route | one place to control cost, retries, logging and provider swap | check — ruff `TID251` `banned-api` in [pyproject.toml](../backend/pyproject.toml) |
| INV-006 | Runtime AI calls happen only in the video pipeline (translation + word-note prewarm) | user paths must not carry per-request LLM cost or latency | review (INV-005 blocks the easy bypass, not a route that calls `ai_service` directly) |
| INV-007 | Word gloss has no live-LLM fallback — on cache miss it returns empty fields | a fallback would silently reintroduce per-request LLM cost on the hottest path | review |
| INV-008 | Payment is disabled for ICP compliance — redemption codes are the only channel | regulatory, not technical | review |
| INV-009 | `with_for_update` row locks are required for redemption and payment atomicity | concurrent redemption must not double-credit | test — `test_celery_tasks_pg.py` covers the `skip_locked` semantics of the redeem/order beats |
| INV-010 | Notification dedup is non-atomic (check-then-insert) | deliberate: notification data is low-stakes, and the alternative serialises a high-write table. Rare concurrent duplicates are the accepted cost | review — do not "fix" this without re-reading DEC-010 |
| INV-011 | Transcription hallucination detection runs at callback time and FAILs the video, stopping the pipeline | hallucinated subtitles reaching learners is worse than a stuck video | test — `TestTranscriptionQuality` in [test_quality_safety_net.py](../backend/tests/test_quality_safety_net.py) |
| INV-012 | The translation quality gate runs after batch translation; WARN logs and continues | transient API failures often clear on retry, so aborting would be premature | test — `TestTranslationQualityGate` in [test_quality_safety_net.py](../backend/tests/test_quality_safety_net.py) |
| INV-013 | Re-running `finalize_video` computes `word_levels` only when it is `None`, preserving manual overrides | re-processing must not destroy human work | **known gap — unenforced.** The guard is inlined in the "annotating" step of [video_processing.py](../backend/app/tasks/video_processing.py); `TestWordLevelsPreservation` only checks DB round-tripping. Extracting the decision from the Celery task would make it testable |
| INV-014 | LearningEvent emission must be non-blocking (try/except, logged, never raised) | analytics must never break the user-facing flow that emitted it | review |
| INV-015 | LearningEvent and BehaviorEvent stay separate models | different query patterns, retention and nullability; merging loses both | review |
| INV-016 | Video media is served from the backend's local media volume; covers are localized at ingest | rendering must not depend on external CDNs, and range requests need the local router | review — see `knowledge/operations/MEDIA-TOPOLOGY.md` |
| INV-017 | New frontend components use semantic tokens, not hardcoded colour values | dark mode is a single `.dark` variable block; hardcoded colours opt out of it | review |
| INV-018 | Anonymous users are denied media, detail and shadowing for any non-`is_demo` video | the login wall is a product decision that survived the free-tier change | review |
| INV-019 | The mobile tab bar (`MobileTabBar`) is the shell's last in-flow row — never `position: fixed` at the bottom. Safe areas are the shell's job alone (`MainLayoutInner` 的 `env()` padding), so no second copy on the bar | On iOS Safari `fixed` anchors to the **layout** viewport (= `100lvh`), so a fixed bottom bar sits 40px below the visual viewport whenever the address bar is shown — 真机实测：45px 的标签正好压在地址栏上沿；且 Safari 浏览器模式下 `viewport-fit=cover` 不生效、insets 恒 0（贴文本重跑确认），壳的 `env()` padding 只在 standalone / 有 cutout 的 Android 上才真加得上。其它仍用 `fixed bottom` 的浮层（考试交卷栏、迷你播放器）共担同一风险，见 wayfinder #30 | test — [viewport-height.spec.ts](../frontend/e2e/viewport-height.spec.ts) asserts the bar is not `fixed`, is ≥44px tall, and sits flush with the shell's bottom edge |
| INV-020 | Shell and full-page heights use `dvh` (`h-dvh` / `min-h-dvh`), never `vh` | `100vh` on iOS Safari is the address-bar-**hidden** height — 40px taller than the visual viewport (真机实测 790 vs 750)，拿它当高度就必然有 40px 内容落在可视区外 | test — same spec asserts shell height == `100dvh` == `innerHeight` and no document overflow |

## Removed features — do not reintroduce

Each was removed for a reason; the reasoning lives in the cited ADR / `decisions.md` entry.
INV-003's test covers the route-level part of this list.

- AI speaking scoring (`speaking_service.py`, `rubrics.py`, `speaking_alignment.py`) — ADR-0002
- Speaking dashboard metrics (streak / goals / stats) — ADR-0003
- Community UGC (posts, likes, comments, follows, reports) — ADR-0012
- User-facing UGC video, submit-URL, fork / propose-back · AI learning plan · AI assistant and
  video comments · Live AI word-card definitions (per-request LLM cost, see INV-007) — DEC-025
- Pro paywall UI (`/upgrade`, `/pricing`, `/redeem`, `/checkout`) — DEC-037

Dormant-but-present, do not extend: `ai_service.py`'s 5 dead methods, the `GET /vocabulary/{id}/enrich`
endpoint with no frontend entry point, `learning_plan.py`'s 410 endpoints, the `RedeemCode` / `plan`
tables, and Video's UGC columns (`forked_from`, `auto_publish`, `review_status`).

> Shadowing is **not** a removed feature. AI scoring of it is gone (ADR-0002), but recording
> persistence is active (ADR-0013).
