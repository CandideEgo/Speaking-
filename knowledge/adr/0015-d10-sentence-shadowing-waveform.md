# ADR-0015: 跟读体验增强（D10）— 逐句模式 + 波形对比 + 时间线

- **Status**: Accepted - 2026-08-30

## Context

产品设计规划-2026-08 §4-D10 要求跟读（Shadowing）从「单句手动录」升级为：

- **逐句跟读模式**：用户点开后自动循环「播一句→句尾暂停→自动录音→用户停→回放→下一句」；中途可退出回手动流程。
- **原声/录音波形对比**：在每句录音回放区显示原声片段（解码视频文件按字幕时间切片）的包络和用户录音的包络叠加对比。
- **跟读时间线**：播放器进度条上标记已跟读句子的位置（绿点），点击回到该句并重听。
- 累计跟读时长写入 `LearningEvent(shadowed_sentences)`（先前只写 1 = 一句，新值为实际秒数）。

设计红线（沿用 ADR-0002）：**不引入 AI 评分**——波形对比仅供视觉参照，文案明示"不做评分"。理由：评分引入会改变使用动机（用户为分数而练，而非真学），且模型成本高、跨口音鲁棒性差。

## Decision

### 状态机：`useSentenceShadowing`

- 三态：`playing`（播当前句）→ `recording`（句尾触发自动开录，复用 `useSpeakingRecorder`）→ `reviewing`（用户停录后）→ 下一句循环。
- 退出（`exit`）回到手动流程：暂停播放、清录音态、不动历史。
- 仅 HTML5 本地视频可用：YouTube IFrame 无法精确控制时序，`isYtMode` 时钩子调用方禁用入口。YouTube 视频保留 D0 入口的「解锁并观看」和普通手动跟读，逐句模式按钮置灰。
- 句尾检测从 `useVideoPlayer` 的 `timeupdate` tick 接入，ref 自稳避免 hook 依赖环。

### 波形对比：`WaveformCompare`

- 上行原声尽力解码（`fetch → decodeAudioData`）；失败或超 8s 不显示，**降级而非报错**——YouTube 视频根本没有可解码源。
- 下行录音解码用户 blob，两行各 200 桶包络。
- 包络计算闭 `AudioContext` 防止泄漏。
- 文案"波形仅供对比参考，不做评分"显式标注。
- 录音后 200 桶采样 + 同步绘制，满足 <500ms 渲染。

### 时间线：`VideoControls` markers

- API 扩展：`GET /shadowing/attempts?video_id=...&include_subtitle_time=true` 返回 `subtitle_start_time`（LEFT JOIN `subtitles`）。
- 默认不带该字段（节省带宽），前端列表调用统一带 `include_subtitle_time=true&page_size=100`。
- `markers` prop 注入到 `VideoControls`，渲染为进度条上的小绿点（`bg-success rounded-full`），点击 seek 到该句并 `new Audio(mediaUrl).play()` 回放该句录音。

### LearningEvent 累计

- `shadowing_service.create_attempt` 上报 `duration_ms`（D10 接入 `useSpeakingRecorder({ timer: true })` 暴露的 `seconds` 字段）。
- `event_value = max(1, duration_ms // 1000)`：有 duration 按秒累计，无 duration 落回 1 句（向后兼容）。
- 改 `useShadowing.refreshAttempts` 拉取 page_size=100（从 5）以同时覆盖历史列表（取前 5）和时间线 markers（取全部）。

### 修复顺手收

- `media.py` 上传 `audio/webm;codecs=opus` 时 MIME 参数需 split(';')[0] 才能命中 allow-list（Chromium MediaRecorder 行为）。
- `useSpeakingRecorder` 加 `timer` 选项（`{ timer: true }`），返回 `seconds` 字段；watch 页只在跟读场景启用避免无谓计时器。

## Consequences

- 验收：逐句模式可中途退出 ✅、波形录音后 <500ms 渲染 ✅、**iOS Safari 兼容 ⏳（Playwright 仿真 Chromium 验证通过，真机待办）**、无 AI 评分 API 调用 ✅。
- 设计文档 §4-D10 三条验收项均实现 + 一项真机待办。
- YouTube 视频的逐句模式按钮置灰：UI 不报错，理由在 `title` 属性 + `aria-label` 给出。
- `subtitle_start_time` 通过 outer join，无字幕的 attempt 字段为 null，前端按 absent 处理（不在时间线画点）。
- 时间线 markers 数量与 `attempts` 数量相同，量大（>100）时进度条绿点会重叠——种子期可接受，量大了再合并同句多 attempt 为单点。

## 关联

- ADR-0002（AI 评分永久删除）：本 ADR 显式遵守。
- ADR-0013（Shadowing 持久化）：本 ADR 扩展其能力。
- 规划文档：§4-D10
