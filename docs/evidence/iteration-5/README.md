# 迭代 5（A14 / A15）实施记录 — 2026-10-31

范围：A15「按业务边界渐进拆分：FE-06 与后端架构债」的可验证切片；A14「任务型用户研究与单项体验实验」只产出预注册协议。
**A14 的研究没有执行**（没有招募用户，也没有任何体验结论）；**轨道 B 放量未开始**（B01–B05 本身尚未实现）。

## 1 A15 切片与落点

| # | 切片 | 新文件 / 改动 | 对外契约 |
| --- | --- | --- | --- |
| F1 | 字幕词着色四档（学习态 > 已掌握 > 目标级别 > 无）从页面组件抽出为纯函数 | `frontend/src/lib/watchWordHighlight.ts` + 单测 | 不变（仍由 `levelClassFor` 驱动渲染） |
| F2 | 词卡来源句解析与「再点同一个词 = 收起」判定 | `frontend/src/lib/watchWordSource.ts` + 单测 | 不变（`?word=` 深链、字幕行点词、重听来源全部沿用） |
| F3 | 观看页词卡状态机（锚点矩形、来源句、回看原句） | `frontend/src/hooks/useWatchWordCard.ts` | 不变 |
| F4 | 观看页词汇读模型（学习/已掌握词表、过筛集合、加入学习） | `frontend/src/hooks/useWatchVocabulary.ts` | 不变（`/vocabulary/words?mastery=…`、`/vocab-sets` 调用与失败降级一致） |
| F5 | 观看页偏好读写（目标级别、字幕字号） | `frontend/src/hooks/useWatchPreferences.ts` | 不变（`/users/me/preferences` GET/PUT，写失败仍保留本次选择） |
| F6 | 播放生命周期 → 媒体 UI 状态的共同映射，两条播放后端共用 | `frontend/src/lib/mediaLifecycle.ts` + 单测；`useVideoPlayer` 改为 `applyMediaEvent` | 不变（HTML5 与 YouTube 的状态语义逐条对齐，未知 IFrame 状态仍落 paused） |
| B1 | 管理端仪表盘读模型从 `admin_service`（900+ 行）拆出 | `backend/app/services/admin_stats.py`（341 行移出）、路由改调 `admin_stats.get_admin_stats` | 不变（路径、响应模型、Redis 缓存键与 TTL 均未变） |
| B2 | 管理端日期序列化统一到一处 | `backend/app/core/time_utils.py::iso_or_none` | 不变 |
| B3 | 契约测试不再每条断言重建应用 | `backend/tests/test_response_contract.py`：OpenAPI 文档按进程缓存一次 | 断言内容与数量不变（38 条） |
| B4 | 修掉一条与运行时刻相关的既有 flaky：支付汇总的「今日」断言在 UTC 00:00–01:00 必红 | `backend/tests/test_admin_payments.py::test_summary_math`：把支付时间夹在当天 UTC 日界之后 | 断言不变（仍要求 `paid_today_fen == 1990` 等） |

页面侧净变化：`frontend/src/app/(main)/watch/[id]/page.tsx` 减少约 300 行；`useVideoPlayer` 的两套状态映射合并为一处。

「保存」两个既有边界本轮未动：播放进度保存已在 `lib/watchProgressQueue.ts`（串行队列 + 失败重试），笔记持久化在 `hooks/useVideoMeta.ts`；它们已经是清晰的接口，没有为拆分而拆分。

## 2 本轮实际执行的验证

