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
