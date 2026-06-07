---
name: browse
description: "Skill for the Browse area of Speaking-. 6 symbols across 1 files."
---

# Browse

6 symbols | 1 files | Cohesion: 71%

## When to Use

- Working with code in `frontend/`
- Understanding how BrowsePage, fetchFeed, startLearning work
- Modifying browse-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/app/(main)/browse/page.tsx` | categoryLabel, BrowsePage, fetchFeed, startLearning, formatDuration (+1) |

## Entry Points

Start here when exploring this area:

- **`BrowsePage`** (Function) — `frontend/src/app/(main)/browse/page.tsx:39`
- **`fetchFeed`** (Function) — `frontend/src/app/(main)/browse/page.tsx:57`
- **`startLearning`** (Function) — `frontend/src/app/(main)/browse/page.tsx:81`
- **`formatDuration`** (Function) — `frontend/src/app/(main)/browse/page.tsx:89`
- **`formatViews`** (Function) — `frontend/src/app/(main)/browse/page.tsx:90`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `BrowsePage` | Function | `frontend/src/app/(main)/browse/page.tsx` | 39 |
| `fetchFeed` | Function | `frontend/src/app/(main)/browse/page.tsx` | 57 |
| `startLearning` | Function | `frontend/src/app/(main)/browse/page.tsx` | 81 |
| `formatDuration` | Function | `frontend/src/app/(main)/browse/page.tsx` | 89 |
| `formatViews` | Function | `frontend/src/app/(main)/browse/page.tsx` | 90 |
| `categoryLabel` | Function | `frontend/src/app/(main)/browse/page.tsx` | 35 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `BrowsePage → GetToken` | cross_community | 4 |
| `StartLearning → GetToken` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Video | 3 calls |
| Components | 1 calls |

## How to Explore

1. `gitnexus_context({name: "BrowsePage"})` — see callers and callees
2. `gitnexus_query({query: "browse"})` — find related execution flows
3. Read key files listed above for implementation details
