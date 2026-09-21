# Decision Index

> Navigation for `decisions.md`. Read this first, then open the one entry you need.
>
> IDs are assigned in **file order** — append order, not date order, and dates repeat. An ID is
> issued once and never reassigned; a body moved to `archive/` keeps its heading here as a stub.
> To add a decision: append the entry to `decisions.md`, add a row with the next free ID. The
> `index` check fails if this table and `decisions.md` disagree on count, order, date or title.
>
> `superseded`: still on the record, no longer describing the system — read the superseding entry.

| ID | Date | Title | ADR | Status |
|----|------|-------|-----|--------|
| DEC-001 | 2026-07-03 | Product positioning: video vocabulary + community UGC | ADR-0001, ADR-0002 | active |
| DEC-002 | 2026-07-03 | Recording changed to playback-only | ADR-0002 | active |
| DEC-003 | 2026-07-03 | UGC pipeline admin-triggered | ADR-0004 | superseded by DEC-025 |
| DEC-004 | 2026-07-03 | Unified frontend component library | ADR-0005 | active |
| DEC-005 | 2026-07-03 | Standard version + Fork + Propose-back | ADR-0006 | superseded by DEC-025 |
| DEC-006 | 2026-07-03 | Redemption code 4-state machine | ADR-0007 | active; user-facing channel retired in 内测期, tables dormant |
| DEC-007 | 2026-07-03 | Recommendation system planning | ADR-0011 | active |
| DEC-008 | 2026-07-20 | Frontend-backend unification | — | active |
| DEC-009 | 2026-07-19 | Dark mode via CSS semantic tokens | — | active |
| DEC-010 | 2026-07-22 | Actor-aware notification dedup | — | active |
| DEC-011 | 2026-07-23 | Quality safety net: fail-fast vs fail-through | — | active |
| DEC-012 | 2026-07-23 | Translation retry: exponential backoff vs circuit breaker | — | active |
| DEC-013 | 2026-07-23 | Fork indicator display strategy: where and why | — | superseded by DEC-025 |
| DEC-014 | 2026-07-23 | Video status response: subtitle_count for resume hint | — | active |
| DEC-015 | 2026-07-23 | Word_levels preservation: compute-on-null vs always-recompute | — | active |
| DEC-016 | 2026-07-24 | Video storage: HK VPS file server vs OSS vs source station local | — | superseded; chosen option was never implemented — media is served from the backend media volume (see system-map.md) |
| DEC-017 | 2026-07-24 | ADR-0012: Cut social community UGC, pivot to AI learning plan | ADR-0012 | active |
| DEC-018 | 2026-07-24 | LearningEvent vs BehaviorEvent: separate models | — | active |
| DEC-019 | 2026-07-24 | WordMastery: enhance Vocabulary vs new table | — | active |
| DEC-020 | 2026-07-24 | UX design direction: Apple HIG + Material Design + Linear principles | — | active |
| DEC-021 | 2026-08-14 | 全站审查修复：关键决策 | ADR-0013 | active |
| DEC-022 | 2026-08-14 | JWT 库从 python-jose 迁移到 PyJWT | — | active |
| DEC-023 | 2026-08-14 | 跟读（Shadowing）录音持久化（正式化既有事实） | ADR-0013 | active |
| DEC-024 | 2026-08-28 | 会员模型：登录墙 + Free 解锁制（D0） | — | superseded by DEC-037（内测期免费开放） |
| DEC-025 | 2026-08-28 | D0b 产品瘦身：下线 AI 助手 / 评论 / UGC / 学习计划（f855613） | — | active |
| DEC-026 | 2026-08-29 | D6 提醒调度：单条每小时扫描 + 用户本地时间匹配（Phase 2） | — | active |
| DEC-027 | 2026-08-29 | D9 周报：不可变快照 + 周一 00:00 UTC beat（Phase 2） | — | active |
| DEC-028 | 2026-08-30 | D10 跟读体验增强：逐句模式 + 波形对比 + 时间线（Phase 3） | ADR-0015 | active |
| DEC-029 | 2026-09-08 | 翻译引擎统一为火山引擎 ARK (ark-code-latest) | ADR-0018 | active |
| DEC-030 | 2026-09-09 | YouTube anti-bot：POT provider + 代理中继（48 条批量上线） | — | active |
| DEC-031 | 2026-09-09 | 批量驱动与 worker 必须服务化托管（NSSM） | — | active |
| DEC-032 | 2026-09-09 | 上线验证判据：feed 排名不算、mp4 404 才算 | — | active |
| DEC-033 | 2026-08-30 | D12 可访问性：浅层落地（Lighthouse 96/100，超 90 达标线） | ADR-0016 | active |
| DEC-034 | 2026-08-30 | §10 待拍板 4 项（用户拍板） | — | active |
| DEC-035 | 2026-08-30 | 频道升级为全量作者页 Auto-Channel（ADR-0014 修订） | ADR-0014 | active |
| DEC-036 | 2026-09-08 | 视频候选池 Catalog（抓取发现与逐条策展解耦） | ADR-0017 | active |
| DEC-037 | 2026-09-19 | 内测上线四件套（排行 / 学习闭环 / 免费开放 / 存储三态） | ADR-0019, ADR-0020 | active |
| DEC-038 | 2026-09-19 | 周榜改自然周口径 + 首页卡片信息密度（简介 / 总播放 / 收藏） | — | active |
| DEC-039 | 2026-09-20 | 部署形态定稿（异地构建 + 传镜像）+ 迁移归属权收敛到 backend | — | active |
| DEC-040 | 2026-09-20 | 知识层归档机制 + stale 提醒检查 | — | active |
| DEC-041 | 2026-09-20 | 首页排行块并入筛选栏排序（修订 DEC-037 呈现层） | — | active |
| DEC-042 | 2026-09-21 | LLM 视频自动分类与分级 + 分级颜色目标优先 | — | active |
| DEC-043 | 2026-09-21 | 视频难度校准：习得级别 + 超纲率（修订 DEC-042 的难度兜底） | — | active |
| DEC-044 | 2026-09-21 | 点词分级渲染：`/gloss/static` + `/gloss/enrich` 两级端点 | — | active |
| DEC-045 | 2026-09-21 | 榜单页改版：TopPodium + RankingRow 重写 | — | active |
