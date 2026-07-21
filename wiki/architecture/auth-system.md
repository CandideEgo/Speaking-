---
title: Auth System
tags: [architecture, auth, security, jwt]
status: active
confidence: verified
related_code: [auth-deps, frontend-stores, api-client]
related: [wiki/architecture/backend-services.md]
created: 2026-07-21
updated: 2026-07-22
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

authStore and adminAuthStore have similar patterns (auto-refresh, mutex) but are separate implementations — no shared factory currently.

# Frontend API Client (`lib/api.ts`)

Custom `api<T>(path, options)` with: auto JWT attachment, pre-request token expiry check with auto-refresh, 401 handling (refresh → retry → logout), `ApiError` class with status + server error code, `mediaUrl()` helper for `/media/` paths.

# Frontend State (Zustand)

5 stores in `frontend/src/stores/`:

| Store | Responsibility |
|-------|---------------|
| `authStore.ts` | JWT auth with auto-refresh on expiry. Mutex on refresh to prevent duplicate calls. |
| `adminAuthStore.ts` | Separate admin auth. |
| `feedStore.ts` | Home feed recommendation (ADR-0011). Caches feed, tracks seen videos for de-prioritization. `seenIds` persists to localStorage. |
| `watchStore.ts` | Video player UI state (subtitle mode, panel collapse/width, exam level for word highlighting). |
| `vocabularyStore.ts` | Word list, stats, quiz sessions, SM-2 review actions. |

# Future Notes

- New permission checks should use existing dependencies, not hand-written logic in routes
- Pro check must examine both `plan` and `plan_expires_at`
- Beat task proactively downgrades expired users to free
- Previous documentation referenced `communityStore` and `createAuthStore` factory — both no longer exist. `communityStore` was replaced by `feedStore` (ADR-0011). `createAuthStore` factory was planned but not implemented.
