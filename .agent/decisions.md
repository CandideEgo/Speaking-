# Technical Decisions

## 2026-07-03 — Product positioning: video vocabulary + community UGC

**Problem**: Speaking scoring had low ROI, product direction unclear
**Options**: A) Continue investing in speaking scoring; B) Cut scoring, focus on video vocabulary + community UGC
**Decision**: B
**Reason**: Speaking scoring API cost high, accuracy unstable; video vocabulary loop clearer
**Trade-offs**: Lost speaking practice differentiation, but gained clearer product focus and lower operating cost
**ADR**: [0001](docs/adr/0001-product-positioning.md), [0002](docs/adr/0002-cut-ai-scoring-recording-playback.md)

---

## 2026-07-03 — Recording changed to playback-only

**Problem**: AI scoring pipeline complex and unreliable
**Options**: A) Keep AI scoring, switch models; B) Playback-only, zero API
**Decision**: B
**Reason**: Reduce complexity and cost, preserve basic practice experience
**Trade-offs**: No AI feedback on pronunciation, but eliminated unreliable API dependency
**ADR**: [0002](docs/adr/0002-cut-ai-scoring-recording-playback.md)

---

## 2026-07-03 — UGC pipeline admin-triggered

**Problem**: Auto-processing UGC has security and cost risks
**Options**: A) Auto dispatch on submit; B) Admin manually triggers
**Decision**: B
**Reason**: Control GPU cost, audit content quality, prevent malicious submissions
**Trade-offs**: Slower UGC turnaround, but safe from resource exhaustion attacks
**ADR**: [0004](docs/adr/0004-ugc-pipeline-admin-triggered.md)

---

## 2026-07-03 — Unified frontend component library

**Problem**: Component styles inconsistent, high maintenance cost
**Options**: A) Independent design per page; B) Unified component library with watch page as anchor
**Decision**: B
**Reason**: Reduce duplicate code, unify visual experience
**Trade-offs**: Less per-page creative freedom, but consistent UX and lower maintenance
**ADR**: [0005](docs/adr/0005-frontend-rebuild-unified-components.md)

---

## 2026-07-03 — Standard version + Fork + Propose-back

**Problem**: Same URL submitted by multiple users causes duplicate GPU processing
**Options**: A) Full processing every time; B) Standard version + fork + propose-back
**Decision**: B
**Reason**: Dedup saves GPU, shared editing reduces maintenance
**Trade-offs**: More complex data model (forked_from, propose-back PRs), but N× GPU cost savings
**ADR**: [0006](docs/adr/0006-standard-version-fork-propose-back.md)

---

## 2026-07-03 — Redemption code 4-state machine

**Problem**: Redemption code lifecycle unclear, no refund/revocation support
**Options**: A) Simple used/unused binary; B) 4-state machine (unused/redeemed/revoked/expired)
**Decision**: B
**Reason**: Prevent abuse, support refund revocation, proactive expiry
**Trade-offs**: More complex state management, but full audit trail and refund capability
**ADR**: [0007](docs/adr/0007-redemption-code-lifecycle.md)

---

## 2026-07-03 — Recommendation system planning

**Problem**: Homepage `created_at desc` sorting has no personalization
**Options**: A) Continue time-based sorting; B) learning_score + recommendation strategy
**Decision**: B
**Reason**: Improve content discovery efficiency
**Trade-offs**: Requires behavior collection infrastructure first (P0 blocker), but enables long-term engagement
**Status**: Planned, behavior collection is P0 blocker
**ADR**: [0011](docs/adr/0011-recommendation-system.md)

---

## 2026-07-20 — Frontend-backend unification

**Problem**: Naming/types/error formats/pagination inconsistent
**Options**: A) Gradual fixes; B) 4-phase systematic unification
**Decision**: B
**Reason**: Reduce maintenance cost, unify development experience
**Trade-offs**: Large coordinated change, but eliminates accumulated inconsistencies

---

## 2026-07-19 — Dark mode via CSS semantic tokens

**Problem**: Light mode only
**Options**: A) `dark:` variant per component; B) CSS semantic tokens + `.dark` variable block
**Decision**: B
**Reason**: One variable block cascades entire site, lowest maintenance cost
**Trade-offs**: Less per-component control, but 40+ fewer file changes and automatic dark mode for new components

---

## 2026-07-22 — Actor-aware notification dedup

**Problem**: Repeated actions by the same user (like→unlike→re-like) create duplicate notifications
**Options**: A) No dedup (status quo); B) Full dedup (same type+related_url → single notification); C) Actor-aware dedup (same actor → update, different actors → separate)
**Decision**: C
**Reason**: "Alice liked your post" and "Bob liked your post" are distinct events; only same-actor repeats should merge
**Trade-offs**: Non-atomic check-then-insert (rare concurrent duplicates possible), but avoids row-level locking on a high-write table; notifications are low-stakes so occasional duplicates are acceptable

---

## 2026-07-23 — Quality safety net: fail-fast vs fail-through

