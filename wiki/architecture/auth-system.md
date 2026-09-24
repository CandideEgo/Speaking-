---
title: Auth System
tags: [architecture, auth, security, jwt]
status: active
confidence: verified
related_code: [auth, frontend-stores, frontend-api-client]
related: [wiki/architecture/backend-services.md]
created: 2026-07-21
updated: 2026-07-25
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
| `check_video_access` / `require_video_access` | Official videos are public; user-submitted require ownership |

# Dual Auth Sessions (Frontend)

User app and admin console use separate localStorage token keys (`seeword_token` vs `seeword_admin_*`). Both use the same backend JWT/role system but independent sessions. Logging out of one doesn't affect the other.

authStore and adminAuthStore have similar patterns (auto-refresh, mutex) but are separate implementations; the request loop they share lives in `lib/createApiClient.ts`, which each store reaches through an auth adapter.

# Frontend API Client (`lib/createApiClient.ts`, re-exported by `lib/api.ts` / `lib/adminApi.ts`)

Custom `api<T>(path, options)` with: auto JWT attachment, pre-request token expiry check with auto-refresh, 401 handling (only for requests that actually carried a token — see `sentWithAuth`), `ApiError` class with status + server error code, `mediaUrl()` helper for `/media/` paths.

The 401 branch only refreshes when the request carried an `Authorization` header. Without one, the 401 is the server rejecting the request itself (e.g. a wrong password on `/login`) and is thrown to the caller to display — refreshing there would instead log out and hard-redirect, wiping the server's message before it rendered.

# Frontend State (Zustand)

6 stores in `frontend/src/stores/`:

| Store | Responsibility |
|-------|---------------|
| `authStore.ts` | JWT auth with auto-refresh on expiry. Mutex on refresh to prevent duplicate calls. |
| `adminAuthStore.ts` | Separate admin auth. |
| `profileStore.ts` | The `/users/me` fields the JWT omits (`avatar_url`, `gender`). One cache shared by TopBar (reader) and the profile page (writer) — fetched once per session, de-duplicated, reset on logout. |
| `watchStore.ts` | Video player UI state (subtitle mode, panel collapse/width, exam level for word highlighting). |
| `vocabularyStore.ts` | Word list, stats, quiz sessions, SM-2 review actions. |
| `planStore.ts` | Daily learning plan state (ADR-0012). Today's plan, progress, plan items. |

# Future Notes

- New permission checks should use existing dependencies, not hand-written logic in routes
- Pro check must examine both `plan` and `plan_expires_at`
- Beat task proactively downgrades expired users to free
- Previous documentation referenced `communityStore`, `feedStore` and a `createAuthStore` factory — none exist now. Feed state lives in the `usePlatformFeed` hook (per page), not in a store; the shared auth-store factory was never built.
