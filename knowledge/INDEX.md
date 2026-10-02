# 知识索引

> 这一份文件是冷仓（`knowledge/`）的入口。**需要的时候先查这里，再打开具体文件。**
>
> 规则：本目录下每个文件（`archive/` 除外）在下面**恰好一行**；每一行的链接必须真的存在。
> 前者防漏登记，后者防死链——两条都由 `check_knowledge.py` 的 `index` 门检查。
> 热层（每会话必读的那几份）不在这个索引里，它们的家是 `AGENTS.md` 与 `.agent/`。

## 常问三件事去哪查

| 你要知道 | 去哪 |
|---|---|
| 某条规则/决定当初为什么这么定、代价是什么 | `decisions-index.md` 找 ID，再打开 `decisions.md` 的那一条（**永不整篇读**） |
| 某个子系统的设计意图与陷阱 | 下面「架构」「问题」两组 |
| 部署上这台机器该做什么 | 下面「运维」组 |


## 顶层

- [Technical Decisions](decisions.md)
- [Decision Index](decisions-index.md)
- [System Map](system-map.md)
- [Changelog](CHANGELOG.md)

## 架构：子系统在设计上为什么是这样

- [Translation Quality Safety Net](wiki/architecture/translation-quality-safety-net.md) — Hallucination detection, retry, quality gate, word_levels preservation · active · 2026-09-28
- [Frontend Architecture](wiki/architecture/frontend-architecture.md) — Next.js 16, Tailwind v4, dark mode, design system · active · 2026-09-28
- [Backend Service Layer](wiki/architecture/backend-services.md) — Service layer design, key services, key patterns · active · 2026-09-28
- [Auth System](wiki/architecture/auth-system.md) — JWT auth, dual sessions, auth dependencies, Zustand stores · active · 2026-09-28
- [Exam-Level Vocabulary](wiki/architecture/exam-vocabulary.md) — ECDICT annotation, AI prewarming, user-level filtering · active · 2026-09-27
- [Video Processing Pipeline](wiki/architecture/video-pipeline.md) — Split Head/GPU/Tail pipeline, queue topology, checkpoint resume · active · 2026-09-22

## 问题：值得复用的失败模式与陷阱

- [组合型静默失效的两个模式](wiki/problems/silent-composition-failures.md) — 状态跃迁把实体挤出所有可达队列（错词毕业即消失）/ 逐条写入超过端点限流预算（逐题 POST 撞 429 丢复习进度） · active · 2026-09-28
- [行锁的三个可复用陷阱（写者不共用锁 / SQLAlchemy 只警告不报错 / 临界区内的 commit 提前释放锁）](wiki/problems/shared-row-locks-and-nested-commits.md) — active · 2026-09-28
- [本地日期基准不一致的测试 flake](wiki/problems/local-date-basis-test-flake.md) — 测试用宿主机「昨天」、服务端回退 UTC「今天」，只在凌晨失败；get_user_local_date 回退基准的产品疑问待 DEC · active · 2026-09-28
- [错误与清理路径的三个隐形失效模式（回显非有限浮点 / fail-open 的漏洞 / 清理跑两次）](wiki/problems/error-path-blindspots.md) — active · 2026-09-28
- [缓存失效与媒体门控的两个隐形失效模式](wiki/problems/cache-invalidation-and-media-gate-blindspots.md) — fail-open 吞异常使失效静默失效 / 门控靠文件名正则，命名不符即整段跳过 · active · 2026-09-28
- [审计验证的两个失效模式](wiki/problems/audit-verification-failure-modes.md) — 静态分析基线把「已接受的债」读成无害，掩盖线上 /videos/search 500 / 高召回 LLM 审查 critical/high 档近 1/3 误报，须逐条对代码求证 · active · 2026-09-28
- [ASR / 标注质量诊断](wiki/problems/asr-annotation-quality-diagnosis.md) — ECDICT exchange 反向索引 bug 根因与修复验证（good→best 等误报） · active · 2026-09-28
- [审查修复中的三个可复用失败模式](wiki/problems/review-fix-failure-modes.md) — Dypnsapi 依赖漂移 / SQLite BigInteger PK / 死依赖误判（react-is） · active · 2026-09-25
- [部署链路的三个失效模式](wiki/problems/deploy-failure-modes.md) — 三容器并发迁移撞唯一约束 / backend 缺席使 nginx 崩溃循环并连带停 db / 长命令被 SSH 读超时截断 · active · 2026-09-20

