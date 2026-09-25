---
title: Image Handling in Agent Sessions
tags: [bug, tooling, agent]
status: active
confidence: verified
related_code: []
related: []
created: 2026-07-21
updated: 2026-09-25
---

# Problem

Pasting images directly into agent conversations caused session corruption.

# Cause

Images enter conversation history as base64 image blocks. Every subsequent request sends the full history to the API. When the model endpoint in use (e.g., glm-5.2) did not support images, every request failed because the image block was repeatedly sent. Switching models did not help — the image persists in history.

# Resolution (2026-09-25)

当前模型已支持图片调用，此问题不再复现。原先的绕行方案（`/image-vision` skill 走独立 vision endpoint）已随该 skill 一并移除。

- 可以直接 `Read` 图片文件，也可以直接粘贴图片进会话
- 不再需要单独的 vision endpoint 或专用 skill

# Recovery（仅历史会话可能残留）

If an old session already contains image blocks causing persistent errors:

1. Locate the session `.jsonl` file at `~/.claude/projects/<proj>/<session-id>.jsonl`
2. Back up the file
3. Replace `"type":"image"` blocks with `"type":"text"` text descriptions (preserve surrounding text context)
4. Resume should work again
