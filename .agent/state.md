# Project State

## Current Focus

原型驱动全栈重构——练习/考试系统全链路打通：后端 exam 系统（exam_sessions/exam_answers + 服务端判分 + 派生错题本 + practice hub）已上线；前端 practice/exam/paper/watch 内嵌卷全部接真数据，静态样例卷已删；视觉收尾（login/forgot-password 三步向导/profile 用户卡）完成。pytest 539 绿 + tsc/build/ruff/pre-commit 全绿 + 真实 Postgres 浏览器端到端验证通过。

## Completed Milestones

- **原型驱动全栈重构：练习/考试系统（2026-08-04，.qoder/specs/原型驱动全栈重构_task-08d.md）**
  - 后端：`exam_sessions`/`exam_answers` 两表（迁移 b1c2d3e4f5a6，可 downgrade）；错题本为派生查询不另建表
  - `exam_service`：daily_check 跨视频抽题 / video_exam / wrong_redo（重做答对即销账）；服务端判分，答案不下发；判分后复用 submit_practice_results 更新 SM-2 + LearningEvent
  - 6 个新 API：/practice/hub、/exam/start、/exam/{id}/submit、/practice/wrong、/practice/wrong/redo、/videos/{id}/paper（即时模式含答案）
  - 前端：lib/examData.ts（API+钻题→试卷适配器）+ stores/examStore.ts；PaperRunner 支持服务端判分与自动交卷；即时判分防抖回写掌握度；SAMPLE_PAPER/SAMPLE_WRONGS 已删
  - 修复两个潜伏 bug：Postgres COALESCE(bool,int) → CASE；ecdict pos 超 vocabulary 列宽 varchar(20) 致自动加词 flush 失败
  - Phase D：login（+86 前缀/忘记密码同行/信任行）、forgot-password 三步向导（原型 15）、profile 用户卡（原型 07）
  - 测试：15 个新 exam 测试；全量 539 passed；浏览器端到端验证出卷→答题→提交判分→错题本→hub 全链路

- **UX 设计方向落地（Apple HIG + Material Design + Linear）**
  - 词汇复习：6 英文按钮 → 3 档中文（忘了/模糊/记住了）+ 键盘 1/2/3 快捷键
  - Onboarding：4 步强制 → 3 步 + “跳过，稍后设置”
  - 加载状态：FullPageSpinner → ShellSkeleton（布局感知骨架屏）+ onboarding 检查非阻塞
  - Watch 页：练习区默认折叠为“开始本句练习”CTA（渐进披露）
  - 词汇删除：ConfirmDialog → 即时删除 + Undo toast（5s 撤销窗口）
  - 首页：增加主行动 CTA（开始复习/继续学习），统计卡压缩为紧凑 3 列
  - 导航标签统一：Sidebar “个人中心”→“我的”，与移动端 TabBar 一致
  - 浏览页：“加载更多”直接调用 loadMore()，不再假滚动
  - 静默失败：考试层级保存失败加 toast 反馈
  - 新建 ShellSkeleton.tsx 组件；修改 9 个文件；tsc 0 errors

- **Phase 3: Pipeline Phase 4 frontend UI complete**
  - Resume status display: error retry with step-aware resume hint (transcribing vs post-transcribing)
  - Subtitle edit history viewer: already integrated (SubtitleHistory.tsx in VideoSubtitleEditorPanel)
  - Fork indicator on video cards: watch page, my-videos list, admin table
- Phase 1-10 all feature development (92 items, 100%)
- Frontend-backend unification P1-P4b (brand naming / visual / auth / error envelope + pagination)
- Frontend deep design development (dark mode / design system / visual polish)
- E2E Playwright CI gate (stabilized)
- mypy baseline gate
- ICP compliance Phase 1-3
- Actor-aware notification dedup (same actor → update timestamp, different actors → separate notifications)
- Engineering Context System Phase 1 deployed (meta: validates .agent/ context improves agent capability)
- **Phase 0: Pre-launch hardening complete**
  - WebSocket push error handling (distinguish disconnect vs unexpected errors)
  - GPU worker credential isolation guard (hard boundary, env var check)
  - auto_publish dual-path unified (shared `_publish_video` helper)
  - Dead User columns dropped (streak_count/longest_streak)
- **Phase 1: Screenshot matrix + visual polish complete**
  - Legacy color aliases replaced with semantic tokens (cream/navy/olive/teal → surface/ink/muted/success)
  - FormField component extracted
  - Admin mobile navigation drawer added
  - Playwright screenshot matrix updated (dynamic credentials, 52 screenshots)
- **Phase 2: Transcription/Translation Quality Safety Net complete**
  - Hallucination detection in transcription callback (repetition, nonsense, duration mismatch, empty ratio)
  - Translation batch retry with exponential backoff (3 retries, 2s base delay, permanent error detection)
  - Translation quality gate in finalize_video (coverage, short ratio, mixed CJK/Latin, length outliers)
  - Word-level score preservation during re-translation (annotating step preserves existing word_levels)
  - 11 new tests, all passing (433 total tests pass)
