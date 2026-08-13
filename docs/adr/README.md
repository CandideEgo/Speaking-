# Architecture Decision Records

This directory records architectural decisions for the SeeWord app, dated 2026-07-03.
Each ADR is a one-time, immutable decision: Title, Status, Context, Decision, Consequences.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-product-positioning.md) | 产品定位：视频词汇学习 + 社区 UGC 并重 | Superseded by [0012](0012-cut-community-ugc-pivot-to-learning-plan.md) |
| [0002](0002-cut-ai-scoring-recording-playback.md) | 砍掉 AI 口语评分；录音改为纯回放 | Partially superseded by [0013](0013-shadowing-recording-persistence.md) |
| [0003](0003-remove-speaking-progress-dashboard-rebuild.md) | 移除口语进度追踪；dashboard 改建为非口语数据 | Accepted |
| [0004](0004-ugc-pipeline-admin-triggered.md) | UGC 管线：管理员触发处理 + 通知 | Accepted |
| [0005](0005-frontend-rebuild-unified-components.md) | 前端重做：统一组件库（保持现有色系），播放页为锚点 | Accepted |
| [0006](0006-standard-version-fork-propose-back.md) | 标准版 + Fork + 提议回写：按 URL 去重与共享编辑模型 | Accepted |
| [0007](0007-redemption-code-lifecycle.md) | 兑换码生命周期：4 态状态机 + 全额追回 + 主动降级 | Accepted |
| [0011](0011-recommendation-system.md) | 视频评分 + 推荐 + 行为采集系统 — 差距分析与分阶段落地 | Accepted |
| [0012](0012-cut-community-ugc-pivot-to-learning-plan.md) | 砍社区 UGC，转向 AI 学习计划 | Accepted |
| [0013](0013-shadowing-recording-persistence.md) | 跟读（Shadowing）录音持久化（推翻 ADR-0002 零留存） | Accepted |

## Companion docs

- [.agent/context.md](../../.agent/context.md) — 领域术语表（Domain Terms）
- [归档日志](../progress/DEV-LOG-2026-08.md) — 历史落地计划索引（原 Redesign plan 等已归档）
