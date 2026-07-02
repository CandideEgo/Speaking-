# 重设计落地计划 — 2026-07

> 基于 [ADR-0001..0005](../adr/README.md) 与 [术语表](../GLOSSARY.md)。分阶段执行，每阶段独立可上线。
> 约定：每阶段完成后 commit + `gitnexus_detect_changes()` 验证范围。

## Phase 0 — 解堵 & 快赢（1–2 天）

不依赖重设计、立即改善体验的修复。

- [x] **图片加载**：部署设 `NEXT_PUBLIC_API_URL`（头号修复）；统一 `mediaUrl` 到头像/缩略图/社区视频贴；TopBar 头像渲染图片。（代码完成：mediaUrl 接入社区贴/头像/TopBar 头像；`NEXT_PUBLIC_API_URL` 为部署侧动作，上线时设）
- [x] **管理端"添加视频"按钮**：`VideoManager.tsx` 加按钮 + URL 输入框，接已有的 `seedVideoFull`（`adminData.ts:228`，当前死代码）。
- [x] **UGC 通知**：管理端顶栏加"待处理 N"计数（`pending_processing` + `pending_review` UGC 数）。（后端新端点 `GET /api/v1/videos/admin/pending-count` + AdminTopbar badge）
- [x] **bug 修**：`my-videos/[id]/page.tsx:141` 的 `editable` 判断（"提交审核"按钮在 `pending_review` 误渲染）。
- [x] **文档修**：`CLAUDE.md` 里 `seed_official_videos.py` 路径错（实际在 `backend/scripts/`）。
- [x] **watch 页"跟读"重命名**：去掉 shadowing 标签（暂用"录音"或"录音对照"，最终随组件库统一）。
- [x] **退出登录按钮**：用户端 TopBar/侧边栏加 logout 入口。（侧边栏底部"退出登录"按钮）
- [x] **profile 入口**：侧边栏 + 移动 tab bar 加 profile 入口。

## Phase 1 — 砍 AI 评分（2–3 天）

ADR-0002。后端删 + 前端死组件清。

- [x] 后端删除：`speaking_service.py`、`speaking_alignment.py`、`speaking.py` 路由、`rubrics.py` 路由、`rubric.py` 模型、`schemas/speaking.py`、`schemas/rubric.py`、`ai_service.py` 三个评分方法（`pronunciation_feedback` / `pronunciation_feedback_rubric` / `free_speaking_feedback`）、`main.py` 路由注册、`test_speaking_eval.py`、`test_speaking.py`。
  - **偏差**：`get_user_stats` 未删——被 `users.py:get_my_stats` + `ai.py:assistant_summary` 共享，移到 `activity_service.py`（仍返回 frozen speaking 统计，Phase 4 按 ADR-0003 改建为 vocab/watch）。
  - **偏差**：`test_ai_rubrics.py` 未整文件删——它是 AI + rubric 混合文件，仅删 rubric 测试类与 rubric 模型 import，保留 3 个 AI 测试类。
  - **偏差**：`SpeakingAttempt.rubric_id` 的 `ForeignKey` 从模型移除（frozen 表 DB 约束保留），否则 `Base.metadata.create_all` 因 `speaking_rubrics` 表已不在 metadata 而抛 `NoReferencedTableError`，崩所有测试。
- [x] 前端删死组件：`SpeakingRecorder.tsx` 删除；首页"跟读/自由说"chip 删除（保留"朗读"，标题改"选择视频，开始练习"）；`ShareToCommunityDialog` 移除 `speaking_share` 路径（`speakingAttemptId` prop 无调用方，死代码）；`types/index.ts` 删除已死的 `SpeakingAttempt` / `SpeakingResult` 接口。
  - **保留**（ADR-0003 Phase 4/5 范围）：`PostType` union 的 `"speaking_share"`、`lib/community.ts` 的 `POST_TYPE_META.speaking_share`（历史帖渲染）、`LearningRecord/UserStats/DailyActivity/AdminUser/AdminStatsTrend/UserPreferences` 的 speaking 字段（dashboard/admin/profile/onboarding 仍用）。`useSpeakingRecorder.ts` + `AudioWaveform.tsx` + watch 录音面板按 ADR-0002 保留。
