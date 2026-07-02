# ADR-0004: UGC 管线 — 管理员触发处理 + 通知

- **Status**: Accepted — 2026-07-03

## Context

创作者中心 → 管理面板"没跑通"的根因（调查确认）：

- 创作者中心 UI 完整（上传/链接导入/状态轮询/字幕编辑/提审），管理端 UI 也完整（处理/审核/发布）。
- **核心断点**：用户提交视频只建 `pending_processing` 行，**没有 dispatch `process_video.delay()`**。`seed_user_video` / `submit_video` / `handle_video_upload` 三个入口都不 dispatch。只有管理员手动点"开始处理"（`start_processing`，硬性要求 GPU worker 在线）才跑。
- 管理员**没有新提交通知**——不主动去筛选 `pending_processing` 就不知道有新提交。用户提交后视频卡在 pending 无限期。
- 次要 bug：UGC 链接导入 `auto_publish=True` 跳过草稿阶段（直接到 `pending_review`，创作者无法先编辑）；"提交审核"按钮在 `pending_review` 状态还渲染并报错。

GPU worker 跑在本机（Windows），云服务器无 GPU，worker 离线时处理会失败。用户决策：**管理员触发 + 加通知**（不自动处理，避免 GPU 滥用；UGC 本来就要管理员审核）。

## Decision

**保持管理员触发处理**：UGC 提交后仍为 `pending_processing`，等管理员点"开始处理"才 dispatch `process_video`。不改为自动处理。

**新增管理员通知**：
- 管理端顶栏 / VideoManager 加"待处理 N"计数：`pending_processing`（待启动处理）+ `pending_review`（待审核）的 UGC 视频数。
- 新提交时管理员可见，避免漏看。

**修 bug**：
- UGC 链接导入：`auto_publish` 不再跳过草稿——UGC 提交后停留在 `draft`，创作者编辑字幕/练习题后再 `submit-review`。改 `seed_user_video` 的 `auto_publish` 默认行为或 `finalize_video` 的 UGC 分支。
- `my-videos/[id]/page.tsx:141`：`editable` 判断修正——`pending_review` 状态不渲染"提交审核"按钮（对齐 list 页 `my-videos/page.tsx:179-180` 的正确逻辑）。

**审核状态机不变**：`draft → pending_review → published/rejected` + `published_snapshot` 冻结机制保留。

## Consequences

- 创作者提交仍需管理员动作才能处理，但管理员现在**知道**有新提交（通知）。
- GPU 开销保持管理员可控（不自动跑垃圾视频）。
- 创作者获得草稿编辑窗口（链接导入后能先改字幕再提审）。
- "待处理 N"计数需后端聚合端点或前端轮询 `pending_processing` + `pending_review` UGC 数量。
- 运营依赖管理员定期处理——若管理员不在线，UGC 会堆积（可接受，符合"管理员触发"设计）。
