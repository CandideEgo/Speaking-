---
name: hooks
description: "Skill for the Hooks area of Speaking-. 7 symbols across 1 files."
---

# Hooks

7 symbols | 1 files | Cohesion: 92%

## When to Use

- Working with code in `frontend/`
- Understanding how useTheme, handler, setTheme work
- Modifying hooks-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/hooks/useTheme.ts` | getSystemTheme, getStoredTheme, applyThemeClass, useTheme, handler (+2) |

## Entry Points

Start here when exploring this area:

- **`useTheme`** (Function) — `frontend/src/hooks/useTheme.ts:26`
- **`handler`** (Function) — `frontend/src/hooks/useTheme.ts:45`
- **`setTheme`** (Function) — `frontend/src/hooks/useTheme.ts:60`
- **`toggleTheme`** (Function) — `frontend/src/hooks/useTheme.ts:66`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useTheme` | Function | `frontend/src/hooks/useTheme.ts` | 26 |
| `handler` | Function | `frontend/src/hooks/useTheme.ts` | 45 |
| `setTheme` | Function | `frontend/src/hooks/useTheme.ts` | 60 |
| `toggleTheme` | Function | `frontend/src/hooks/useTheme.ts` | 66 |
| `getSystemTheme` | Function | `frontend/src/hooks/useTheme.ts` | 6 |
| `getStoredTheme` | Function | `frontend/src/hooks/useTheme.ts` | 11 |
| `applyThemeClass` | Function | `frontend/src/hooks/useTheme.ts` | 18 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RootLayout → GetStoredTheme` | cross_community | 4 |
| `RootLayout → GetSystemTheme` | cross_community | 4 |
| `RootLayout → ApplyThemeClass` | cross_community | 4 |
| `ToggleTheme → ApplyThemeClass` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "useTheme"})` — see callers and callees
2. `gitnexus_query({query: "hooks"})` — find related execution flows
3. Read key files listed above for implementation details
