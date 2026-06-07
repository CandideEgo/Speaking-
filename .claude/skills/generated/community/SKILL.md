---
name: community
description: "Skill for the Community area of Speaking-. 6 symbols across 1 files."
---

# Community

6 symbols | 1 files | Cohesion: 71%

## When to Use

- Working with code in `frontend/`
- Understanding how CommunityPage, fetchFeed, startLearning work
- Modifying community-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/app/(main)/community/page.tsx` | categoryLabel, CommunityPage, fetchFeed, startLearning, formatDuration (+1) |

## Entry Points

Start here when exploring this area:

- **`CommunityPage`** (Function) — `frontend/src/app/(main)/community/page.tsx:39`
- **`fetchFeed`** (Function) — `frontend/src/app/(main)/community/page.tsx:57`
- **`startLearning`** (Function) — `frontend/src/app/(main)/community/page.tsx:81`
- **`formatDuration`** (Function) — `frontend/src/app/(main)/community/page.tsx:89`
- **`formatViews`** (Function) — `frontend/src/app/(main)/community/page.tsx:90`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CommunityPage` | Function | `frontend/src/app/(main)/community/page.tsx` | 39 |
| `fetchFeed` | Function | `frontend/src/app/(main)/community/page.tsx` | 57 |
| `startLearning` | Function | `frontend/src/app/(main)/community/page.tsx` | 81 |
| `formatDuration` | Function | `frontend/src/app/(main)/community/page.tsx` | 89 |
| `formatViews` | Function | `frontend/src/app/(main)/community/page.tsx` | 90 |
| `categoryLabel` | Function | `frontend/src/app/(main)/community/page.tsx` | 35 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CommunityPage → GetToken` | cross_community | 4 |
| `StartLearning → GetToken` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Video | 3 calls |
| Components | 1 calls |

## How to Explore

1. `gitnexus_context({name: "CommunityPage"})` — see callers and callees
2. `gitnexus_query({query: "community"})` — find related execution flows
3. Read key files listed above for implementation details