**Problem**: Transcription/translation quality issues silently enter production (repetition hallucination, empty translations, lost word_levels on re-run)
**Options**: A) Fail-fast (mark video error, stop pipeline); B) Fail-through (log warning, continue with degraded content); C) Hybrid (critical issues fail, minor issues warn)
**Decision**: C
**Reason**: Hallucination destroys user trust (repetitive nonsense subtitles), so it fails fast. Translation coverage issues may be transient (API rate limit), so they warn but continue — the per-item retry in `_translate_subtitles` may fill gaps on next run. Word_levels are compute-cheap to re-derive but expensive to manually curate, so they must be preserved on re-runs.
**Trade-offs**: More complex quality gate logic (3 thresholds × 2 actions), but appropriate severity handling for each issue type

---

## 2026-07-23 — Translation retry: exponential backoff vs circuit breaker

**Problem**: Translation APIs intermittently fail (network timeout, 5xx, rate limit)
**Options**: A) Circuit breaker (stop calling after N failures); B) Exponential backoff per-request (2s → 4s → 8s); C) Concurrent dual-engine with cancellation (already implemented)
**Decision**: B + C (layered)
**Reason**: Circuit breakers add complexity (state machine, half-open recovery) for a problem that transient retries solve. Exponential backoff is simple and effective for API hiccups. Concurrent dual-engine (primary + fallback) handles engine-level outages, while per-request retry handles transient network issues within a single engine.
**Trade-offs**: 3 retries × up to 8s delay adds latency, but only on failure paths; success path is unchanged. Permanent errors (4xx/auth) are detected and not retried.

---

## 2026-07-23 — Fork indicator display strategy: where and why

**Problem**: `forked_from` exists in the data model but users can't tell if a video is forked from a standard version
**Options**: A) Show everywhere (all video cards, lists, details); B) Show only in admin panel; C) Show in user-facing locations where lineage matters (watch page, my-videos, admin table)
**Decision**: C
**Reason**: Fork lineage matters most in three contexts: (1) watch page — learners should know if they're watching a fork or the original; (2) my-videos — creators need to distinguish their forks from originals; (3) admin table — admins managing the standard version ecosystem need visibility. Other locations (homepage feed, search results) don't need the noise — the badge adds cognitive load without value there.
**Trade-offs**: Inconsistent badge presence across pages, but lower visual noise where lineage is irrelevant. A reusable `ForkBadge` component makes the decision reversible — adding/removing from a page is one line.

---

## 2026-07-23 — Video status response: subtitle_count for resume hint

**Problem**: Admin retrying a failed video doesn't know whether transcription will be skipped
**Options**: A) Add `subtitle_count` to status response; B) Infer from `processing_step` (unreliable — error paths clear it to null); C) Add a separate `can_resume` boolean
**Decision**: A
**Reason**: `processing_step` is unreliable as a resume signal because error paths (watchdog, callback failure) clear it. Subtitle existence in DB is ground truth — if subtitles exist, `retry_video` skips transcription. Exposing the count (not just boolean) lets the UI show "已有 47 条字幕" for richer feedback.
**Trade-offs**: Extra DB query per status poll, but `count_subtitles` is a cheap indexed query. The alternative (inferring from `processing_step`) would create misleading UI when the step is null.

---

## 2026-07-23 — Word_levels preservation: compute-on-null vs always-recompute

**Problem**: Re-running finalize_video (retry/recover) overwrites manually curated word_levels
**Options**: A) Always recompute (simple, but destroys manual overrides); B) Compute only when null (preserves overrides, but may miss ECDICT updates); C) Versioned annotation (track ECDICT version, recompute when dictionary updates)
**Decision**: B
**Reason**: Manual word_levels overrides are the result of admin review time — far more valuable than auto-computed baseline. ECDICT updates are rare (annual CET syllabus changes); when they happen, a targeted backfill script is more appropriate than always-recomputing on every re-run.
**Trade-offs**: If ECDICT is updated and a video is re-processed for other reasons, the old word_levels remain. This is acceptable — the backfill script `recompute_word_levels` handles bulk updates when needed.

---

## 2026-07-24 — Video storage: HK VPS file server vs OSS vs source station local

