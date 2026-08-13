# Project State

## Current Focus

全站审查修复（REVIEW-2026-08-14）12 批次已全部完成并提交（6 个 commit，627 后端测试 + 前端 tsc/lint/vitest/build 全绿）。**待办**：① 推远程后观察 CI（pip-audit/npm audit/coverage 门槛/e2e seed 首次生效）；② 按 REVIEW 报告延后项继续（fastapi 升级、SQLite→Postgres 测试迁移、e2e 播放/词汇/考试覆盖、转写回调 payload 上限、/metrics 鉴权）；③ 服务器侧验证：nginx.ssl.conf 挂载 + SMS send-code 复测（requirements 修复后）。

## Completed Milestones

- **全站功能与设计审查并补齐（2026-08-13）**
  - 审查：24 个用户页 + 9 个管理页对照 28 页原型逐一对比；已对齐页面不动，集中补齐缺口
  - /upgrade 页补齐原型 18 三步指引（开通 Pro：合规告知 + 三步指引 + 小商店按钮降级态 + 兑换码入口）
  - 错题本：后端 exam_service 新增 list_wrong_questions（派生查询：最近一次作答仍错才在错题本，重做答对即销账）+ create_wrong_redo_session（mode=wrong_redo）+ exam_stats 聚合；API GET /exams/wrong、POST /exams/wrong/redo、GET /exams/stats；6 个新测试
  - 前端：练习专题页错题区块 + 统计条 + 每日检测深色特色卡；/practice/exams/redo 错题重做页；结果页「只练错题/再做一遍/再练一套」三按钮
  - ExamRunner 补齐：倒计时（默认 30 分钟，<60s 警告色）、退出按钮、移动端底部提交栏、选项两列网格
  - 文案修正：exams 列表年份不写死；watch 页练习区占位指向真题练习；history 页升级 4 统计卡（含连续天数）
  - 验证：后端 586 passed；前端 tsc/ESLint 0 errors；浏览器冒烟通过（真题列表/交卷/错题本/重做/结果页全链路）

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

- 本地 dev 环境 SMS 走真实阿里云发送（.env 配置了凭据）但 SDK 初始化失败→send-code 502；CI/无凭据环境自动回退 dev-fake 码 1234（E2E 依赖此路径）。**根因已定位（2026-08-14 审查）**：requirements.txt 曾缺 Dypnsapi SDK，已修复，本地 .venv 与云端镜像需重新安装依赖后复测
- docs/architecture/ 旧架构文档已清理删除（见 docs/progress/DEV-LOG-2026-08.md）——`.agent/system-map.md` + `wiki/` 为权威
- **2 unfixed risk items**: comment quality scoring (pure keyword matching), E2E test coverage（2026-08-14 起 CI e2e 已有 seed，核心旅程不再整体跳过；watch 播放/词汇复习/考试等关键流程的 e2e 仍缺失）
- ICP compliance: awaiting individual business license for full deployment

## Next Steps

1. Recommendation system 深度个性化 P2 (ADR-0011) — P1 评分 + 推荐 feed 已落地，behavior_events P0 已解锁
2. ICP-unblocked items (payment, frontend unit tests, E2E coverage)
3. 视频存储收尾：确认稳定后删源站文件 + Docker cache prune（释放 ~17.5GB）
4. UX 后续：DailyProgressCard / WeeklyCycleCounter 组件内部适配紧凑布局（当前仅压缩了外层 grid）

## Last Updated

Date: 2026-08-14
- **全站综合审查 + 修复（docs/progress/REVIEW-2026-08-14.md）**：7 路并行审查 87 条发现（18 高危）；已修复：上传存储型 XSS（服务端扩展名白名单 + nosniff + 媒体扩展名 allowlist）、/media/proxy SSRF（禁重定向 + 移除 aliyuncs.com）、requirements.txt 补 Dypnsapi SDK、watch 快捷键双重监听与 navigateSubtitle seek 失效、admin 引导刷新竞态、limiter Redis 故障 fail-open（in-memory fallback）、草稿/未发布视频媒体发布态门控（owner/admin token 预览）、e2e seed（核心旅程不再 skip）、Celery 任务体直测、SMS 冷却 TTL 测试、nginx ssl 配置挂载 + 安全头 + /media XFF 覆盖、后端容器非 root + HEALTHCHECK、pip-audit/npm audit/dependabot 门禁、deploy 模板对齐 compose、ADR-0013（Shadowing 持久化）与文档漂移更正
- 遗留（见 REVIEW 报告 §8）：fastapi/python-jose 升级（P2）、SQLite→Postgres 测试迁移（延后）、e2e 播放/词汇/考试流程覆盖、手机号日志脱敏
- 真题考试体系现状（08-08 b8b9970 重建后）：paper bank 模型（exam_papers/exam_questions）+ exam_sessions/exam_answers（mode: paper_exam/daily_check/wrong_redo）+ 服务端判分；错题本为派生查询不另建表

## History (2026-08-04)
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
