---
name: vocabulary
description: "Skill for the Vocabulary area of Speaking-. 4 symbols across 1 files."
---

# Vocabulary

4 symbols | 1 files | Cohesion: 67%

## When to Use

- Working with code in `frontend/`
- Understanding how VocabularyPage, loadWords, handleReview work
- Modifying vocabulary-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/app/(main)/vocabulary/page.tsx` | VocabularyPage, loadWords, handleReview, handleDelete |

## Entry Points

Start here when exploring this area:

- **`VocabularyPage`** (Function) — `frontend/src/app/(main)/vocabulary/page.tsx:27`
- **`loadWords`** (Function) — `frontend/src/app/(main)/vocabulary/page.tsx:40`
- **`handleReview`** (Function) — `frontend/src/app/(main)/vocabulary/page.tsx:49`
- **`handleDelete`** (Function) — `frontend/src/app/(main)/vocabulary/page.tsx:56`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `VocabularyPage` | Function | `frontend/src/app/(main)/vocabulary/page.tsx` | 27 |
| `loadWords` | Function | `frontend/src/app/(main)/vocabulary/page.tsx` | 40 |
| `handleReview` | Function | `frontend/src/app/(main)/vocabulary/page.tsx` | 49 |
| `handleDelete` | Function | `frontend/src/app/(main)/vocabulary/page.tsx` | 56 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `VocabularyPage → GetToken` | cross_community | 5 |
| `HandleReview → GetToken` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Video | 4 calls |
| Components | 1 calls |

## How to Explore

1. `gitnexus_context({name: "VocabularyPage"})` — see callers and callees
2. `gitnexus_query({query: "vocabulary"})` — find related execution flows
3. Read key files listed above for implementation details
