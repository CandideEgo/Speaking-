---
title: Frontend Architecture
tags: [architecture, frontend, nextjs, react, tailwind]
status: active
confidence: verified
related_code: [frontend-app, frontend-stores, frontend-lib]
related: [wiki/architecture/auth-system.md]
created: 2026-07-21
updated: 2026-09-22
---

# Background

Frontend: Next.js 16 (App Router) + React 19 + Tailwind CSS v4 (CSS-first, no tailwind.config) + Zustand v5.

# Directory Structure

```
frontend/src/
├── app/          # Next.js App Router pages
├── components/   # Shared components
├── hooks/        # Custom hooks (useVideoPlayer, useQuiz, etc.)
├── lib/          # Utilities (api.ts, apiUrl.ts, siteConfig.ts, chart-theme.ts, topicCategories.ts)
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

# Watch-Page Playback State

`useVideoPlayer` owns `isPlaying` as the single source of truth for play/pause: native
`play`/`pause` events are the fast path, a 250 ms playback-clock poll is the authority, and that
same poll feeds `onTimeTick`, so subtitles keep advancing. iOS Safari fires spurious `pause`
events and can stop firing `timeupdate` entirely — the poll looks redundant on desktop and is
not: drop it and the subtitle freezes while the play button shows the wrong icon.

Consumers read the hook's `isPlaying`; never re-derive play state from element events inside a
child component. `VideoControls` takes it as a prop and keeps no local `paused` state (that
duplicate was the bug), and polls `currentTime` for the progress bar for the same reason.

iOS compatibility stays inside the hook, not in components: `seekTo` waits for
`loadedmetadata`/`canplay` before assigning `currentTime` — a seek before metadata is silently
dropped — and forces `pause` first; `toggleFullscreen` falls back to `webkitEnterFullscreen`.

# Future Notes

- Tailwind v4 is CSS-first — do NOT create `tailwind.config.js`
- `lib/topicCategories.ts` is the single source for topic id → 中文标签; feed tabs (`usePlatformFeed`) and card chips (`VideoCard`) both read it, and its ids must stay in sync with the backend taxonomy `services/video_classification.TOPIC_CATEGORIES`. `VideoCard` displays only the first (primary) tag of the comma-separated `topic_tags`. `topicLabel` normalises case and whitespace before lookup (`"TED"` → 「TED 演讲」), falls back to 「综合」 for empty/unknown ids, and returns a multi-value string unchanged.
- authStore and adminAuthStore are separate implementations — no shared factory (`createAuthStore` was planned but not implemented)
- Images must NOT be pasted into agent conversations (see wiki/problems/image-handling.md)
