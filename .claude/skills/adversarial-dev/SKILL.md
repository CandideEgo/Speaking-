---
name: adversarial-dev
description: "对抗开发工作流 — 一个 Agent 开发，另一个 Agent 独立审查把关。触发：用户说 /adversarial-dev、'对抗开发'、'build and review'、'开发并审查'、'构建并把关'，或明确要求对抗式开发流程时使用。"
---

# Adversarial Development Workflow (对抗开发)

Two-phase development workflow where a **Builder** implements and a **Gatekeeper** independently reviews. No code is committed without passing the Gatekeeper's 5-gate review.

## Core Principle

**Separation of concerns**: The person who writes the code cannot approve it. The person who reviews the code does not rewrite it — they identify problems and the builder fixes them.

## Trigger

Manual only — user invokes `/adversarial-dev` with a task description. Normal development tasks proceed without this workflow unless explicitly requested.

## Review Scope

**All uncommitted changes** (staged + unstaged + untracked). This prevents scope gaming where clean code is staged and problems are left unstaged.

---

## Phase 1 — Builder (开发者 Agent)

### Step 1: Pre-change Impact Analysis

For every symbol you plan to modify:

1. Run `gitnexus_impact({target: "symbolName", direction: "upstream"})` to understand blast radius
2. If any symbol has **HIGH** or **CRITICAL** risk level, surface the warning to the user BEFORE proceeding:
   ```
   ⚠️ HIGH/CRITICAL risk: `symbolName` has N direct dependents and affects [processes].
   Proceed? (User must confirm)
   ```
3. If user declines, propose an alternative approach with lower risk

### Step 2: Explore Existing Code

Use `gitnexus_query` and `gitnexus_context` to find:
- Existing utility functions in `@/lib/format`, `@/lib/utils`, `@/lib/animations`
- Shared hooks in `@/hooks/`
- Shared types in `@/types/`
- Existing patterns in adjacent files

**Rule**: Never create a new utility when an existing one serves the purpose. If you need a helper, check if it already exists first.

### Step 3: Implement Changes

- Write code that matches the surrounding style (comment density, naming, idiom)
- Reuse existing utilities — do NOT re-implement
- Follow patterns from CONTRIBUTING.md §6 (no anti-patterns)
- Add proper error handling with user feedback
- Add loading states for async operations

### Step 4: Post-change Verification

1. Run `gitnexus_detect_changes({scope: "all"})` — confirm change scope matches intent
2. If unexpected symbols appear, investigate before proceeding

### Step 5: Run Local Tests

```bash
# Backend
cd backend && pytest tests/ -v

# Frontend
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

If tests fail, fix before generating handoff report.

### Step 6: Generate Handoff Report

Produce this structured report in session text (NOT a file):

```markdown
## 🏗️ Developer Handoff: [task description]

### Changes Made
- `file/path`: [what was changed and why]
- `file/path`: [what was changed and why]

### Symbols Modified
- `symbolName` in `file/path` — [reason for modification]

### Impact Assessment
- Overall risk level: [LOW/MEDIUM/HIGH/CRITICAL]
- Affected processes: [list from gitnexus_detect_changes]
- gitnexus_impact summary: [key findings per symbol]

### Existing Utilities Reused
- `utilityName` from `@/lib/...` — [purpose]
- `hookName` from `@/hooks/...` — [purpose]

### Requirement IDs
- [ID]: [how this change addresses the requirement]

### Local Test Results
- Backend (pytest): ✅ PASS / ❌ FAIL — [summary]
- Frontend (tsc+lint+build): ✅ PASS / ❌ FAIL — [summary]

