# 全站审计与优化 — 2026-10-24

本轮在 `redesign` 分支上做了一次**只读审计 + 定向修复**：以设计导出
`docs/design/…/重新设计各个导航页内容以及产品功能` 为视觉契约，覆盖前端视觉、前端功能/可访问性、后端架构三条线；审计完成后只修「有明确证据、风险可控」的项，其余进入遗留清单。

> 审计快照：`redesign` @ `a082f6a`（工作区干净）。审计期间有并行修复，视觉报告以 `05:35` 复核为准，`vis-audit-2/3` 是修前、`vis-audit-4` 是修后。

## 1. 结论摘要

- **P0：0 条**。没有未授权即可利用的 RCE / 越权读写 / 数据泄漏路径。
- **P1（后端）：3 条** → 修 2 条：
  - BE-01 生产 `JWT_SECRET` 无强度门（1 字符也能启动）→ **已修**；
  - BE-02 `complete` 行为事件无幂等、重复打冷全站缓存 → **已修**；
  - BE-03 模型与迁移漂移（`alembic check` 20+ 差异）→ **未修**（需要一条「只补不删」的迁移，见遗留）。
- **前端视觉**：颜色 token 12 值逐值对齐、壳层几何 248/56/40/1112 全对、卡片 12px + 发丝线一致；**9 视口 × 13 路由 114 次横向溢出测量全部 0px**。主要偏差是页头层级、词汇/练习/我的/发现四页的核心模块缺失，以及断点错档。
- **前端功能/可访问性**：P0 0、P1 0；P2 6 条**全部修复**，P3 修 4 条、留 2 条。
- **后端**：31 条发现（P1×3 / P2×13 / P3×15），已修 6 条 + 1 条契约补充（`has_password`），其余有优先级建议。

## 2. 本轮已落地的修复

### 2.1 后端

| 编号 | 问题 | 改动 | 验证 |
|---|---|---|---|
| BE-01 | 非 development 只校验 `JWT_SECRET` 非空；`jwt_algorithm` 可被 env 改成任意值 | `backend/app/core/config.py` 增加 ≥32 字符、拒绝开发默认值、算法白名单 `HS256/384/512`；`backend/.env.example` 同步 | `test_config_env_guard.py` 22 passed（新增 6 条强度用例） |
| BE-02 | `POST /behavior/events` 的 `complete` 无幂等：重复调用会重复 `view_count++`、重复发 `completed_video`、每次删光 `browse:*` / `rankings:snapshot:*` | `behavior_service.py` 用 Redis 去重键（6h，按 user+video+session）在**副作用层**去重；`ingest_*` 返回「是否真的写了副作用」，`behavior.py` 只在首次完成时失效缓存；Redis 故障 fail-open，不阻断播放埋点 | 新增 `test_duplicate_complete_is_idempotent`；`test_behavior_api.py` 13 passed |
| BE-18 | 历史交卷列表用 `int(score * question_count)` 反推答对数，截断少报 | `exam_service.list_attempts` 改为按 session 聚合 `ExamAnswer.correct` | `test_attempt_history_correct_count_uses_answer_rows`；`test_exams_api.py` 21 passed |
| BE-24 | 字幕搜索无条件用 `plainto_tsquery`，SQLite 测试库直接报错、且无测试覆盖 | `search_service.search_subtitles` 按方言分流（Postgres FTS / 其他 ILIKE） | `test_search_d7.py` 新增 2 条，16 passed |
| BE-05 | nginx 限流 location 指向不存在的 `/auth/login|register`，真实入口完全无限流 | `nginx.conf` / `nginx.ssl.conf` 改为 `sms/login`、`phone-login`、`sms/register`、`sms/reset-password`、`sms/send-code` 的精确 location | 配置 grep 核对；未在真实 nginx 上 reload（本机无生产） |
| BE-26 | 未启用金数据时 compose 仍强制要求 `JINSHUJU_PURCHASE_TOKEN_SECRET` | `docker-compose.prod.yml` 改为 `${VAR:-}`，必填判断留在 `config.py`（已实现） | 配置读码；`docker compose config` 未执行 |
| F4 契约 | 前端无法知道账号是否已设密码，已设密码用户进 `/set-password` 必然 400 | `User.has_password` 模型属性 + `UserResponse.has_password`（只增字段） | `test_auth.py` 断言 `has_password is True` |

