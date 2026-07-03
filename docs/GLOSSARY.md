# Glossary — Speaking 项目术语表

> 配合 [ADR](adr/README.md) 与 [重设计计划](plans/REDESIGN-2026-07.md) 使用。决策生效后的术语定义。

## 产品定位

- **视频词汇学习**：app 核心循环之一——双语字幕（WhisperX）+ ECDICT 考试词汇标注 + SM-2 间隔复习 + AI 词注释预热。
- **社区 UGC**：app 核心循环之二——用户通过创作者中心贡献视频，经管理员审核后发布到社区 feed。
- **AI 口语评分（已砍）**：原核心功能——发音反馈 + rubric 评分 + wav2vec2 对齐。ADR-0002 决定彻底删除。
- **录音（纯回放）**：watch 页录音功能，定位为"自我对照"——录一句→回放→跟原声对比。零 API、零持久化、无评分。保留。
- **跟读 / Shadowing（已砍）**：原口语练习模式。watch 页"跟读"按钮 + 首页 chip 在 ADR-0002 后移除/重命名。

## 视频模型

- **Official 视频**：管理员 seed 的官方视频（`is_official=True`），出现在首页/browse。来源：`seed_video`（API）或 `seed_official_videos.py`（脚本，绕过 Celery）。
- **UGC 视频**：用户提交的视频（`is_official=False`），审核通过后出现在社区 feed，不进首页（除非管理员手动勾"官方"）。
- **标准版 (Standard Version)**：某 `source_url` 第一个处理至 `ready` 的视频，作为该 URL 所有用户编辑的共享起点（GPU 一 URL 一跑）。首处理即标准版，无独立 promote。标准版与 `is_official` 正交——UGC 亦可成标准版。详见 `docs/plans/PIPELINE-RESUME-DEDUP-AUDIT.md`。
- **Fork（副本）**：用户从标准版（或他人已发布的 fork）复制一份独立 Video 行（字幕 + 练习题快照 + 元数据），直接 `ready`、不触发 GPU。`forked_from` 记溯源，允许 fork-of-fork。用户在自己 fork 上微调。
- **提议回写 (Propose-back / PR)**：fork 持有者把字幕修改以 PR（按批，含多行）提交给该 URL 的标准版；管理员审/合/驳。合并后按行传播到未动该行的 fork。练习题不走 PR。
- **VideoStatus**：处理状态机——`pending_processing → processing → ready_subtitles → ready / error`。
- **VideoReviewStatus**：审核状态机——`draft → pending_review → published / rejected`。UGC 必走审核；official 不走。
- **创作者中心**：`/my-videos`，用户上传/链接导入视频、编辑字幕与练习题、提审。完整功能见 ADR-0004。
- **process_video 管线**：head（cloud）→ `transcribe_video_gpu`（GPU worker）→ HTTP callback → `finalize_video`（tail）。详见 CLAUDE.md。

## 前端

- **统一组件库**：ADR-0005 决定抽取的统一组件库，**以 watch 页为风格锚点**，保持现有 coral/cream/brand 色系。
- **mediaUrl**：`frontend/src/lib/api.ts` 的图片/媒体 URL 解析 helper。相对路径 → `${API_URL}${path}`；已知 CDN → 后端代理；其他 http → https 升级。
- **落地页**：`/landing`，已写好的营销页。ADR-0005 决定接为公开首页（未登录 `/` → 落地页）。

## 数据

- **SpeakingAttempt 表（冻结）**：历史口语评分记录。ADR-0002 后停止新写入（录音不存），保留只读。
- **DailyActivity**：每日活动聚合模型。ADR-0003 依赖其非口语列（词汇/观看）重建 dashboard——**实现时需验证**是否追踪 vocab/watch 活动。
- **SM-2 词汇复习**：间隔重复算法，词汇模块核心。保留，不动。
