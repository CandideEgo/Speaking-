---
title: Auth System
tags: [architecture, auth, security, jwt]
status: active
confidence: verified
related_code: [auth, frontend-stores, frontend-api-client]
related: [wiki/architecture/backend-services.md]
created: 2026-07-21
updated: 2026-09-28
---

# Background

SeeWord uses JWT authentication with dual sessions for user and admin.

# Auth Dependencies (`api/dependencies.py`)

| Dependency | Behavior |
|------------|----------|
| `get_current_user` | JWT decode + blacklist check + password-change staleness check + DB user fetch |
| `get_optional_user` | Same but returns `None` instead of 401 (public pages with optional auth) |
| `get_admin_user` | Stacks on `get_current_user`, checks `role == admin` |
| `require_pro_user` | Checks plan type and expiry |

Video access control is not a route dependency: `check_video_access` / `check_video_access_by_owner` /
`should_use_snapshot` live in `services/video_access.py` as pure domain functions (the old
`require_video_access` is gone).

# Dual Auth Sessions (Frontend)

User app and admin console use separate localStorage token keys (`seeword_token` vs `seeword_admin_*`). Both use the same backend JWT/role system but independent sessions. Logging out of one doesn't affect the other.

authStore and adminAuthStore have similar patterns (auto-refresh, mutex) but are separate implementations; the request loop they share lives in `lib/createApiClient.ts`, and each store is wired to it through its own auth adapter (`userAuthAdapter` in `lib/api.ts`, `adminAuthAdapter` in `lib/adminApi.ts`).

# Frontend API Client (`lib/createApiClient.ts`, re-exported by `lib/api.ts` / `lib/adminApi.ts`)

Custom `api<T>(path, options)` with: auto JWT attachment, pre-request token expiry check with auto-refresh, 401 handling (only for requests that actually carried a token — see `sentWithAuth`), `ApiError` class with status + server error code, `mediaUrl()` helper for `/media/` paths.

The 401 branch only refreshes when the request carried an `Authorization` header. Without one, the 401 is the server rejecting the request itself (e.g. a wrong password on `/login`) and is thrown to the caller to display — refreshing there would instead log out and hard-redirect, wiping the server's message before it rendered.

# Login Wall and the Cookie Mirror (`proxy.ts` + `lib/authHelpers.ts`)

`proxy.ts` (Next 16's middleware; renamed from `middleware.ts`) gates every route at the network
edge. It reads cookies only — no JWT decode, no DB — so its predicate is exactly *"the
`seeword_token` cookie exists and is non-empty"*. `PUBLIC_PATHS` early-returns; `/admin/*` checks its
own `seeword_admin_token` cookie and 302s to `/admin/login`; everything else 302s to `/login?next=<path>`.
An **empty** value bounces, because the check is `if (!token)`.

localStorage stays the source of truth for the app; the cookie is a **presence-only mirror**, written
by `syncAuthCookie(name, token)` and read back by `hasAuthCookieMirror(name)`. Both sides require a
non-empty value, so they agree with the middleware by construction.

Two things to know before touching either side:

- **The mirror self-heals.** `authStore.initialize()` re-mirrors from the valid token on *every* page
  load (`stores/authStore.ts:266`), so a cookie cleared on its own comes back. The only way it stays
  missing is that the browser **refused the write** (privacy mode, blocked storage). That is what
  makes a synchronous read a sound oracle rather than a guess.
- **Do not judge "stuck" by elapsed time.** `useRedirectIfAuthenticated` reads the cookie
  synchronously and skips the redirect entirely when it is missing, instead of firing a navigation
  already known to bounce. A timer-based version was tried and reverted: it cannot tell a blocked
  cookie from a merely slow RSC navigation, and `e2e/login-white-screen.spec.ts` asserts the spinner
  must persist across a slow one. The hook reads in an effect, not during render — `initialize()`
  calls `set(...)` *before* `syncAuthCookie(...)`, so a render-time read would depend on React's
  batching order.

Regression coverage: `e2e/login-redirect-loop.spec.ts` covers both directions (missing mirror →
recovery card and zero doomed navigations; present mirror + held navigation → spinner persists, no
card), and `src/lib/authHelpers.test.ts` pins the parse rules including the empty-value case.

# Frontend State (Zustand)

6 stores in `frontend/src/stores/`:

| Store | Responsibility |
|-------|---------------|
| `authStore.ts` | JWT auth with auto-refresh on expiry. Mutex on refresh to prevent duplicate calls. |
| `adminAuthStore.ts` | Separate admin auth. |
| `profileStore.ts` | The `/users/me` fields the JWT omits (`avatar_url`, `gender`). One cache shared by TopBar (reader) and the profile page (writer) — fetched once per session, de-duplicated, reset on logout. |
| `watchStore.ts` | Video player UI state (subtitle mode, panel collapse/width, exam level for word highlighting). |
| `vocabularyStore.ts` | Vocabulary stats only (`/vocabulary/stats`): the due-count badge TopBar / MobileTabBar share. Word CRUD and review live in page state. |
| `planStore.ts` | Learning-profile cache (ADR-0012): `/plan/profile` plus a forced `/plan/profile/refresh`, consumed through `usePlan`. |

# Future Notes

- New permission checks should use existing dependencies, not hand-written logic in routes
- Pro check must examine both `plan` and `plan_expires_at`
- Pro is not enforced during the 内测 free period: `require_pro_user` has no callers, and the `downgrade-expired-pro` beat entry is commented out in `tasks/celery_app.py`. Both are kept for when charging starts.
- Previous documentation referenced `communityStore`, `feedStore` and a `createAuthStore` factory — none exist now. Feed state lives in the `usePlatformFeed` hook (per page), not in a store; the shared auth-store factory was never built.