## 指南：怎么在这个仓里做事

- [Repository Layout](wiki/guides/repository-layout.md) — Which directory holds which kind of thing, and what a new top-level entry needs · active · 2026-09-29
- [Testing Guide](wiki/guides/testing.md) — Backend tests, frontend checks, CI, lint & format · active · 2026-09-28
- [Development Setup](wiki/guides/setup.md) — Local dev, infrastructure, environment, production deploy, video seeding · active · 2026-09-28
- [Release / Pre-Push Checklist](wiki/guides/release-checklist.md) — The four local gates, known CI traps, migration checks before pushing · active · 2026-09-28
- [Image Handling in Agent Sessions](wiki/guides/agent-image-handling.md) — Why pasting images corrupts agent sessions, and how to recover · active · 2026-09-25

## 架构决策记录（点时刻，不可改）

- [Architecture Decision Records](adr/README.md)
- [ADR-0020: 内容存储三态与半自动下线](adr/0020-storage-modes-and-takedown.md)
- [ADR-0019: 词汇学习闭环 — 视频集合 + 快速过筛（三态状态机）](adr/0019-vocab-set-quick-sieve-loop.md)
- [ADR-0018: 翻译引擎统一为火山引擎 ARK（ark-code-latest）](adr/0018-ark-cody-translation-engine.md)
- [ADR-0017: 视频候选池（Catalog）— 抓取发现与逐条策展上线解耦](adr/0017-catalog-candidate-pool.md)
- [ADR-0016: 可访问性（D12）— 浅层落地：3 项小修 + 全局聚焦环默认值](adr/0016-d12-accessibility.md)
- [ADR-0015: 跟读体验增强（D10）— 逐句模式 + 波形对比 + 时间线](adr/0015-d10-sentence-shadowing-waveform.md)
- [ADR-0014: 视频频道（作者页）- Channel 实体表](adr/0014-video-channels.md)
- [ADR-0013: 跟读（Shadowing）录音持久化 — 推翻 ADR-0002「零留存」决策](adr/0013-shadowing-recording-persistence.md)
- [ADR-0012: 产品定位收敛 - 砍社区 UGC，转向 AI 学习计划](adr/0012-cut-community-ugc-pivot-to-learning-plan.md)
- [ADR-0011: 视频评分 + 推荐 + 行为采集系统 — 差距分析与分阶段落地](adr/0011-recommendation-system.md)
- [ADR-0007: 兑换码生命周期 - 状态机 + 全额追回 + 主动降级](adr/0007-redemption-code-lifecycle.md)
- [ADR-0006: 标准版 + Fork + 提议回写 — 按 URL 去重与共享编辑模型](adr/0006-standard-version-fork-propose-back.md)
- [ADR-0005: 前端重做 — 统一组件库（保持现有色系），播放页为锚点](adr/0005-frontend-rebuild-unified-components.md)
- [ADR-0004: UGC 管线 — 管理员触发处理 + 通知](adr/0004-ugc-pipeline-admin-triggered.md)
- [ADR-0003: 移除口语进度追踪；dashboard 改建为非口语数据](adr/0003-remove-speaking-progress-dashboard-rebuild.md)
- [ADR-0002: 砍掉 AI 口语评分；录音改为纯回放](adr/0002-cut-ai-scoring-recording-playback.md)
- [ADR-0001: 产品定位 — 视频词汇学习 + 社区 UGC 并重](adr/0001-product-positioning.md)

