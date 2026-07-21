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
