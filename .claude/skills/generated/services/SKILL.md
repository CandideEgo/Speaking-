---
name: services
description: "Skill for the Services area of Speaking-. 13 symbols across 3 files."
---

# Services

13 symbols | 3 files | Cohesion: 89%

## When to Use

- Working with code in `backend/`
- Understanding how submit_speaking, evaluate_speaking, translate_batch work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/services/ai_service.py` | _chat, translate_batch, grammar_analyze_batch, evaluate_difficulty, generate_quiz (+3) |
| `backend/app/services/speaking_service.py` | evaluate_speaking, _whisper_transcribe, _get_whisper_model, _sync |
| `backend/app/api/v1/speaking.py` | submit_speaking |

## Entry Points

Start here when exploring this area:

- **`submit_speaking`** (Function) — `backend/app/api/v1/speaking.py:22`
- **`evaluate_speaking`** (Function) — `backend/app/services/speaking_service.py:23`
- **`translate_batch`** (Method) — `backend/app/services/ai_service.py:33`
- **`grammar_analyze_batch`** (Method) — `backend/app/services/ai_service.py:51`
- **`evaluate_difficulty`** (Method) — `backend/app/services/ai_service.py:69`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `submit_speaking` | Function | `backend/app/api/v1/speaking.py` | 22 |
| `evaluate_speaking` | Function | `backend/app/services/speaking_service.py` | 23 |
| `translate_batch` | Method | `backend/app/services/ai_service.py` | 33 |
| `grammar_analyze_batch` | Method | `backend/app/services/ai_service.py` | 51 |
| `evaluate_difficulty` | Method | `backend/app/services/ai_service.py` | 69 |
| `generate_quiz` | Method | `backend/app/services/ai_service.py` | 81 |
| `pronunciation_feedback` | Method | `backend/app/services/ai_service.py` | 95 |
| `extract_difficulty_words` | Method | `backend/app/services/ai_service.py` | 120 |
| `_whisper_transcribe` | Function | `backend/app/services/speaking_service.py` | 64 |
| `_get_whisper_model` | Function | `backend/app/services/speaking_service.py` | 14 |
| `_sync` | Function | `backend/app/services/speaking_service.py` | 70 |
| `_chat` | Method | `backend/app/services/ai_service.py` | 18 |
| `_extract_json` | Method | `backend/app/services/ai_service.py` | 154 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Process_video → _chat` | cross_community | 5 |
| `Process_video → _extract_json` | cross_community | 5 |
| `Process_video_lightweight → _chat` | cross_community | 5 |
| `Process_video_lightweight → _extract_json` | cross_community | 5 |
| `Submit_speaking → _chat` | intra_community | 4 |
| `Submit_speaking → _extract_json` | intra_community | 4 |
| `Assistant_summary → _chat` | cross_community | 3 |
| `Word_lookup → _chat` | cross_community | 3 |
| `Assistant_recommend → _chat` | cross_community | 3 |
| `Submit_speaking → _whisper_transcribe` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "submit_speaking"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
