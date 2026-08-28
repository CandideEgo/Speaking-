# Project State

## Current Focus

Phase 0 已完成（产品设计规划-2026-08，提交链：f855613 D0b → 836fe3b D8b → ac1e7e5 D0 后端 → 2025310 D0 前端 → 8505a20/46a5380 D1 → 94c143a D3a）。后端 599 passed / 6 skipped；前端 tsc/eslint 0 errors、vitest 10 passed、next build 通过。**收尾已完成（2026-08-28）**：① 修复迁移 revision ID 冲突（新迁移与旧迁移撞 ID 致 CycleDetected，重命名为 p6q7r8s9t0u1 解锁表 + q7r8s9t0u1v2 字幕字号）；② 本地库 `alembic upgrade head` 已执行并验证（user_video_unlocks/plan_source/is_demo/subtitle_font_size 就位）；③ 浏览器冒烟验收 9 项：登录墙回跳/解锁流程/三态角标/已解锁 Tab/控制条均通过；④ 修复 watch 页 `GET /videos/{id}/like` 405 → 改调 `/like-status`（已浏览器复验 200）。**待办/待拍板**：① D1 移动端真机验收；② 示范视频内容指定（`videos.is_demo` admin 开关已就绪）；③ 登录页仅密码登录、未接 SMS 验证码登录（后端 /sms/send-code+/sms/login 正常）——是否补验证码登录 Tab 待拍板；④ 解锁/进入 watch 后视频不自动播放（代码未设 autoPlay，属设计现状，与「解锁并观看」文案预期有差）——待拍板是否加自动播放；⑤ /knowledge-maintain 未执行。**已拍板**：不做 streak 保护卡；↑↓ 键由字幕导航改为音量（§D1）。**Phase 1 B0 首批已落地（2026-08-29）**：D2 CoachMark 新手引导（useCoachMark + watch 页 4 步高亮 + 首次加词金色高光）、D3b 结束闭环（EndScreen + GET /videos/{id}/vocabulary + /shadowing-sentences + vocabulary.subtitle_id 迁移 c6d7e8f9g0h1 + drill video_id 定向）、D4 六处空状态引导、D5 激励数据（/learning/stats/weekly|event-distribution|heatmap + profile 热力图/占比图/Confetti/StreakBadge）、D6 部分（/notifications 页 + 提醒偏好默认值，beat 任务未做）、D13 /favorites 页 + GET /videos/favorites、D14 反馈入口两处、D15 点赞数。验证：后端 605 passed / 6 skipped（+test_phase1_b0_smoke），前端 tsc/eslint 0 errors、vitest 10 passed、next build 通过（/favorites+/notifications 在路由表）。**待办**：D6 beat 提醒任务、D5 里程碑触发点核实、/knowledge-maintain、D1 移动端真机验收、示范视频指定；待拍板项（登录页 SMS 验证码入口、解锁后自动播放）仍在。

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
4. Phase 0 落地（产品设计规划-2026-08）：D0 访问控制与会员模型 → D1 播放器控制条 → D3a 首页统计行；~~DailyProgressCard / WeeklyCycleCounter 紧凑布局适配~~ 组件已随 D0b 删除，周循环将在 D3a 重建到 profile

## Last Updated