### Known Limitations
- [anything the reviewer should be aware of]
```

**DO NOT commit.** Commit authority belongs to the Gatekeeper.

---

## Phase 2 — Gatekeeper (审查者 Agent)

### Step 1: Independent Change Detection

Run `gitnexus_detect_changes({scope: "all"})` independently. **Do not trust the builder's report.** Verify:

- Same symbols are modified
- Same risk level
- No unexpected symbols the builder missed

If discrepancies exist, flag them immediately.

### Step 2: Independent Impact Analysis

For each modified symbol, run `gitnexus_impact({target: "symbolName", direction: "upstream"})`. Verify the builder's impact assessment matches reality.

### Step 3: Evaluate 5 Gates

All 5 gates must pass for a PASS verdict. Any single FAIL = REVISE.

#### Gate 1: Impact Verified (影响验证)

- [ ] Risk level in handoff report matches independent `gitnexus_detect_changes` result
- [ ] No unexpected symbols modified beyond what the builder reported
- [ ] If risk is HIGH/CRITICAL, user was informed and approved before changes were made
- [ ] No changes to critical execution flows (auth, payment) without explicit approval

**Auto-REVISE if**: Builder reported LOW but GitNexus shows MEDIUM or higher.

#### Gate 2: No Anti-patterns (无反模式)

Per CONTRIBUTING.md §6, check for:

- [ ] No silent error catching: `catch(() => {})` or `catch {}` without logging/recovery
- [ ] No TypeScript `as` type assertions — use type guards or runtime validation instead
- [ ] No `.env` files or secrets in the diff
- [ ] No synchronous database operations (`session.query()` instead of `await session.execute()`)
- [ ] No hardcoded UI strings that should be centralized for i18n
- [ ] No payment bypass or placeholder signature verification in production code
- [ ] No inline styles or CSS-in-JS (Tailwind only)
- [ ] No duplicate logic that already exists in shared utilities

#### Gate 3: Security (安全审查)

Per SECURITY.md, verify:

- [ ] New API endpoints have appropriate auth middleware (`get_current_user`, `get_optional_user`, `get_admin_user`, `require_pro_user`)
- [ ] Payment-related changes have signature verification (VULN-01)
- [ ] No CORS misconfigurations (VULN-02)
- [ ] Rate limiting present on public endpoints (VULN-03)
- [ ] No SQL injection vectors (use ORM properly) (VULN-04)
- [ ] No XSS vectors in user-facing content (VULN-08)
- [ ] Input validation on all user-supplied data

#### Gate 4: Code Quality (代码质量)

Four dimensions (from `/simplify-gitnexus`):

- [ ] **Reuse**: No re-implementation of existing helpers. Builder listed reused utilities.
- [ ] **Simplification**: No unnecessary complexity, redundant state, deep nesting, dead code.
- [ ] **Efficiency**: No redundant computation, repeated I/O, blocking on hot paths.
- [ ] **Altitude**: Changes are at the right abstraction level. No special cases that should be generalized.

#### Gate 5: Traceability (可追溯性)

- [ ] Commit message follows Conventional Commits: `type(scope): description (REQ-ID)`
- [ ] Requirement ID from REQUIREMENTS.md is referenced
- [ ] Backend changes have tests; frontend changes pass `tsc` + `lint` + `build`
- [ ] No unrelated changes mixed in

### Step 4: Generate Verdict

```markdown
## 🔍 Reviewer Verdict: [PASS ✅ / REVISE 🔄 / REJECT 🛑]

### Gate Results
- G1 Impact Verified: [✅/❌] — [detail]
- G2 No Anti-patterns: [✅/❌] — [detail]
- G3 Security: [✅/❌] — [detail]
- G4 Code Quality: [✅/❌] — [detail]
- G5 Traceability: [✅/❌] — [detail]

### Findings

| # | Gate | Severity | File | Finding | Fix Hint |
|---|------|----------|------|---------|----------|
| 1 | G2   | HIGH     | path | desc    | how      |

Severity levels: 🔴 HIGH (must fix) · 🟡 MEDIUM (should fix) · 🟢 LOW (nice to have)

### Required Revisions (for REVISE verdict)
1. [specific, actionable instruction]
2. [specific, actionable instruction]

### Caveats (for PASS verdict, non-blocking observations)
- [minor issue to track as tech debt]

### Commit Message (for PASS verdict)
feat(scope): description (REQ-ID)
```

---

## Feedback Loop (反馈循环)

### PASS ✅
1. Gatekeeper stages all changes: `git add -A`
2. Commits with the approved message
3. Report commit hash to user

### REVISE 🔄
1. Return to Phase 1 with the specific feedback
2. Builder addresses each finding — fixes or explicitly rebuts
3. Re-run from Phase 1 Step 4 (post-change verification onward)
4. **Maximum 3 revision rounds.** After 3 rounds, escalate to user.

### REJECT 🛑
1. Stop. Do not commit.
2. Escalate to user with the findings and rationale.
3. User decides: abandon changes, rewrite from scratch, or override.

### Dispute Resolution

If the builder believes a finding is a false positive:
- The builder **must explicitly address it** in the revision — explain why it's a false positive with evidence (code references, execution flow analysis)
- The builder **must not ignore** a finding
- If the gatekeeper and builder have a legitimate technical disagreement that cannot be resolved, escalate to user:
  ```
  ⚠️ Dispute: Builder believes [X], Gatekeeper believes [Y].
  User decision required.
  ```

### Caveats vs Findings

- **Findings** = must fix (blocks PASS)
- **Caveats** = non-blocking observations (tracked as tech debt, mentioned in PROGRESS.md)
- Gatekeeper may PASS with caveats — these are informational, not blockers

---

## Index Staleness Handling

Before Phase 2, check GitNexus index freshness via `gitnexus://repo/{name}/context`:

- **Fresh index**: Full 5-gate review
- **Stale index**: Warn user. Skip G1 (impact verification) and note reduced confidence. Still run G2-G5.
- **No index**: Run G2-G5 only. Tell user that impact analysis was unavailable.

---

## Quick Reference

```
/adversarial-dev <task description>

Phase 1 (Builder):   Impact → Explore → Implement → Verify → Test → Handoff
Phase 2 (Gatekeeper): Detect → Impact → 5 Gates → Verdict
Loop:                 REVISE → back to Phase 1 (max 3 rounds)
Exit:                 PASS → commit | REJECT → user decides
```
