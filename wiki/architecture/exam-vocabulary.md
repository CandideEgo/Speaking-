---
title: Exam-Level Vocabulary System
tags: [feature, vocabulary, ecdict, ai]
status: active
confidence: verified
related_code: [exam-levels, ecdict-service]
related: [wiki/architecture/video-pipeline.md]
created: 2026-07-21
updated: 2026-07-21
---

# Background

Core differentiator: automatic exam-level vocabulary annotation in video subtitles (CET4/6, gaokao, etc.).

# Two-Stage Annotation

1. **Local annotation (ingest time)**: ECDICT dictionary local lookup, zero API calls, tags each word with exam levels
2. **AI word note prewarming (finalize time)**: batch LLM calls to generate word notes, supports dual-engine (agnes + qwen) concurrent

# User-Level Filtering

Frontend filters highlighting by user's `target_exam_level`.

# Config

`backend/app/core/exam_levels.py` defines exam level mapping.

# Future Notes

- ECDICT database ~30MB, downloaded via `scripts/download_ecdict.py`, in `.gitignore`
- New exam levels require updating `exam_levels.py` and ECDICT mapping
- AI word note cache in Redis — note fail-open degradation
