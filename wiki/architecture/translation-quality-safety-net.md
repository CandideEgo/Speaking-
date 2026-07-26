---
title: Translation Quality Safety Net
tags: [video, backend, ai, quality]
status: active
confidence: verified
related_code: [video-pipeline, translation, transcription]
related: [.agent/context.md, .agent/decisions.md]
created: 2026-07-23
updated: 2026-07-25
---

# Background

The video pipeline's weakest links are the AI-dependent steps (transcription and translation). WhisperX occasionally hallucinates (repetitive text, nonsense), and translation APIs intermittently fail or return partial results. Before Phase 2, these issues silently entered production.

# What Changed

## 1. Hallucination Detection (transcription callback)

**Location**: `app/services/transcription/quality.py`, integrated into `api/v1/internal.py`

Runs 5 checks on GPU worker callback:
- **repetitive**: same text >30% of segments → hallucination
- **nonsense**: >50% non-linguistic chars in >30% of segments
- **duration**: last subtitle end >1.5× audio duration
- **density**: >40 chars/sec (likely song lyrics or noise)
- **empty_ratio**: >50% empty segments

**Action**: FAIL → mark video `error`, stop pipeline. The admin can inspect and re-trigger.

## 2. Translation Retry with Exponential Backoff

**Location**: `app/services/translation/__init__.py` (`_call_engine`)

- 3 retries, 2s → 4s → 8s backoff
- Permanent errors (4xx, auth) are NOT retried
- JSON parse errors ARE retried (often transient model glitches)
- Layered with existing concurrent dual-engine fan-out

## 3. Translation Quality Gate

**Location**: `app/services/translation/quality.py`, called from `finalize_video`

Checks after translation:
- **Coverage**: ≥80% of subtitles must have translations
- **Mixed CJK/Latin**: ≤20% (catches translation failure leaking source)
- **Short translations**: ≤30% with <3 chars (catches truncation)
- **Length outliers**: translation length within 30%-300% of source

**Action**: WARN (log) but continue — transient issues may resolve on retry.

## 4. Word Levels Preservation

**Location**: `app/tasks/video_processing.py` (annotating step)

Changed from "always recompute" to "compute only when null".

```python
if s.word_levels is None:
    s.word_levels = ecdict.annotate_text(s.text_en)
```

This preserves:
- Manual admin overrides (review workflow)
- Prior computed values (re-translation without text_en change)

## Why Not Fail-Fast for Translation?

Translation issues are often transient (API rate limit, network hiccup). The per-item retry in `_translate_subtitles` may fill gaps. Failing the entire video for a single bad translation would be overkill.

Hallucination, on the other hand, is structural — the transcription model produced garbage. There's no "retry" at that point (the audio has already been processed). Failing fast is the only correct action.

## Testing

11 new tests in `tests/test_quality_safety_net.py`:
- 5 hallucination detection tests
- 4 translation quality gate tests
- 2 word_levels preservation tests

All 433 tests pass.
