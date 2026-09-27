---
title: Translation Quality Safety Net
tags: [video, backend, ai, quality]
status: active
confidence: verified
related_code: [video-pipeline, translation, transcription]
related: [.agent/context.md, .agent/decisions.md]
created: 2026-07-23
updated: 2026-09-28
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

**Location**: checks in `app/services/translation/quality.py`; the coverage decision is `_translation_quality_decision` in `app/tasks/video_processing.py::finalize_video`

Checks after translation:
- **Coverage**: ≥80% of subtitles must have translations
- **Mixed CJK/Latin**: ≤20% (catches translation failure leaking source)
- **Short translations**: ≤30% with <3 chars (catches truncation)
- **Length outliers**: translation length within 30%-300% of source

**Action** (coverage only): below `translation_quality_block_coverage` (default 0.60, but the admin
settings row's `quality_block_threshold` overrides it) the video gets `quality_flag=quality_blocked`,
goes `error` and the pipeline stops — deliberately without a Celery retry, since the same engine on the
same input reproduces the low coverage; an admin re-translates, optionally with another engine. Between
the block threshold and `translation_quality_warn_coverage` (default 0.80) the flag is
`quality_warning` and the video still goes ready. `translation_quality_block_enabled=False` reverts to
warn-only. The other three checks never block. The report is persisted to `video_quality_reports`
either way.

## 4. Word Levels Preservation

**Location**: `app/tasks/video_processing.py` (annotating step)

Changed from "always recompute" to "compute only when null".

```python
if s.word_levels is not None:
    continue  # manual override or prior compute
s.word_levels = ecdict.annotate_text(s.text_en) or None
```

This preserves:
- Manual admin overrides (review workflow)
- Prior computed values (re-translation without text_en change)

## Why Not Fail-Fast for Translation?

Most translation issues are transient (API rate limit, network hiccup): the per-item retry in `_translate_subtitles` fills gaps, and the mixed/short/length checks only warn. Coverage is the structural exception — an engine that returns almost nothing for a batch will do it again — so it blocks (see §3) instead of spending quota on a retry.

Hallucination, on the other hand, is structural — the transcription model produced garbage. There's no "retry" at that point (the audio has already been processed). Failing fast is the only correct action.

## Testing

15 tests in `tests/test_quality_safety_net.py`:
- 5 hallucination detection, 4 translation quality gate
- 2 word_levels preservation, 4 quality-report persistence

The coverage block/warn decision has its own file: `tests/test_translation_quality_block.py`.
