---
name: video
description: "Skill for the Video area of Speaking-. 26 symbols across 12 files."
---

# Video

26 symbols | 12 files | Cohesion: 80%

## When to Use

- Working with code in `frontend/`
- Understanding how setToken, getToken, api work
- Modifying video-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/app/(main)/admin/page.tsx` | AdminPage, handleSeed, handleGenerate, loadCodes, exportCsv |
| `frontend/src/app/(main)/watch/[id]/page.tsx` | interval, saveToVocabulary, requireAuth, submitQuiz |
| `frontend/src/lib/api.ts` | setToken, getToken, api |
| `frontend/src/components/video/AIStatsPanel.tsx` | AIStatsPanel, handleUpgrade, loadAIData |
| `frontend/src/components/video/YouTubeSearch.tsx` | YouTubeSearch, handleSearch, addFromSearch |
| `frontend/src/app/(main)/redeem/page.tsx` | RedeemPage, handleRedeem |
| `frontend/src/app/(main)/dashboard/page.tsx` | DashboardPage |
| `frontend/src/app/(main)/page.tsx` | HomePage |
| `frontend/src/app/login/page.tsx` | handleSubmit |
| `frontend/src/app/register/page.tsx` | handleSubmit |

## Entry Points

Start here when exploring this area:

- **`setToken`** (Function) — `frontend/src/lib/api.ts:13`
- **`getToken`** (Function) — `frontend/src/lib/api.ts:22`
- **`api`** (Function) — `frontend/src/lib/api.ts:30`
- **`AdminPage`** (Function) — `frontend/src/app/(main)/admin/page.tsx:19`
- **`handleSeed`** (Function) — `frontend/src/app/(main)/admin/page.tsx:46`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `setToken` | Function | `frontend/src/lib/api.ts` | 13 |
| `getToken` | Function | `frontend/src/lib/api.ts` | 22 |
| `api` | Function | `frontend/src/lib/api.ts` | 30 |
| `AdminPage` | Function | `frontend/src/app/(main)/admin/page.tsx` | 19 |
| `handleSeed` | Function | `frontend/src/app/(main)/admin/page.tsx` | 46 |
| `handleGenerate` | Function | `frontend/src/app/(main)/admin/page.tsx` | 58 |
| `loadCodes` | Function | `frontend/src/app/(main)/admin/page.tsx` | 72 |
| `exportCsv` | Function | `frontend/src/app/(main)/admin/page.tsx` | 79 |
| `DashboardPage` | Function | `frontend/src/app/(main)/dashboard/page.tsx` | 12 |
| `HomePage` | Function | `frontend/src/app/(main)/page.tsx` | 9 |
| `RedeemPage` | Function | `frontend/src/app/(main)/redeem/page.tsx` | 7 |
| `handleRedeem` | Function | `frontend/src/app/(main)/redeem/page.tsx` | 15 |
| `interval` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 70 |
| `saveToVocabulary` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 173 |
| `requireAuth` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 187 |
| `submitQuiz` | Function | `frontend/src/app/(main)/watch/[id]/page.tsx` | 212 |
| `handleSubmit` | Function | `frontend/src/app/login/page.tsx` | 15 |
| `handleSubmit` | Function | `frontend/src/app/register/page.tsx` | 16 |
| `submitForFeedback` | Function | `frontend/src/components/speaking/SpeakingPanel.tsx` | 90 |
| `AIStatsPanel` | Function | `frontend/src/components/video/AIStatsPanel.tsx` | 22 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `VocabularyPage → GetToken` | cross_community | 5 |
| `BrowsePage → GetToken` | cross_community | 4 |
| `CommunityPage → GetToken` | cross_community | 4 |
| `AdminPage → GetToken` | intra_community | 4 |
| `HandleNextSubtitle → GetToken` | cross_community | 4 |
| `HandleReview → GetToken` | cross_community | 4 |
| `YouTubeSearch → GetToken` | intra_community | 4 |
| `WatchPage → GetToken` | cross_community | 3 |
| `DashboardPage → GetToken` | intra_community | 3 |
| `HandleSubmit → GetToken` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Components | 1 calls |

## How to Explore

1. `gitnexus_context({name: "setToken"})` — see callers and callees
2. `gitnexus_query({query: "video"})` — find related execution flows
3. Read key files listed above for implementation details