| 检查 | 命令 / 环境 | 结果 |
| --- | --- | --- |
| 前端门禁 | `frontend/` · `npm run check` | **exit 0**：设计系统 9 条 + 会话写入 2 条 + tsc + ESLint + Prettier 全通过 |
| 前端单测 | `npm run test:unit` | **36 文件 / 361 项通过**（新增 3 个测试文件，基线 33 / 341） |
| 观看页 e2e（fixture 型） | `npx playwright test e2e/watch-desktop-stage.spec.ts e2e/watch-end-screen.spec.ts e2e/watch-return.spec.ts e2e/watch-layout.mobile.spec.ts e2e/watch-immersive.mobile.spec.ts e2e/watch-baseline-mobile.spec.ts --project=chromium --workers=1` | **45 passed / 1 failed**；失败的是 `watch-immersive.mobile.spec.ts`「A/R/D 与按钮共用逐句语义」的「重听在句末暂停」断言。**同一测试在本机 `master` 检出（未含本轮改动）单独复跑同样失败**，判定为本机既有失败，不是本轮回归 |
| 观看页 e2e（fixture 型，移动端 project） | `npx playwright test e2e/watch-baseline-mobile.spec.ts e2e/watch-layout.mobile.spec.ts e2e/watch-immersive.mobile.spec.ts e2e/mobile-watch-chrome.spec.ts --project=mobile-chrome --workers=1` | **41 passed / 1 failed**；失败与上一行是同一个用例（本机 master 同样失败）。Firefox / WebKit 浏览器未安装，两个 project 未跑 |
| 观看页 e2e（真实后端） | 同上，含 `watch.spec.ts` | 首轮 8 failed：`watch.spec.ts` 的用例走真实注册，被 **dev 后端 429**（注册限流）拒绝；另 3 条桌面尺寸用例在首轮冷启动下媒体就绪超时。**未用 testing 形态后端复跑，如实记未完成** |
| 后端 ruff | `ruff check app/ tests/`、`ruff format --check app/ tests/` | 通过（337 files formatted） |
| 后端 mypy 基线门 | `mypy app --ignore-missing-imports` + 与 `.mypy-baseline` 的 `comm -23` | **0 条新增**（拆分时新模块暴露的 2 条已按真实修复处理，未加基线） |
| 后端定点测试 | `pytest tests/test_admin_panel.py tests/test_admin_payments.py tests/test_presence.py tests/test_response_contract.py -q` | **85 passed**（436s） |
| 契约测试提速 | `pytest tests/test_response_contract.py -q` | **38 passed in 43.86s**（此前同文件每条断言都 `create_app().openapi()`） |
| 后端全量套件（首跑） | `pytest tests/ -q --timeout=120`（内存 SQLite + fake Redis） | **1475 passed / 1 failed / 23 skipped**（1,191.95s）。唯一失败是 `test_admin_payments.py::TestPaymentSummary::test_summary_math`：它在 **UTC 00:00–01:00** 运行时，「1 小时前」会落到昨天，`paid_today_fen` 断言必红（本轮实测于 UTC 00:30；与本轮改动无关）。已把该用例的两条支付时间夹在当天 UTC 日界之后，断言不变，`test_admin_payments.py` **20 passed**；修复后的全量复跑见下一行 |
| 后端全量套件（修复 flaky 后复跑） | 同一条命令 | **1476 passed / 0 failed / 23 skipped**（1,104.39s，exit 0）；23 skipped 为需要 `PG_TEST_URL` 的 PostgreSQL 集成用例等仓库既有跳过项 |
| 浏览器实际走查（ego-browser） | 工作区 dev（webpack，:3001）+ 本机 dev 后端（:8000），登录后打开真实观看页 | 页面正常渲染；点词打开词卡、来源行显示「《标题》第 1 句 · 原句」；再点同一个词收起；「加入词库」后 `GET /api/v1/vocabulary` 返回该词且带 `context_sentence`（来源句解析生效）；「笔记」面板打开可见输入框。截图因本机 CDP 截图超时未产出，以 DOM 快照为证 |

## 3 未执行

- A14 的招募、任务观察、实验分组与分析：未执行（协议见 [`docs/a14-research-protocol-2026-10-31.md`](../../a14-research-protocol-2026-10-31.md)）。
- 全量后端套件与 PostgreSQL 集成用例：全量已复跑 **1476 passed / 23 skipped**；其中需要 `PG_TEST_URL` 的 PostgreSQL 集成用例按仓库约定跳过，**未在本轮真实执行**。
- Firefox / WebKit / mobile-chrome 三个 project：未跑；本轮 e2e 只用 chromium。
- 真实后端形态的 `watch.spec.ts`：被 dev 限流挡住，需 `ENV=testing` 后端 + 独立库后才能作为通过证据。
- 生产部署与生产 smoke：未执行。
- A15 尚未拆分完的部分：`useVideoPlayer` 仍持有两套后端的事件接线（YouTube IFrame 与原生 `<video>`），`HomeLayoutEditor.tsx`（1,013 行）与 `home_content_service`（2,148 行）等大文件未动。它们不在本轮切片内，不宣称已完成。

