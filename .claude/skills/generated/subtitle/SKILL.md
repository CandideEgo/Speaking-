---
name: subtitle
description: "Skill for the Subtitle area of Speaking-. 5 symbols across 3 files."
---

# Subtitle

5 symbols | 3 files | Cohesion: 89%

## When to Use

- Working with code in `frontend/`
- Understanding how formatTime, PlaybackControls, SubtitleList work
- Modifying subtitle-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/components/subtitle/SubtitleList.tsx` | SubtitleList, handleCopy, handleFavorite |
| `frontend/src/lib/utils.ts` | formatTime |
| `frontend/src/components/PlaybackControls.tsx` | PlaybackControls |

## Entry Points

Start here when exploring this area:

- **`formatTime`** (Function) — `frontend/src/lib/utils.ts:7`
- **`PlaybackControls`** (Function) — `frontend/src/components/PlaybackControls.tsx:28`
- **`SubtitleList`** (Function) — `frontend/src/components/subtitle/SubtitleList.tsx:26`
- **`handleCopy`** (Function) — `frontend/src/components/subtitle/SubtitleList.tsx:38`
- **`handleFavorite`** (Function) — `frontend/src/components/subtitle/SubtitleList.tsx:48`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `formatTime` | Function | `frontend/src/lib/utils.ts` | 7 |
| `PlaybackControls` | Function | `frontend/src/components/PlaybackControls.tsx` | 28 |
| `SubtitleList` | Function | `frontend/src/components/subtitle/SubtitleList.tsx` | 26 |
| `handleCopy` | Function | `frontend/src/components/subtitle/SubtitleList.tsx` | 38 |
| `handleFavorite` | Function | `frontend/src/components/subtitle/SubtitleList.tsx` | 48 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Components | 1 calls |

## How to Explore

1. `gitnexus_context({name: "formatTime"})` — see callers and callees
2. `gitnexus_query({query: "subtitle"})` — find related execution flows
3. Read key files listed above for implementation details