**Problem**: Source station disk 78% full (29GB/40GB). Video files (1GB, growing) served through Python Range service consuming source station bandwidth+CPU. OSS not purchased.
**Options**: A) Buy Alibaba Cloud OSS + CDN (monthly cost, best CDN performance for mainland users); B) Use HK VPS as file server (39GB free, zero cost, 46ms latency from source); C) Keep on source station + clean Docker cache (temporary, doesn't solve growth)
**Decision**: B
**Reason**: HK VPS has 39GB idle, zero marginal cost. Source→HK latency 46ms acceptable for video streaming (bandwidth matters more than first-byte latency). OSS would add monthly billing for a pre-revenue product. Source station nginx caches 7d, reducing HK bandwidth consumption.
**Trade-offs**: Mainland users traverse source station→HK VPS for video bytes (vs direct CDN with OSS). New video files require manual SCP to HK VPS (not automated in pipeline). HK VPS is single point of failure for video playback (no replication). Can upgrade to OSS+CDN later if bandwidth/latency becomes an issue.

---

## 2026-07-24 - ADR-0012: Cut social community UGC, pivot to AI learning plan

**Problem**: Social community UGC doesn't solve the core English-learning problem (find content / understand video / remember vocab / sustain learning), yet brings moderation cost + system complexity (6 tables, 4 notification triggers, admin review block, creator center, propose-back PRs).
**Options**: A) Keep investing in community; B) Cut social community, keep VideoLike (feeds recommendation + watch-page like button), pivot to AI LearningPlan
**Decision**: B
**Reason**: Community doesn't serve the learning loop (goal -> plan -> watch -> vocab -> practice -> review -> adjust). The real long-term capability loop is AI-driven learning plans + spaced repetition, not social UGC. VideoLike kept because it feeds recommendation like_count / is_featured and the watch-page like button at near-zero ops cost.
**Trade-offs**: Sunk cost (Phase 4 community alignment, actor-aware dedup's community triggers) discarded; dedup mechanism retained for non-community notifications. 6 tables dropped (irreversible - pg_dump backup taken); video_likes + Video UGC columns kept dormant to reduce irreversibility. comment_service (video comment quality scoring) retained - independent of social community.
**ADR**: [0012](docs/adr/0012-cut-community-ugc-pivot-to-learning-plan.md)

---

## 2026-07-24 — LearningEvent vs BehaviorEvent: separate models

**Problem**: ADR-,12 needs structured learning events (completed_video, learned_words, etc.) for profile aggregation, daily goal tracking, and recommendation system. BehaviorEvent already exists for raw interaction logging.
**Options**: A) Add semantic event types to BehaviorEvent8; B) Separate LearningEvent model
**Decision**: B
**Reason**: Different query patterns (LearningEvent: daily aggregation, streak, cycle counting; BehaviorEvent: analytics, debugging, recommendation personalization), different retention policies (LearningEvent: long-lived for profile; BehaviorEvent: potentially high-write, shorter retention), different nullability (LearningEvent always has user_id; BehaviorEvent allows anonymous). Mixing would bloat BehaviorEvent with semantic events that have different access patterns.
**Trade-offs**: Two event tables to maintain. Event emission from existing services (practice, behavior, vocabulary) must be non-blocking (try/except, logged but never raised) to avoid disrupting existing flows. LearningEvent emission is a side-channel, not a replacement for BehaviorEvent.

---

## 2026-07-24 — WordMastery: enhance Vocabulary vs new table

**Problem**: ADR-0012 needs per-word mastery tracking (exam_level, first_seen_at, correct_count) for per-level mastery breakdowns and accuracy tracking. Vocabulary already has SM-2 fields (mastery_level, ease_factor, interval_days, review_count, next_review_at).
**Options**: A) Separate WordMastery table with FK to Vocabulary; B) Add columns to existing Vocabulary model
**Decision**: B
**Reason**: Vocabulary already has the user-word unique constraint and SM-2 fields. A separate WordMastery table would duplicate the (user_id, word) unique constraint, creating a two-source-of-truth problem and requiring JOINs on every vocabulary query. Three additional columns (exam_level, first_seen_at, correct_count) are lightweight and naturally belong on the same row.
**Trade-offs**: Vocabulary table grows wider (now 18+ columns). If mastery tracking needs fundamentally different semantics in the future (e.g., per-context mastery where the same word has different states in different videos), a separate model would be needed — but current SM-2 semantics are global per user-word.

---

## 2026-07-24 — UX design direction: Apple HIG + Material Design + Linear principles

**Problem**: Frontend UX had accumulated anti-patterns: information overload on watch page, 6-button decision paralysis in vocab review, jarring full-page spinners, mandatory onboarding, inconsistent labels, silent failures, fake load-more buttons, and no undo for destructive actions.
**Options**: A) Ad-hoc fixes as reported; B) Systematic UX audit against established design principles, then batch fix
**Decision**: B — adopt three design principle frameworks as ongoing guidance:
  - **Apple HIG**: Clarity (one focal point per screen), Deference (never block user from value), Depth (progressive disclosure)
  - **Material Design**: Feedback (every action has visible result), Reversibility (prefer undo over confirm), Continuity (skeleton over spinner)
  - **Linear**: Speed (keyboard shortcuts for high-freq ops), Cognitive load reduction (3 choices max for repeatable actions)
**Reason**: These three frameworks complement each other — HIG for hierarchy/focus, Material for interaction feedback, Linear for speed/efficiency. They provide objective criteria for future UX decisions rather than subjective taste.
**Trade-offs**: Some patterns require more code (undo toast > confirm dialog, skeleton > spinner). Watch page progressive disclosure adds one click to reach practice — acceptable because most viewing sessions don't need practice every sentence.
**Established patterns (follow in future work)**:
  - Destructive actions → optimistic delete + undo toast (5s window), NOT confirm dialog
  - Loading states → ShellSkeleton (layout-aware), NOT FullPageSpinner
  - High-frequency repeated actions → max 3 choices + keyboard shortcuts
  - Complex pages → progressive disclosure (collapsed CTA → expand on demand)
  - User-initiated saves → toast on failure, never silent catch
  - Navigation labels → identical across mobile TabBar and desktop Sidebar