## 4 本机附带变更（不在仓库内）

- 走查时在 dev 库用固定假验证码创建了一个测试账号 `13900000001`（`onboarding_completed=true`），并给它加入了一条词汇 `actually`（带来源句）。属于本机 dev 数据，未写入生产。
- 为跑 e2e 与走查，:3000 上的 Next dev 曾从主检出停止并按工作区重启；工作区缺少可用的 Next 依赖解析（`node_modules` 是指向主检出的符号链接，Turbopack 拒绝跨根解析），因此工作区 dev 用 `next dev --webpack` 启动。结束后 :3000 已恢复为**主检出**的 `npm run dev`。

## 5 第二轮（2026-11-01）：A14 事件接线 · A15 剩余拆分 · B01

### 5.1 落点

| # | 切片 | 落点 | 对外契约 |
| --- | --- | --- | --- |
| A14-1 | 契约升到 v3，新增 `gloss_open` / `replay` 与 10 秒配对窗口 | `backend/app/services/event_contract.py`、`frontend/src/lib/analytics.ts`、`docs/comprehensive-audit-2026-10-29/metrics.md` | 行为事件仍是 `{event_id,event_type,event_payload,flow_id,schema_version}`；旧客户端 v1/v2 照旧入库。两个新事件**不进** `MEANINGFUL_EVENT_TYPES` |
| A14-2 | 词卡打开发 `gloss_open`（带本次词卡自己的 `flow_id` 与句号） | `frontend/src/hooks/useWatchWordCard.ts` | 无（不改词卡行为） |
| A14-3 | 重听发 `replay`；落在 10 秒窗口且同句时带同 `flow_id`（`from_gloss=true`） | `frontend/src/lib/analytics.ts`（`matchesGlossLink` / `glossFlowForReplay`，模块级记忆）、观看页 `handleReplay` | 无 |
| A15-1 | YouTube IFrame 后端接线从 `useVideoPlayer` 抽出 | 新 `frontend/src/lib/youtubePlayer.ts`（脚本加载 / 创建 / 销毁），hook 只留回调与播放时钟 | 无（`isYtMode`、seek、倍速、音量的调用点不变） |
| A15-2 | 后台首页编排编辑器按边界拆成 5 个文件 | `HomeLayoutEditor.tsx`（1,013 → 297 行骨架）、`hooks/useHomeLayoutEditor.ts`（状态机与三条写路径）、`LayoutSlotSections.tsx`、`LayoutCandidateSelect.tsx`、`LayoutPositionSummary.tsx` | 无（页面路径、接口调用、`expected_revision` 冲突语义不变） |
| A15-3 | 后端首页内容服务按业务边界拆成三层 | `home_content_content.py`（常量 / 指纹 / 字段校验 / DTO）、`home_content_layout.py`（布局读写与公共读取）、`home_content_service.py`（草稿、不可变版本、生成状态机，2,148 → 1,024 行）；`home_content_service` 重新导出另两层的公开名字 | 无（路由、Celery 任务、测试仍按 `home_content_service.<name>` 访问） |
| B01 | 逐句听写增加「看原文跟打 / 听音默写」模式；判分归一化补单测 | `frontend/src/lib/listeningMode.ts` + 单测、`practice/listening/[id]/page.tsx`；`backend/tests/test_listening_grading.py` | 无（会话冻结、草稿、判分与提交幂等不变；跟打模式的原句来自公开的 `GET /videos/{id}`，不改会话题面） |

### 5.2 本轮实际执行的验证