## 方案：已成形、已落地或未采用的计划

- [移动端播放页重构：把控制搬进壳的两个栏 — 执行方案（2026-10，待实施）](plans/移动端播放页-壳层控制条-落地方案-2026-10.md)
- [播放页返回导航 + 单词训练体系重构（设计方案 / 决策记录）](plans/词汇训练与播放页返回-设计方案-2026-09.md)
- [播放页返回 + 单词训练体系：执行方案](plans/词汇训练与播放页返回-执行方案-2026-09.md)
- [词汇训练与播放页返回：剩余分片计划（S4 / S5 / S6 / S8）](plans/词汇训练与播放页返回-剩余分片计划-2026-09.md)
- [编排层：从口播到执行的连接件 — 落地方案（2026-09）](plans/编排层-落地方案-2026-09.md)
- [知识冷仓重构 — 方案（2026-09）](plans/知识冷仓重构-方案-2026-09.md)
- [SeeWord 产品设计规划（2026-08 起）](plans/产品设计规划-2026-08.md)
- [SeeWord 产品规划（2026-08 起，6 个月视野）](plans/产品规划-2026-08.md)
- [agent 技能线：落地方案（借 mattpocock/skills 的三格）](plans/agent技能线-落地方案-2026-09.md)
- [SeeWord](plans/WORKFLOW.md)
- [后续开发计划](plans/PLAN-2026-08-后续开发.md)
- [前端设计重构落地计划 - prototypes → frontend Next.js](plans/FRONTEND-REFACTOR-2026-07.md)

## 进度：某段时间发生了什么

- [全站综合审查报告（2026-08-14）](progress/REVIEW-2026-08-14.md) — 2026-08-14
- [交接说明 — 2026-06-27 会话](progress/HANDOFF-2026-06-27.md) — 2026-06-27
- [交接说明 — 2026-06-27 晚间会话（接 HANDOFF-2026-06-27.md）](progress/HANDOFF-2026-06-27-evening.md) — 2026-06-27
- [SeeWord 视频处理全链路实战深度报告](progress/video-pipeline-deep-dive-2026-08.md)
- [SeeWord 全项目 AI 代码审计报告](progress/open-code-review-全项目审计报告-2026-09.md)
- [SeeWord](progress/PROGRESS.md)
- [免费化影响评估 — 注册即用（砍 Pro 会员）](progress/FREE-TIER-ASSESSMENT-2026-09.md)
- [文档整理归档日志 — 2026-08-04](progress/DEV-LOG-2026-08.md)

## 需求：整理后的产品意图

- [SeeWord 产品需求文档（PRD）](requirements/REQUIREMENTS.md)
- [SeeWord 内测上线需求（Requirements v1）](requirements/REQUIREMENTS-launch-internal-test.md)

## 运维：怎么操作这套部署

- [SeeWord](operations/SECURITY.md)
- [SeeWord](operations/RUNBOOK.md)
- [SeeWord](operations/PRODUCTION.md)
- [媒体分发拓扑与封面修复（任务 3）](operations/MEDIA-TOPOLOGY.md)
- [GPU Worker 常驻设置（DEV-FLOW 2026-07 Phase B3）](operations/GPU-WORKER-SETUP.md)

## 口播原话（封存，不可编辑）

- [口播原话 — 想法入库与分流管线的设想](inbox/2026-09-29-01-口播需求管线/raw.md) — closed · 2026-09-29
- [inbox — 原话的存放处](inbox/README.md)
- [粗剪 — 2026-09-29-01](inbox/2026-09-29-01-口播需求管线/triage.md)

## archive/

冻结的历史：点时刻记录、已关闭的票、历次归档的决策正文。故意不在上面逐条列出（它们是考古对象，不是索引用例），也不参与链接检查——「写作当时正确」就是它们的正确标准。
