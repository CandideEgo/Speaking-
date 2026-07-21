---
title: Image Handling in Agent Sessions
tags: [bug, tooling, agent]
status: active
confidence: verified
related_code: []
related: []
created: 2026-07-21
updated: 2026-07-21
---

# Problem

Pasting images directly into agent conversations causes session corruption.

# Cause

Images enter conversation history as base64 image blocks. Every subsequent request sends the full history to the API. When the current model endpoint (e.g., glm-5.2) does not support images, every request fails because the image block is repeatedly sent. Switching models does not help — the image persists in history.

# Solution

- Use `/image-vision` skill for all image understanding/OCR/Q&A
- `/image-vision` routes through a separate vision endpoint, does not inject image blocks into main conversation
- Never paste images directly into conversation
- Never use Read tool on image files

# Recovery

If a session already contains image blocks causing persistent errors:

1. Locate the session `.jsonl` file at `~/.claude/projects/<proj>/<session-id>.jsonl`
2. Back up the file
3. Replace `"type":"image"` blocks with `"type":"text"` text descriptions (preserve surrounding text context)
4. Resume should work again
