---
name: id
description: "Skill for the [id] area of Speaking-. 12 symbols across 4 files."
---

# [id]

12 symbols | 4 files | Cohesion: 84%

## When to Use

- Working with code in `frontend/`
- Understanding how mediaUrl, useWatchStore, WatchPage work
- Modifying [id]-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/app/(main)/watch/[id]/page.tsx` | WatchPage, handleKey, togglePlayPause, seekBy, navigateSubtitle (+4) |
| `frontend/src/lib/api.ts` | mediaUrl |
| `frontend/src/stores/watchStore.ts` | useWatchStore |
| `frontend/src/components/SubtitleModeTabs.tsx` | SubtitleModeTabs |

## Entry Points

Start here when exploring this area:

- **`mediaUrl`** (Function) — `frontend/src/lib/api.ts:6`
- **`useWatchStore`** (Function) — `frontend/src/stores/watchStore.ts:9`
- **`WatchPage`** (Function) — `frontend/src/app/(main)/watch/[id]/page.tsx:25`
- **`handleKey`** (Function) — `frontend/src/app/(main)/watch/[id]/page.tsx:99`
- **`togglePlayPause`** (Function) — `frontend/src/app/(main)/watch/[id]/page.tsx:113`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `mediaUrl` | Function | `frontend/src/lib/api.ts` | 6 |
| `useWatchStore` | Function | `frontend/src/stores/watchStore.ts` | 9 |
| `WatchPage` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 25 |
| `handleKey` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 99 |
| `togglePlayPause` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 113 |
| `seekBy` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 123 |
| `navigateSubtitle` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 132 |
| `seekTo` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 139 |
| `handleWordClick` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 149 |
| `handleStartSpeaking` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 192 |
| `handleNextSubtitle` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 197 |
| `SubtitleModeTabs` | Function | `frontend/src/components/SubtitleModeTabs.tsx` | 19 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleNextSubtitle → GetToken` | cross_community | 4 |
| `WatchPage → GetToken` | cross_community | 3 |
| `HandleKey → SeekTo` | intra_community | 3 |
| `HandleWordClick → GetToken` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Video | 3 calls |
| Components | 2 calls |

## How to Explore

1. `gitnexus_context({name: "mediaUrl"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
