---
title: Frontend Architecture
tags: [architecture, frontend, nextjs, react, tailwind]
status: active
confidence: verified
related_code: [frontend-app, frontend-components, frontend-stores, frontend-lib, frontend-hooks]
related: [knowledge/wiki/architecture/auth-system.md]
created: 2026-07-21
updated: 2026-09-28
---

# Background

Frontend: Next.js 16 (App Router) + React 19 + Tailwind CSS v4 (CSS-first, no tailwind.config) + Zustand v5.

Scope: this page covers cross-cutting concerns only — stack, dark mode, design system, watch-page
playback state. It does not describe individual pages or flows (home feed, rankings, word-card
lookup, auth, practice); those live in `knowledge/CHANGELOG.md` and their own feature docs.

# Directory Structure

```
frontend/src/
├── app/          # Next.js App Router pages
├── components/   # Shared components
├── hooks/        # Custom hooks (useVideoPlayer, useWordLookup, usePlatformFeed, ...)
├── lib/          # Utilities (api.ts, createApiClient.ts, authHelpers.ts, siteConfig.ts, chart-theme.ts, topicCategories.ts)
├── stores/       # Zustand stores
├── types/        # TypeScript interfaces (index.ts + platform.ts, ~670 lines)
└── proxy.ts      # Next 16 proxy: login wall + admin-session split
```

# Dark Mode

- `globals.css` semantic tokens + `.dark` variable block
- Semantic tokens are the default: one `.dark` block flips the `var()` values, so components need no per-theme class. `dark:` variants are the documented escape hatch for what tokens cannot express: functional multi-colour chips (the bulk of the occurrences), one `.dark .b-hero` override in `globals.css`, and `Avatar`'s `dark:invert` on the default illustrations — line art on a flat cream ground, which no token can recolour
- `layout.tsx` inline script before first paint prevents FOUC
- `bg-ink` is theme-aware (`--ink` flips to near-white in dark mode) — it must be paired with
  `text-canvas`, never `text-white`, as `Button` / `TabPills` / `HomeFilterBar` do

# Design System

- Unified component library with watch page as style anchor
- coral/cream/brand color scheme
- New components must use semantic tokens (`bg-surface`/`text-primary`), never hardcoded color values
- 动效一律走 CSS：`globals.css` 的 `animate-*` 工具类 + keyframes（`fade-in` / `fade-slide-in` /
  `check-pop` / `complete-flash` / `shake`），不引入新的 JS 动效库——GSAP 现在只剩 `ScrollReveal` 一处
  按需 `import()`（它曾挂在每个主页面，把整包拉进共享 chunk，见 `PageTransition` 注释），纯 CSS
  keyframes 效果相同、零 JS 成本。新动效先复用既有 keyframes，判定时刻（答对/答错、完成）是首选落点

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

# Navigation, URL State and Scrolling

The app shell (`MainLayoutInner`) locks `<html>` and scrolls its inner `<main>` instead, so on every
authenticated page `window.scrollY` / `window.scrollTo` are **no-ops** — and Next's built-in scroll
restoration, which targets `window`, is inert along with them. Any scroll memory must address that
`<main>` (`SCROLL_CONTAINER_ID` in `lib/scrollMemory.ts`); `useScrollRestore` is the only entry point
and it is opt-in per list page, not global.

The home and browse feeds keep `category / level / sort` in the URL as the single source of truth
(`usePlatformFeed` derives them from `useSearchParams`, the setters `router.replace`). Two
consequences: changing a filter is now a soft navigation, so anything that has to survive one must
live in the URL too; and since a page calling `useSearchParams` needs a `<Suspense>` boundary or
`next build` fails, home/browse wrap **only** the feed section — the greeting and stat strip stay
prerendered.

Every link into `/watch/{id}` carries a `?from=` source marker (`lib/watchEntry.ts`; an enum, never a
free-form return URL). The watch page resolves it to a target + label and returns with
`router.replace`, never `push` — `push` builds the loop 首页 → 播放页 → 首页 → 浏览器后退 → 播放页.
A new entry surface must pass its own marker, or the return button silently degrades to `history.back()`.
The same builder emits deep links for locating a sentence on arrival: `?sub=`/`?word=` (fallback `?t=`)
— the word→sentence chain, documented in `exam-vocabulary.md` (S7).

# Future Notes

- Tailwind v4 is CSS-first — do NOT create `tailwind.config.js`
- `lib/topicCategories.ts` is the single source for topic id → 中文标签; the home filter bar (`HomeFilterBar`, via its own `CategoryDropdown`/`SortDropdown` — `TabPills` survives only for the difficulty pills) and card chips (`VideoCard`) both read it, and its ids must stay in sync with the backend taxonomy `services/video_classification.TOPIC_CATEGORIES`. `VideoCard` displays only the first (primary) tag of the comma-separated `topic_tags`. `topicLabel` normalises case and whitespace before lookup (`"TED"` → 「TED 演讲」), returns 「综合」 only for an **empty** value, and passes an unknown or legacy free-text tag through unchanged (admin-entered tags stay readable).
- authStore and adminAuthStore are separate implementations — no shared factory (`createAuthStore` was planned but not implemented). They do share `lib/authHelpers.ts` (token-key migration, cookie sync, `deriveAuthenticated`).
- 图片可直接 `Read` 或粘贴进会话（2026-09-25 起模型支持图片，旧的 `/image-vision` 绕行已移除）；仅历史会话残留 image block 时才需恢复，步骤见 `knowledge/wiki/guides/agent-image-handling.md`
