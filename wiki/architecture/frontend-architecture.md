---
title: Frontend Architecture
tags: [architecture, frontend, nextjs, react, tailwind]
status: active
confidence: verified
related_code: [frontend-app, frontend-stores, frontend-lib]
related: [wiki/architecture/auth-system.md]
created: 2026-07-21
updated: 2026-07-21
---

# Background

Frontend: Next.js 16 (App Router) + React 19 + Tailwind CSS v4 (CSS-first, no tailwind.config) + Zustand v5.

# Directory Structure

```
frontend/src/
├── app/          # Next.js App Router pages
├── components/   # Shared components
├── hooks/        # Custom hooks (useVideoPlayer, useQuiz, etc.)
├── lib/          # Utilities (api.ts, apiUrl.ts, siteConfig.ts, chart-theme.ts)
├── stores/       # Zustand stores
└── types/        # TypeScript interfaces (~365 lines)
```

# Dark Mode

- `globals.css` semantic tokens + `.dark` variable block
- One `.dark` block cascades entire site, components zero changes
- `layout.tsx` inline script before first paint prevents FOUC
- `bg-ink` semantic trap resolved (darkest surface migrated to `bg-surface-dark`)

# Design System

- Unified component library with watch page as style anchor
- coral/cream/brand color scheme
- New components must use semantic tokens (`bg-surface`/`text-primary`), never hardcoded color values

# Future Notes

- Tailwind v4 is CSS-first — do NOT create `tailwind.config.js`
- New stores should reference `createAuthStore` factory pattern
- Images must NOT be pasted into agent conversations (see wiki/problems/image-handling.md)
