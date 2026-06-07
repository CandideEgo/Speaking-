---
name: components
description: "Skill for the Components area of Speaking-. 39 symbols across 19 files."
---

# Components

39 symbols | 19 files | Cohesion: 83%

## When to Use

- Working with code in `frontend/`
- Understanding how cn, DictationMode, FillBlankMode work
- Modifying components-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `frontend/src/components/Icons.tsx` | MenuIcon, SearchIcon, BellIcon, SunIcon, MoonIcon (+6) |
| `frontend/src/components/SidebarProvider.tsx` | useSidebar, SidebarProvider, setCollapsed, toggle |
| `frontend/src/components/FillBlankMode.tsx` | generateBlanks, FillBlankMode, reset |
| `frontend/src/components/YouTubePlayer.tsx` | loadYouTubeAPI, YouTubePlayer, init |
| `frontend/src/components/FlashcardMode.tsx` | FlashcardMode, speak |
| `frontend/src/components/Sidebar.tsx` | Sidebar, isActive |
| `frontend/src/components/ThemeProvider.tsx` | ThemeProvider, useThemeContext |
| `frontend/src/lib/utils.ts` | cn |
| `frontend/src/components/DictationMode.tsx` | DictationMode |
| `frontend/src/components/ReadingMode.tsx` | ReadingMode |

## Entry Points

Start here when exploring this area:

- **`cn`** (Function) — `frontend/src/lib/utils.ts:3`
- **`DictationMode`** (Function) — `frontend/src/components/DictationMode.tsx:16`
- **`FillBlankMode`** (Function) — `frontend/src/components/FillBlankMode.tsx:41`
- **`reset`** (Function) — `frontend/src/components/FillBlankMode.tsx:69`
- **`FlashcardMode`** (Function) — `frontend/src/components/FlashcardMode.tsx:16`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `cn` | Function | `frontend/src/lib/utils.ts` | 3 |
| `DictationMode` | Function | `frontend/src/components/DictationMode.tsx` | 16 |
| `FillBlankMode` | Function | `frontend/src/components/FillBlankMode.tsx` | 41 |
| `reset` | Function | `frontend/src/components/FillBlankMode.tsx` | 69 |
| `FlashcardMode` | Function | `frontend/src/components/FlashcardMode.tsx` | 16 |
| `speak` | Function | `frontend/src/components/FlashcardMode.tsx` | 32 |
| `ReadingMode` | Function | `frontend/src/components/ReadingMode.tsx` | 18 |
| `SubtitleOverlay` | Function | `frontend/src/components/SubtitleOverlay.tsx` | 14 |
| `TranslateMode` | Function | `frontend/src/components/TranslateMode.tsx` | 16 |
| `QuizPanel` | Function | `frontend/src/components/speaking/QuizPanel.tsx` | 16 |
| `VideoLibrary` | Function | `frontend/src/components/video/VideoLibrary.tsx` | 12 |
| `VideoStatusBadge` | Function | `frontend/src/components/video/VideoStatus.tsx` | 28 |
| `MenuIcon` | Function | `frontend/src/components/Icons.tsx` | 59 |
| `SearchIcon` | Function | `frontend/src/components/Icons.tsx` | 69 |
| `BellIcon` | Function | `frontend/src/components/Icons.tsx` | 78 |
| `SunIcon` | Function | `frontend/src/components/Icons.tsx` | 87 |
| `MoonIcon` | Function | `frontend/src/components/Icons.tsx` | 103 |
| `UserIcon` | Function | `frontend/src/components/Icons.tsx` | 127 |
| `LogOutIcon` | Function | `frontend/src/components/Icons.tsx` | 136 |
| `ShieldIcon` | Function | `frontend/src/components/Icons.tsx` | 146 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RootLayout → GetStoredTheme` | cross_community | 4 |
| `RootLayout → GetSystemTheme` | cross_community | 4 |
| `RootLayout → ApplyThemeClass` | cross_community | 4 |
| `VideoLibrary → Cn` | intra_community | 3 |
| `RootLayout → UseThemeContext` | intra_community | 3 |
| `MainLayout → UseSidebar` | intra_community | 3 |
| `MainLayout → IsActive` | intra_community | 3 |
| `MainLayout → GiftIcon` | intra_community | 3 |
| `MainLayout → SettingsIcon` | intra_community | 3 |
| `MainLayout → UseThemeContext` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Video | 1 calls |
| Hooks | 1 calls |

## How to Explore

1. `gitnexus_context({name: "cn"})` — see callers and callees
2. `gitnexus_query({query: "components"})` — find related execution flows
3. Read key files listed above for implementation details