| 检查 | 命令 / 环境 | 结果 |
| --- | --- | --- |
| 前端门禁 | `frontend/` · `npm run check` | **exit 0**：设计系统 9 条 + 会话写入 2 条 + tsc + ESLint + Prettier 全通过（ESLint 0 warning） |
| 前端单测 | `npm run test:unit` | **38 文件 / 375 项通过**（新增 `analyticsGloss`、`listeningMode` 两个测试文件） |
| 后端 lint | `ruff check app/ tests/`、`ruff format --check app/ tests/` | 通过（340 files formatted） |
| 后端 mypy 基线门 | `mypy app --ignore-missing-imports` + 与 `.mypy-baseline` 比对 | **0 条新增**（基线 39 条中 4 条因代码移动已不再出现，未改基线文件） |
| 后端定点 | 首页内容三套件 + 听写 API + 新判分单测 | **122 passed**（83s） |
| 后端事件契约 | `pytest tests/test_measurement_service.py` | **8 passed**（新增 v3 `gloss_open`/`replay` 入库用例；这条在 1492 那次全量之后补入，单独运行通过，未再跑一次全量） |
| 后端全量套件 | `pytest tests/ -q`（内存 SQLite + fake Redis） | **1492 passed / 0 failed / 23 skipped**（1,147s）；23 skipped 仍是需要 `PG_TEST_URL` 的集成用例等既有跳过项 |
| 浏览器走查 B01（ego-browser） | 工作区 dev（webpack，`:3001`）+ 本机后端 `:8000`，登录后打开真实 `/practice/listening/{id}` | 练习模式组渲染两个按钮；`aria-pressed` 正确随选择切换；「看原文跟打」显示原句「I walk into the office every morning.」；刷新后模式保持；切回「听音默写」原句隐藏 |
| 浏览器走查 A14（ego-browser） | 同一会话打开 `/watch/{video_id}`，拦截 `POST /behavior/events/batch` 的请求体 | 点词后发出 `gloss_open`（`schema_version=3`，`word=welcome`，`sentence_index=0`，`flow_id=9f66…`）；随后点「重听本句」发出 `replay`（**同一 `flow_id`**，`from_gloss=true`，`sentence_index=0`） |

### 5.3 未执行

- **后台首页编排页面的浏览器走查**：需要管理员会话。本机 dev 库刚迁移，没有既有管理员；把测试账号提升为 `admin` 的命令被 auto-mode 拒绝，因此只做了类型/静态检查，**没有在浏览器里打开该页面**。
- 真实后端形态的 `watch.spec.ts`（需 `ENV=testing` 后端 + 独立库）、Firefox / WebKit project、需要 `PG_TEST_URL` 的 PostgreSQL 集成用例、生产部署与 smoke：与第一轮相同，未执行。
- A14 的研究本身（招募、任务观察、实验分组）：仍未执行。本轮只把主指标依赖的两个事件接线可用，**不是**实验已在跑。
- 轨道 B 的 B02–B05：未实现（B02 仍卡在 D3 决策）。

### 5.4 本机环境变更（不在仓库内）

- **dev Postgres 的 `seeword` 库此前是空的（0 张表）**，`:8000` 后端所有读库接口都返回 500。经用户同意后本轮执行了 `alembic upgrade head`（84 个 revision）与 `python scripts/seed_e2e.py`，现有 49 张表；页面恢复正常。迁移前该库没有任何数据，因此没有覆盖任何内容。
- 走查用测试账号 `13900000001` 由短信假码登录创建（`is_new_user=true`），并在界面上完成首次引导（目标级别 B1 / 大学英语四级）。属本机 dev 数据。
- 工作区 dev 运行在 `:3001`（`next dev --webpack`，因为工作区的 `node_modules` 是指向主检出的符号链接）；`:3000` 仍是主检出的 `npm run dev`。本轮另起过一个 `:8005` 后端用于定位 500 的原因，已停止。
- **`:8000` 当前跑的是主检出（master）代码**：它把 `schema_version=3` 的行为事件按 422 拒绝，前端因此会重试并重复上报同一条事件。这在两侧同时发布后不会出现；本轮以「请求体内容」与后端 v3 用例作为证据，未把它记成端到端已通过。