- [x] `SpeakingAttempt` 表保留（冻结），加 docstring 说明停止写入；`scores` relationship 删除（`SpeakingAttemptScore` 模型已删）。
- [x] 验证：`pytest tests/`（306 passed）、`npx tsc --noEmit`（exit 0）、`ruff check`（clean）、`gitnexus_detect_changes()`（仅 HomePage 流程受影响，无 speaking 评分流程残留）。`npm run lint` 跳过——ESLint 未配置（既有状态，tsc 为类型门禁）。
- [x] **注意**：先查 `update_streak` / `record_speaking_activity` 的其他调用方——结论见 [streak-speaking-only-source](../../memory/streak-speaking-only-source.md)：`update_streak` 仅 speaking_service 调用（+ backfill 脚本），**无 vocab/watch 调用方**；Phase 1 后 streak 失活。`record_speaking_activity` 变孤儿死代码（留 activity_service，Phase 4 清）。**ADR-0003 Phase 4 必须补 vocab/watch → streak 写入，或 fallback 删 dashboard**。

## Phase 2 — UGC 管线跑通（1–2 天）

ADR-0004。Phase 0 已做通知 + bug 修，本阶段补草稿阶段。

- [ ] UGC 链接导入不再跳过草稿：改 `seed_user_video` 的 `auto_publish` 行为，UGC 提交后停 `draft`，创作者编辑后再 `submit-review`。
- [ ] 验证完整流：创作者提交（上传/链接）→ `pending_processing` → 管理员"开始处理"→ process_video → ready → `pending_review` → 管理员批准 → `published` → 社区 feed 可见。
- [ ] 端到端手测一条 UGC 视频（含 GPU worker 在线/离线两种情况）。

## Phase 3 — 统一组件库（2–3 天）

ADR-0005 的基础。先抽组件，再改页面。

- [ ] 以 watch 页为风格锚点，抽 design token（color/spacing/radius/typography）——保持 coral/cream/brand 色系。
- [ ] 建统一组件库：Button/Card/Input/Badge/Modal/DataTable/Avatar/Image 等，对齐 watch 页样式。
- [ ] 迁移 `next/image`（替代裸 `<img>`），配 `images.remotePatterns`；图片走统一 `mediaUrl`。
- [ ] 移动优先的布局原语（Container/Stack/Grid 响应式）。
- [ ] Storybook 或页面级 demo 验证组件。

## Phase 4 — 用户页重做（5–7 天）

ADR-0005。用统一组件库重做用户页，修 4 个不满意点（一致/移动/导航/视觉）。

- [ ] 落地页接入：未登录 `/` → 落地页；落地页"登录/试用"→ `/login`。
- [ ] 登录/注册页重做（含手机 SMS 流）；登录页本身修视觉。
- [ ] 首页重做（去 speaking chip，价值主张对齐 ADR-0001 定位）。
- [ ] browse / search 重做（移动优先）。
- [ ] profile 重做（头像上传——需后端端点；3 tab 保留）。
- [ ] community 重做（视频贴渲染缩略图；PostComposer 补图片/视频附件或移除谎言文案）。
- [ ] vocabulary 重做。
- [ ] creator center（`/my-videos` + `/my-videos/[id]`）重做——对齐 ADR-0004 流程。
- [ ] dashboard 改建（ADR-0003：先验证 `DailyActivity` 非 speaking 数据；改接词汇+观看；无数据则删页）。

## Phase 5 — 管理面板重做（3–5 天）

ADR-0005。UI 重做 + 功能性修复落地。

- [ ] videos 管理页重做（含 Phase 0 的"添加视频"按钮、UGC 通知计数、处理/审核流程）。
- [ ] users 页重做（删"口语练习次数"列）。
- [ ] stats 页重做（删口语趋势图，改词汇/观看趋势）。
- [ ] orders / community 审核 / 其他 admin 页重做。
- [ ] admin 组件对齐统一组件库。

## Phase 6 — 打磨 & QA

- [ ] 移动端全量走查。
- [ ] 导航/IA 审计（所有功能 3 次点击内可达）。
- [ ] 图片加载生产验证（`NEXT_PUBLIC_API_URL` 设好后全站图片可见）。
- [ ] 视觉一致性审计（组件库覆盖率）。
- [ ] `pre-commit run --all-files` + `gitnexus_detect_changes()` 全绿。

---

## 风险与依赖

- **ADR-0003 dashboard 数据源**：`DailyActivity` 是否追踪 vocab/watch 活动未验证。Phase 4 dashboard 任务前必须先查；无数据则 fallback 删 dashboard。
- **GPU worker 在线依赖**：UGC 处理（Phase 2）与管理员"开始处理"都硬性要求本机 GPU worker 在线。生产（云服务器无 GPU）需 worker 持续在本机跑，否则 UGC 堆积。
- **头像上传端点**：profile 头像上传需新后端端点（当前只有 audio/video UploadFile）。
- **工作量**：Phase 3–5（组件库 + 用户页 + 管理面板）是主要工作量，约 2–3 周。