Date: 2026-08-29
- **Phase 1 B0 首批提交**：D2/D3b/D4/D5数据/D6页面层/D13/D14/D15 一次性落地（见 Current Focus）；提交前验证修复三处：notifications 页 TabPills 旧 API 适配、NotificationDropdown 「查看全部」Link 残标修复+导入、notifications 页未用 X 导入清理；后端 605 passed、前端 tsc/eslint/vitest/build 全绿；新迁移 c6d7e8f9g0h1 已应用到本地库。另含 Phase 0 收尾：迁移 revision 重命名（p6q7r8s9t0u1/q7r8s9t0u1v2）+ like-status 路径修复。
- **Phase 0 收尾（数据库迁移 + 冒烟验收）**：发现并修复迁移 revision ID 撞车（新解锁/字号迁移复用旧 c3d4e5f6g7h8/d4e5f6g7h8i9 致 alembic CycleDetected，重命名 p6q7r8s9t0u1/q7r8s9t0u1v2，文档同步更新）；本地库 upgrade head 完成；浏览器冒烟 9 项（7 通过、2 带偏差：登录页无 SMS 验证码入口、解锁后不自动播放）；修复 useVideoMeta 点赞状态请求路径（/like → /like-status，405 消除，浏览器复验 200）；截图存 .debug-shots/smoke-*。未提交（等用户确认是否一并提交）。
- **Phase 0 完成（产品设计规划-2026-08 §4）**：D0 解锁制会员模型（登录墙用 Next 16 proxy 约定 src/proxy.ts + token cookie 镜像；user_video_unlocks 表/幂等解锁/月额度 3/详情与 /media 门控/注册 3 天试用/示范视频 is_demo；/history 已解锁 Tab；卡片三态角标）；D1 自定义控制条（倍速/字幕四模式含隐藏/字号偏好/快捷键统一，↑↓改音量）；D3a 紧凑统计行 + 周循环移 profile；D8b streak 修复；落地页删除。验收：后端 599 passed / 6 skipped（+20 新解锁测试），前端 tsc/eslint 0 errors、vitest 10 passed、next build 通过（Proxy 已注册）。待办见 Current Focus
- **云端数据全量迁移至本地（云端服务器 47.122.127.105 即将停用，换新服务器）**：PostgreSQL（speaking/speaking：6 用户、1 视频、187 字幕、10 兑换码，alembic b2c3d4e5f6a7）已恢复进本地 `speaking-db-1`（seeword/seeword_dev@localhost/seeword，`--no-owner`）；云端 media 卷 2 文件（63288cd3 `_720p`/`_raw`，共 286MB，MD5 校验一致）已放入 `backend/media/`；本地旧媒体（~4.5GB）与旧库已按用户确认清除。备份：本地 `backend/tmp/cloud-migration/`（cloud.env、letsencrypt.tar.gz、seeword.dump、local-db-before-migration.dump）；云端 `/home/admin/migration-to-local/` 留有完整副本。注意：该视频 `thumbnail_url` 仍是外部 ytimg URL（未本地化）
- **全站综合审查 + 修复（docs/progress/REVIEW-2026-08-14.md）**：7 路并行审查 87 条发现（18 高危）；已修复：上传存储型 XSS（服务端扩展名白名单 + nosniff + 媒体扩展名 allowlist）、/media/proxy SSRF（禁重定向 + 移除 aliyuncs.com）、requirements.txt 补 Dypnsapi SDK、watch 快捷键双重监听与 navigateSubtitle seek 失效、admin 引导刷新竞态、limiter Redis 故障 fail-open（in-memory fallback）、草稿/未发布视频媒体发布态门控（owner/admin token 预览）、e2e seed（核心旅程不再 skip）、Celery 任务体直测、SMS 冷却 TTL 测试、nginx ssl 配置挂载 + 安全头 + /media XFF 覆盖、后端容器非 root + HEALTHCHECK、pip-audit/npm audit/dependabot 门禁、deploy 模板对齐 compose、ADR-0013（Shadowing 持久化）与文档漂移更正
- 遗留（见 REVIEW 报告 §8）：fastapi 升级（P2，starlette CVE-2024-47874 显式 ignore）、SQLite→Postgres 测试迁移（延后）、e2e 播放/词汇/考试流程覆盖
- **D2 后续（08-16）**：新增 Postgres 集成测试 `backend/tests/test_celery_tasks_pg.py`（marker `integration`，CI backend job 的 Postgres service 现被 pytest 真实使用）：覆盖 Celery 任务体 `with_for_update(skip_locked=True)` 行锁语义（expire/reconcile/downgrade/expire-codes）、并发不重复处理、reconcile 已支付升级路径、PG 评分 parity。conftest 增加 `PG_TEST_URL`（或显式 postgresql `DATABASE_URL`）探测 + NullPool 引擎（task body 跑在 celery-asyncio loop）；无 PG 时 skip，CI 必跑。
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