### 2.2 前端视觉（设计还原）

- 首页页头改为设计稿的**小号大写眉标**（`11–12px` 灰、`letter-spacing`），不再是 30px 粗标题；同时修正 feed 分隔线、首屏留白（`frontend/src/app/user-ui.css`、`(main)/page.tsx`）。
- 首页右栏第一张卡从「暗色会员风」改回**白底描边卡**（今天到期 / 复习 / 42px 到期数 / 单一主操作），与设计一致（`DiscoverRail.tsx`）。
- 首页补上整段缺失的**「已订阅的频道」**（`HomeSubscribedChannels.tsx`，3 列紧凑条，失败/空自动隐藏，不阻塞首页）。
- 首页主推 CTA 改为「**从这句话开始**」，跳转带 `?t=<引文句 start_time>`，并显示「N 句逐句字幕」（`FeaturedVideoCard.tsx`）。
- 断点对齐设计：**≤1024 收侧栏 + 底部导航，≥1025 显示侧栏**；同步 `TopBar`、`MobileTabBar`、`AccountMenu`、观看页内部四处 `useMediaQuery`，避免 1024 出现「移动壳 + 桌面观看布局」的混合态。`docs/audit-2026-10-24/shots/vis-audit-3-home-1024x768.png` 是修前证据，`docs/evidence/audit-2026-10-24/bp-home-1024.png` / `bp-home-820.png` 是修后。
- 移除页头下的装饰横线；移动端顶栏补回「SeeWord」品牌文字；搜索空结果文案改为「没有找到「query」/ 试试更短的词，或者直接搜中文释义。」
- 桌面 hover 色 `#0066cc → #0077ed`，与设计 token 对齐。

**第二轮补强（审计报告列出的 P1/P2 结构缺口）**

- **词汇页首屏**：新增 `VocabOverview`，按设计补齐深色「今天复习」到期卡（到期数 / 开始复习 / 全部 N 词）、四项统计卡（全部词汇 / 学习中 / 已掌握 / 新词）与「词单」进度网格；数据全部来自 `/vocabulary/stats` 与 `/vocab-sets`，训练/词库视图保留在下方（`src/components/vocabulary/VocabOverview.tsx`）。
- **练习页选择试卷**：把原来的套卷列表改成设计稿的 **3 列 paper-card**（可作答状态、题量、构成、建议用时、选中蓝框）与「已选择」操作条；套卷请求改为混合级别（原来固定 `cet6`、只取 3 套），选中的试卷直接进入 `/practice/exams/{id}`（`(main)/practice/page.tsx`）。
- **我的页两张卡**：右栏补深色会员卡（会员状态 / 有效期 / 查看会员）与账户卡（手机号、会员状态、未读通知，均来自真实用户与通知 store），同时保留「相关页面」（`(main)/profile/page.tsx`）。
- **列表页眉标系统落地**：`PageHeader` 的 `eyebrow` 变体改为设计契约的 12px 大写字距眉标（原为 20px），词汇 / 频道 / 收藏 / 历史 / 通知 / 我的 / 排行 / 会员 / 搜索 / 词单 / 复习 / 套卷 / 听力等列表页统一启用；eyebrow 下不再渲染重复的字符串 crumb，移动端强制左对齐（`ui/PageHeader.tsx`、`user-ui.css`）。
- **频道详情 hero**：补设计稿的 380×240 频道封面（桌面三列：封面 / 正文+订阅 / 事实行），替换原来的 56px 圆头像标题（`(main)/channels/[slug]/page.tsx`）。
- **会员页状态卡**：补设计稿的深色「当前状态」卡（会员/免费、有效期、先去复习/做一套真题），权益卡与价位卡保留（`(main)/upgrade/page.tsx`）。
- **学习记录统计**：四个统计数字从裸铺画布改为设计稿的描边卡内（`(main)/history/page.tsx`）。
- **首页右栏精简**：移除设计里没有的「查看学习记录」额外卡片，右栏收敛为到期 / 正在学 / 本周节奏三张卡（`home/DiscoverRail.tsx`）。

