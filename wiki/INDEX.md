# Wiki Index

> Long-term engineering knowledge base. Only documents with lasting value.

## Architecture

- [Video Processing Pipeline](architecture/video-pipeline.md) — Split Head/GPU/Tail pipeline, queue topology, checkpoint resume
- [Backend Service Layer](architecture/backend-services.md) — Service layer design, key services, key patterns
- [Auth System](architecture/auth-system.md) — JWT auth, dual sessions, auth dependencies, Zustand stores
- [Frontend Architecture](architecture/frontend-architecture.md) — Next.js 16, Tailwind v4, dark mode, design system
- [Exam-Level Vocabulary](architecture/exam-vocabulary.md) — ECDICT annotation, AI prewarming, user-level filtering
- [Translation Quality Safety Net](architecture/translation-quality-safety-net.md) — Hallucination detection, retry, quality gate, word_levels preservation

## Problems

- [ASR / 标注质量诊断](problems/asr-annotation-quality-diagnosis.md) — ECDICT exchange 反向索引 bug 根因与修复验证（good→best 等误报）
- [审查修复中的三个可复用失败模式](problems/review-fix-failure-modes.md) — Dypnsapi 依赖漂移 / SQLite BigInteger PK / 死依赖误判（react-is）
- [缓存失效与媒体门控的两个隐形失效模式](problems/cache-invalidation-and-media-gate-blindspots.md) — fail-open 吞异常使失效静默失效 / 门控靠文件名正则，命名不符即整段跳过
- [部署链路的三个失效模式](problems/deploy-failure-modes.md) — 三容器并发迁移撞唯一约束 / backend 缺席使 nginx 崩溃循环并连带停 db / 长命令被 SSH 读超时截断
- [本地日期基准不一致的测试 flake](problems/local-date-basis-test-flake.md) — 测试用宿主机「昨天」、服务端回退 UTC「今天」，只在凌晨失败；get_user_local_date 回退基准的产品疑问待 DEC
- [组合型静默失效的两个模式](problems/silent-composition-failures.md) — 状态跃迁把实体挤出所有可达队列（错词毕业即消失）/ 逐条写入超过端点限流预算（逐题 POST 撞 429 丢复习进度）
- [审计验证的两个失效模式](problems/audit-verification-failure-modes.md) — 静态分析基线把「已接受的债」读成无害，掩盖线上 /videos/search 500 / 高召回 LLM 审查 critical/high 档近 1/3 误报，须逐条对代码求证

## Guides

- [Development Setup](guides/setup.md) — Local dev, infrastructure, environment, production deploy, video seeding
- [Testing Guide](guides/testing.md) — Backend tests, frontend checks, CI, lint & format
- [Release / Pre-Push Checklist](guides/release-checklist.md) — The four local gates, known CI traps, migration checks before pushing
- [Image Handling in Agent Sessions](guides/agent-image-handling.md) — Why pasting images corrupts agent sessions, and how to recover
- [Repository Layout](guides/repository-layout.md) — Which directory holds which kind of thing, and what a new top-level entry needs