- **Phase 3: Pipeline resume + standard version + edit audit complete**
  - Resume status display with step-aware hint (transcribing vs post-transcribing)
  - Subtitle edit history viewer (SubtitleHistory.tsx in VideoSubtitleEditorPanel)
  - Fork indicator on video cards (watch page, my-videos, admin table)
  - Dead User columns dropped (streak_count/longest_streak)
- **ADR-0012: 砍社区 UGC，转向 AI 学习计划 complete**
  - 删 6 张社区表（posts/post_likes/user_comments/comment_likes/comment_reports/follows）+ 迁移 b7c8d9e0f1g2
  - 删后端：community 模型/service/API(15 路由)/schemas/admin 社区字段/community 测试
  - 删前端：community 组件/页面/导航/营销文案/creator 上传入口
  - 保留 VideoLike（engagement.py）+ video_likes 表 dormant + comment_service（视频评论评分）
  - 测试 409/0（-24 删除的 test_community.py）；tsc + lint 0 errors

## Known Issues

- 本地 dev 环境 SMS 走真实阿里云发送（.env 配置了凭据）但 SDK 初始化失败→send-code 502；CI/无凭据环境自动回退 dev-fake 码 1234（E2E 依赖此路径）
- docs/architecture/ 旧架构文档已清理删除（见 docs/progress/DEV-LOG-2026-08.md）——`.agent/system-map.md` + `wiki/` 为权威
- **3 unfixed risk items**: comment quality scoring (pure keyword matching), auto_publish dual path (partially fixed), E2E test coverage
- E2E test for critical user flows still unchecked in completion criteria
- ICP compliance: awaiting individual business license for full deployment

## Next Steps

1. Recommendation system 深度个性化 P2 (ADR-0011) — P1 评分 + 推荐 feed 已落地，behavior_events P0 已解锁
2. ICP-unblocked items (payment, frontend unit tests, E2E coverage)
3. 视频存储收尾：确认稳定后删源站文件 + Docker cache prune（释放 ~17.5GB）
4. UX 后续：DailyProgressCard / WeeklyCycleCounter 组件内部适配紧凑布局（当前仅压缩了外层 grid）

## Last Updated

Date: 2026-08-04
- **原型驱动全栈重构（练习/考试系统）完成**：见上方 Completed Milestones；提交序列 68393b7(docs) → c4a40e1(exam 后端) → 28f648a(CASE 修复) → 65ab7c1(前端接真数据) → 7e46cf2(列宽截断修复) → c1811bf(Phase D)
- **POST-FRONTEND-2026-08 全部 6 阶段完成（release 0.1.1，2026-08-03）**
  - Stage 1/2 播放页改版：字幕区独立滚动、词卡停泊位避让、snap-y 分屏吸附
  - Stage 3 画布编辑器 MVP：字幕 reorder/新建/删除 + 时间轴可视化 + 时间块拖拽/缩放（B-F3/B-F6 后置）
  - Stage 4 反馈公告系统：Feedback 模型/API + 公告广播 + /contact + admin /admin/feedback
  - Stage 5 ASR/标注质量诊断：无残留 bug（见 wiki/problems/asr-annotation-quality-diagnosis.md）
  - Stage 6 运维补丁：CD/Loki/告警/CHANGELOG/scripts（E2 前端 Sentry 跳过，需 DSN）
- **文档全量整理（knowledge-verify）**：删 23 个漂移文档（旧架构/旧计划/旧 PRD），归档索引见 docs/progress/DEV-LOG-2026-08.md

## History (2026-07-24)
- **AI 学习计划实施完成（ADR-0012 Decision 3）**
  - 4 张新表：user_learning_profiles, learning_plans, learning_plan_items, learning_events
  - Vocabulary 增强 3 列：exam_level, first_seen_at, correct_count
  - 3 个新服务：learning_plan_service（规则引擎）, learning_event_service（事件发射+日目标追踪）, profile_service（档案聚合）
  - 7 个 API 端点：GET/POST /plan/today, /plan/items/{id}/complete, /plan/progress, /plan/profile, /plan/profile/refresh, /plan/history, POST /plan/generate/ai（Pro）
  - AI 增强计划生成：ai_plan_service + Celery task + LLM JSON schema
  - 前端首页改造：嵌入计划仪表盘（DailyProgressCard + WeeklyCycleCounter + StreakCard + PlanItemCard + MasteryBreakdown）
  - Sidebar 移除创作 section（ADR-0012）
  - 事件发射集成：practice_service, behavior_service, vocabulary API
  - DB 迁移 d2e3f4g5h6i7 已应用；测试 409/0；tsc + lint 0 errors