### 2.3 前端功能 / 可访问性

| 编号 | 问题 | 改动 |
|---|---|---|
| F1 | 通知浮层在 StrictMode 下永久转圈（`hasFetchedRef` + `cancelled` 竞态） | `NotificationDropdown.tsx` 去掉重入 ref，`finally` 里无条件落 `isLoading=false` |
| F2 | `TabPills` 是裸 `<button>`，读屏拿不到选中态 | 每个按钮补 `aria-pressed`（筛选/切换按钮的正确语义） |
| F3 | 「跳到正文」是第 17 个可聚焦元素 | 移到壳层根节点、`Sidebar` 之前，成为第一个 Tab 停靠点 |
| F4 | 已设密码账号访问 `/set-password` 只有通用 400 文案 | 进页先读 `/users/me.has_password`，已设密码直接显示「去账号设置修改密码」引导；提交遇 400 也落到同一状态 |
| F5 | 对比度 AA 不达标（侧栏眉标 3.62:1、榜单 4.30:1、字幕元信息 4.48:1） | `--muted-c: #5f5f66`、`--muted-soft: #69696f`，在 `#fff / #f5f5f7 / #ececef / #e8f2fd / #fbfbfd` 上均 ≥4.5:1（暗色 token 不动） |
| F6 | 移动端触控目标 <44px | 顶栏搜索 40→44、通知按钮 44、复习 chip 高 44、`TabPills` 移动端 ≥44、通知/收藏行内操作 `min-h-11`、观看页「跟随」label 44、个人页 tab 允许换行不裁切 |
| F8 | 通知浮层无角色、铃铛无展开态 | `role="dialog" + aria-label="通知"`，打开移焦到浮层；铃铛补 `aria-haspopup/aria-expanded` |
| F9 | 404 页 `h1` 文本是「404」 | `h1` 改为「页面不存在」，404 数字降为装饰（`aria-hidden`） |
| F10 | `/history` 标题从 h1 跳到 h3 | 分组标题改 `h2` |
| F11 | `/channels` 搜索无显式清空 | 输入框内补「清空频道搜索」按钮，筛选态补「清空筛选」 |
| F13 | 820px 个人页 tab 被裁切 | `flex-wrap` + `min-[1025px]:flex-nowrap` |

### 2.4 测试与门禁更新

- `e2e/design-rollout.spec.ts` 的「导航按断点切换」按**新设计契约**改为：375/768/1024 无侧栏 + 有底栏；1025/1280/1440 有侧栏 + 无底栏；1024/1025 两档都钉住。这是产品行为变更后的契约同步，不是放宽检查。
- `backend/tests/test_llm_provider.py` 的测试 `Settings` 夹具改用 ≥32 字符 JWT secret，配合 BE-01 的新强度门。
- 未新增任何迁移、未删除表、未改基线/白名单/豁免。

## 3. 验证记录

| 检查 | 结果 |
|---|---|
| 前端 `npm run check`（9 条设计系统 + 会话写入 + `tsc` + ESLint + Prettier） | **通过** |
| 前端单测 | **30 文件 / 332 项通过** |
| 后端 `ruff check app tests` | **All checks passed** |
| 后端全量 `pytest tests/ -q` | **1343 passed, 16 skipped**（16 条需独立 `PG_TEST_URL` 的 integration 默认跳过） |
| 本轮针对性后端测试 | config 22、exams 21、search 16、behavior 13、auth 4 全绿 |
| e2e 定点 | 断点用例**通过**；`design-rollout` + `public-layout` 共 8 条通过，4 条因**dev 后端限流 429** 未跑通（`frontend/CLAUDE.md` 明确要求 e2e 用 `ENV=testing` 后端；本条记为未执行，不算产品缺陷） |
| 浏览器复核（Playwright，1440/390） | 首个 Tab = 「跳到正文」；`aria-pressed` 存在；通知浮层 `dialog` + 空态、无 spinner；`/channels` 清空按钮存在；404 h1 = 「页面不存在」；已设密码账号出现引导、首设密码账号出现表单；触控 `search 44×44 / chip 52×44 / tab 78×60`；断点 1024/820/768/600/390 无侧栏且有底栏、1920/1440 反之；横向溢出 0 |
| 视觉审计 | 13 路由 × 1440/390 全页 + 暗色 + 1024/820 定点共 57 张；114 次溢出测量 0px |
| 第二轮结构补齐复核 | 词汇页真实账号（14 词 + 2 个词单）出现到期卡/四项统计/词单网格；练习页出现 3 列试卷与已选条；我的页出现深色会员卡/账户卡；12 条列表路由 h1 实测 `12px / uppercase`、无横向溢出；移动端眉标左对齐（h1 x=16） |
| 第二轮 P2 复核 | 首页右栏无「查看学习记录」额外卡；频道详情封面实测 378px 宽；会员页出现「当前状态」深色卡；学习记录 4 个统计位于 1px 描边卡内；四页横向溢出 0 |
| Alembic | 未新增/修改迁移；`current == heads == o6p7q8r9s0t1`（审计时结论，本轮未动迁移） |

