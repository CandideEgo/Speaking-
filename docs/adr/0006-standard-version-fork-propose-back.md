# ADR-0006: 标准版 + Fork + 提议回写 — 按 URL 去重与共享编辑模型

- **Status**: Accepted — 2026-07-03

## Context

原去重按 Video 行而非按 `source_url`：`submit_video` 命中 ready 视频时复制元数据但**不复制字幕**（用户拿到空壳）；`seed_user_video` 完全不去重（同 URL 多次创建空行，每次可能再触发 GPU）。同一链接被重复用 GPU 转录，且用户拿不到可微调的初始字幕/练习题。

用户诉求：一个链接处理一次后，产物（字幕 + 练习题）作为共享起点，其他用户在此之上微调，不再重复跑 GPU。

## Decision

引入**标准版 (Standard Version)**：某 `source_url` 第一个处理至 `ready` 的视频自动成为该 URL 的标准版（首处理即标准，无独立 promote）。后续同 URL 提交从标准版 **fork**——复制字幕 + 练习题快照 + 元数据到新 user Video 行，直接 `ready`、不触发 GPU。

编辑模型 = **Fork + 提议回写**：

- 用户在自己 fork 上独立微调（字幕 + 练习题快照；练习题可编辑，不走 PR）。
- fork 持有者可向标准版提 PR（按批，含多行字幕修改）；**管理员独占**审/合/驳（与 ADR-0004 一致，匹配单人运营）。
- 合并后按 **Git 式按行传播**：未动该行的已 fork 副本自动同步，动过的标"有可合并更新"手动合并。v1 限定传播只流向直接 fork 自当前标准版的副本（fork-of-fork 走手动拉取），避免继承祖先编辑的逐行基线判定复杂度。

标识：单独 `video_standards(source_url PK, canonical_video_id FK, created_at)` 表——DB 层保证一 URL 一标准版；替换 = 原子 repoint `canonical_video_id`；`forked_from` 在 videos 表记 fork 溯源（与"谁是标准版"正交）。标准版与 `is_official` 正交（UGC 亦可成标准版）。

替换/删除：质量差时 repoint 到更好的视频；旧标准降为普通视频（有 fork 则保留媒体 + lineage）；有 fork 存在禁硬删标准版（fork 共享标准版媒体文件）；现有 fork 不 auto-rebase。

## Consequences

- GPU 一 URL 一跑；用户拿到可微调的初始版而非空壳。
- 新增三张表：`video_standards`、`SubtitleRevision`（编辑审计，含 `scope=fork|standard`）、`SubtitleChangeProposal`（PR）。
- 新增 PR 审核流 + 按行传播/冲突检测引擎；PR 合并与传播走 `subtitle_edit_service`，自动继承 `word_levels` 重算（该 service 已在 `text_en` 变更时调 `annotate_text()`）。
- 管理员成为 PR 审核瓶颈（单人运营可接受；规模化后考虑所有者主审或社区众裁）。
- fork-of-fork 传播 v1 限定（只流向直接 fork 自当前标准版的副本）——复杂度后置。
- 标准版删除受 fork 共享媒体约束；link rot 降级不阻断 forkability（标准版价值锚点 = 字幕/练习题，非媒体——本地媒体 rot-proof，rot 真实面仅 thumbnail + 源 URL + 单点媒体文件丢失）。
- 8 项决议细节 + 扩展 A/C/E/H（标准版目录、贡献者声誉、link rot、UGC→official 提升）见 `docs/plans/PIPELINE-RESUME-DEDUP-AUDIT.md`；术语见 `docs/GLOSSARY.md`。
