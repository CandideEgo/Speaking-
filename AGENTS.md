<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Speaking-** (7716 symbols, 13328 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Speaking-/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Speaking-/clusters` | All functional areas |
| `gitnexus://repo/Speaking-/processes` | All execution flows |
| `gitnexus://repo/Speaking-/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

# Image Vision — 图片识别

> 权威规范见 `CLAUDE.md` §「图片处理规范 (MUST FOLLOW)」。此处补充可执行细节。

## Always Do

- **MUST use the `image-vision` skill to read/understand any image.** 任何需要看图（截图、设计稿、照片、图表、OCR）的场景，都通过 Skill 工具调 `image-vision`，或直接跑它的脚本。这是唯一被允许"看图"的方式。
- 直接调用脚本（本地文件或 `http(s)` URL 均可）：
  ```bash
  python ~/.agents/skills/image-vision/scripts/analyze.py \
    --image "./screenshot.png" \
    --prompt "详细描述这张图片的内容"
  ```
  选项：`--model`（覆盖默认模型）、`--max-tokens`（默认 2048）。

## Never Do

- **NEVER 用 Read 工具读取图片后当作"已识别"**。Read 只把图片以占位符附在上下文里，并不会真正分析像素，无法可靠告诉你图里有什么。任何关于图片内容的问题都必须调 `image-vision`。
- NEVER 仅凭文件名或周围文字猜测/OCR/描述图片内容 —— 跑 `image-vision` 验证。
- NEVER 把图片直接粘贴进主对话 —— 会以 base64 image block 永久留在会话历史，导致 glm-5.2 等不支持图片的端点每轮报错、会话卡死（详见 CLAUDE.md）。
- NEVER 处理超过 20 MB 的图片 —— 先缩小。

## Notes

- 该端点为**纯视觉**，无图的纯文本请求会被 401 拒绝。
- 输出为 UTF-8 文本；Windows 控制台中文可能乱码，底层文本正确（必要时写文件）。
- 配置（auth token / base_url / model）在 `~/.agents/skills/image-vision/config.json`；缺失则先问用户。
- 典型触发词："看下这张图"、"图片里是什么"、"识别图片"、"这张截图说明了什么"、"describe this image" 等。