### 未执行（如实标注）

- **全量 e2e / 四浏览器**：dev 后端会 429，需按 `frontend/CLAUDE.md` 用 `ENV=testing` 的测试后端 + `seed_e2e.py` 重跑；本轮只跑了定点用例。
- **真实支付 / 真实短信 / 生产构建 / 部署 / nginx reload**：按约束不做。
- **屏幕阅读器真机、真机安全区**：只做了 DOM/ARIA 与几何测量。
- **BE-03 迁移漂移修复、BE-04 媒体 token 全链路、BE-06 SMS dev-fake、BE-08 周统计、BE-09 无界查询、BE-11 回调重试、BE-12 管线锁、BE-13/14/15/16/17/19–23/25/27–31**：未修，建议见 `backend-architecture.md`。
- **前端剩余结构性缺口**：收藏页 3 类 tab + 内联笔记的密度、通知页的精简列表、应用壳页脚（设计无、但保留协议/隐私/反馈入口）、侧栏折叠与其余打磨项；首页继续观看、频道 hero、会员状态卡、学习记录统计卡已在本轮补齐。

## 4. 证据索引

- 三份分报告：[`frontend-visual.md`](frontend-visual.md)、[`frontend-functional.md`](frontend-functional.md)、[`backend-architecture.md`](backend-architecture.md)
- 截图：`docs/audit-2026-10-24/shots/`（修前/修后视觉对比）、`docs/evidence/audit-2026-10-24/`（功能、断点、移动端、修复后）
- 关键图：`vis-audit-3-home-1024x768.png`（修前断点）、`docs/evidence/audit-2026-10-24/bp-home-1024.png`（修后断点）、`fix-mobile-home.png`（移动端修复后）、`home-with-subscriptions.png`（首页已订阅段）
- 原始读数：`metrics.json`、`_sweep-*.json`、`_contrast-recheck.json`、`_recheck.json`（`_*.json` 含临时账号 token/手机号，按 `.gitignore` **仅留在本机**，不入库；脚本同理）

## 5. 遗留优先级建议

1. **BE-03 迁移漂移**：先补一条只增不删的迁移 + CI 加 `alembic check`；这是下一次 `autogenerate` 最可能造成数据损失的地方。
2. **前端剩余结构缺口**：收藏页 3 类 tab + 内联笔记、通知页精简列表、首页继续观看占位——按设计稿逐块补，先做只读展示再接交互。
3. **BE-04 / BE-15**：媒体与 WebSocket 的 token 校验收敛到 `dependencies.py` 的同一条链（黑名单 / 改密 / 封禁）。
4. **BE-06**：`SMS_DEV_FAKE` 显式开启 + `verify_code` 校验 Redis 存在性，堵住「漏配 ENV 即固定码 1234 登录」。
5. **F7**：频道订阅乐观更新；**F5 剩余**：把 `--hairline-strong` 用作正文色的少数点位收掉。
6. **e2e 全量**：用 `ENV=testing` 后端 + `seed_e2e.py` 跑 `--project=chromium` 与 mobile projects，把本次未执行项补齐。
