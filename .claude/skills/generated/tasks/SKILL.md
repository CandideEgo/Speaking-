---
name: tasks
description: "Skill for the Tasks area of Speaking-. 17 symbols across 2 files."
---

# Tasks

17 symbols | 2 files | Cohesion: 98%

## When to Use

- Working with code in `backend/`
- Understanding how get_settings, process_video, process_video_lightweight work
- Modifying tasks-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/tasks/video_processing.py` | _get_ai_service, _translate_subtitles, process_video, _process, process_video_lightweight (+11) |
| `backend/app/core/config.py` | get_settings |

## Entry Points

Start here when exploring this area:

- **`get_settings`** (Function) — `backend/app/core/config.py:69`
- **`process_video`** (Function) — `backend/app/tasks/video_processing.py:59`
- **`process_video_lightweight`** (Function) — `backend/app/tasks/video_processing.py:154`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `get_settings` | Function | `backend/app/core/config.py` | 69 |
| `process_video` | Function | `backend/app/tasks/video_processing.py` | 59 |
| `process_video_lightweight` | Function | `backend/app/tasks/video_processing.py` | 154 |
| `_get_ai_service` | Function | `backend/app/tasks/video_processing.py` | 36 |
| `_translate_subtitles` | Function | `backend/app/tasks/video_processing.py` | 43 |
| `_process` | Function | `backend/app/tasks/video_processing.py` | 66 |
| `_extract_video_info` | Function | `backend/app/tasks/video_processing.py` | 241 |
| `_download_video` | Function | `backend/app/tasks/video_processing.py` | 276 |
| `_transcode_video` | Function | `backend/app/tasks/video_processing.py` | 325 |
| `_get_video_height` | Function | `backend/app/tasks/video_processing.py` | 389 |
| `_extract_subtitles` | Function | `backend/app/tasks/video_processing.py` | 411 |
| `_sync_extract` | Function | `backend/app/tasks/video_processing.py` | 249 |
| `_parse_json3` | Function | `backend/app/tasks/video_processing.py` | 468 |
| `_parse_subtitle_file` | Function | `backend/app/tasks/video_processing.py` | 496 |
| `_parse_webvtt` | Function | `backend/app/tasks/video_processing.py` | 505 |
| `_parse_srt` | Function | `backend/app/tasks/video_processing.py` | 614 |
| `_ts_to_seconds` | Function | `backend/app/tasks/video_processing.py` | 638 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Process_video → _chat` | cross_community | 5 |
| `Process_video → _extract_json` | cross_community | 5 |
| `Process_video_lightweight → _chat` | cross_community | 5 |
| `Process_video_lightweight → _extract_json` | cross_community | 5 |
| `Process_video → Get_settings` | intra_community | 4 |
| `Process_video → _get_ai_service` | intra_community | 4 |
| `Process_video_lightweight → Get_settings` | intra_community | 4 |
| `Process_video_lightweight → _get_ai_service` | intra_community | 4 |
| `_sync_extract → _ts_to_seconds` | intra_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 1 calls |

## How to Explore

1. `gitnexus_context({name: "get_settings"})` — see callers and callees
2. `gitnexus_query({query: "tasks"})` — find related execution flows
3. Read key files listed above for implementation details
