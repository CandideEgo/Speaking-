# SeeWord 后台管理面板前端审计（2026-10-26）

- 审计对象：本地 dev 后台 `http://localhost:3000/admin/**`（`redesign` 分支，Next.js 16 App Router + React 19 + Tailwind v4；后端 dev `:8000`）。
- 性质：**只读审计**。未修改 `frontend/src` 应用代码、未提交 git、未访问生产、未执行真实支付/短信/群发。所有写入只发生在 `docs/admin-audit-2026-10-26/`（本报告）、`docs/evidence/admin-audit-2026-10-26/`（截图与 JSON）与 `.tmp-diag/frontend-audit/`（临时 Playwright 脚本）。
- 快照时间：**2026-10-26 12:15–12:45（America/Denver）**。审计期间并行队友正在删除兑换码/订单面（`/admin/invites`、`/admin/orders`、`/redeem` 与相关 KPI/类型/接口），本报告按「这些页面已不存在」的读取状态审计，**不把它们消失本身当缺陷**；与收款可见性相关的信息架构缺口见 §6。
- 已有审计去重：`docs/audit-2026-10-24/frontend-visual.md` / `frontend-functional.md` 覆盖的是**用户端**，后台面板未被审计过；其中 F2（TabPills 语义）、F5（对比度）、F6（触控目标）在后台有**独立实现**（AdminTabs/FilterPills、text-success、后台壳层），本报告按后台代码/实测重新取证，不复述用户端结论。

## 0. 结论速览

- 后台骨架（独立会话、路由守卫、侧栏分组、面包屑、暗色 token）是**可用且结构清晰**的：8 个页面在 1440×900 与 390×844 下**页面级横向溢出全部为 0px**，暗色模式通过 token 翻转生效且 axe 对比度扫描干净。
- 主要问题集中在四类：
  1. **信息架构**：兑换码/订单面删除后，后台**完全没有金数据收款/收入的可见性**，运营无法核对到账、补发 pending、发现 ignored/error 记录（P1，§6 给完整替代方案）。
  2. **配置诚实性**：系统设置里多个开关/字段写库但运行时根本不读（含「启用支付」），质量阈值把 0–1 的比率标成 `%`，输错只回英文 pydantic 文本（P2）。
  3. **错误与空状态**：`/admin/settings`、`/admin/stats` 接口失败会停在**永久骨架**（无错误、无重试）；视频/用户列表失败被渲染成「暂无数据」；壳层把 `/users/me` 的 5xx 当会话过期踢回登录（P2）。
  4. **可访问性欠账**：后台 26 个 `<label>` 26 个没有 `htmlFor`；用户行操作图标按钮无名称（每页 20 个）；确认弹窗无 role/aria-modal/焦点陷阱；移动端关闭态抽屉仍在 Tab 序列里（P2）。
- 统计：**P1 × 1，P2 × 21，P3 × 18**。另有「已核查通过」清单与「未验证项」，见 §4/§9。

| 页面 | 走查结论（1440 / 390） | 主要问题 |
| --- | --- | --- |
| `/admin/login` | 桌面双栏品牌 + 表单正常；错误文案正确显示 | 无 `next` 回跳；错误无 live region；眼睛按钮无名；labels 未关联 |
| `/admin`（仪表盘） | KPI/趋势图/系统状态/UGC 队列/快捷入口齐全；trend chart 懒加载 | 接口失败时整页只剩错误卡（无 h1、无部分渲染）；`text-success` 对比度 3.29:1 |
| `/admin/videos` | 20 行表格、筛选三组、展开行编辑、删除/驳回确认齐全 | 搜索无防抖（7 击键 7 请求）；失败→「暂无视频」；下线无确认；勾选行换行错版 |
| `/admin/videos/[id]` | 元数据 + 首页内容 + 质量报告 + 字幕编辑器全部可用 | 失败只 toast →「视频未找到」；390 字幕编辑器 2191px 内容；标题溢出 |
| `/admin/home-editorial` | 位置总览/草稿编辑/发布/回滚/预览闭环，状态机与冲突提示完善 | 保存/发布按钮在长页底部不可粘性；无离开保护 |
| `/admin/channels` | 24 个频道表、新建/编辑/隐藏/删除齐全 | 表格 390 横向滚动；排序只能选 0–20；无搜索 |
| `/admin/users` | 20 行用户表、角色/方案筛选、展开送 Pro、封禁/降级确认 | 行展开不可键盘；操作菜单无名称；末行菜单被裁；送 Pro 可连点重复提交 |
| `/admin/feedback` | 公告表单 + 反馈卡片 + 状态修改/回复可用 | 17 个状态 select 无名；列表固定 50 条无分页；公告无二次确认 |
| `/admin/settings` | 分组卡片 + 粘性脏状态保存条 | 失败永久骨架；阈值单位错；4 个死配置；无离开保护 |
| `/admin/stats` | 8 KPI + 趋势/分布/漏斗/最近活动 | 失败永久骨架；h1→h3 跳级；无收入指标 |

---

## 1. P1

### A-01 兑换码/订单面删除后，后台没有任何「真实收款记录」的入口（收入与到账核对能力归零）

**位置/证据**

- 导航已无收款/订单入口：`frontend/src/components/admin/AdminSidebar.tsx:45-75`（概览/内容/运营/数据/系统五组，运营只剩用户管理 + 反馈公告）。
- 管理端数据层无任何付款函数：`frontend/src/lib/adminData.ts`（`listOrders`/`listRedemptions`/`redemptionSummary` 已随本次并行改动删除）。
- 后端**不存在**读取金数据收款表的 admin 接口：全仓 `JinshujuPayment` 只被 `backend/app/services/jinshuju_service.py` 读写（`select(JinshujuPayment)` 仅出现在同步/补发逻辑里），`backend/app/api/v1/admin.py` 的 12 个 admin 路由无 payments 相关；`AdminStatsResponse`（`backend/app/schemas/admin.py:143-162`）只有用户/视频/词汇/队列字段，**没有任何金额或笔数**。
- 站内已改为「站外金数据收款 + 后台自动开通」：`backend/app/models/jinshuju_payment.py:1-16`（幂等键 `entry_token`；`pending/applied/ignored/refunded/error` 五种状态，其中 ignored 需人工核对、pending 等注册补发）。
- 实测证据：仪表盘/数据统计均无金额指标（`docs/evidence/admin-audit-2026-10-26/desktop-dashboard-clean.png`、`desktop-stats.png`）；侧栏无入口（`desktop-report.json` → `pages[].nav.links`）。

**影响**

- 运营看不到今日/本月收入、笔数、档位分布，无法对上金数据账单；
- 用户付款后若落到 `pending`（账号未注册）或 `ignored`（档位/金额异常）或 `error`，**后台没有任何页面能发现**，用户「付了钱没到账」只能靠客服转述；
- 退款（`refunded`）状态不自动回收，需要人工决定是否追回，但没有可看的数据；
- 与「订单管理/兑换码删除」同时发生，等于把唯一的交易面一起删掉了。这是本次删除留下的**业务阻断级缺口**，修法见 §6。

---

## 2. P2

### 正确性 / UX

#### A-02 视频列表搜索无防抖：每个击键发一次列表请求（7 击键 = 7 请求），且极易撞 30/min 限流

**位置**：`frontend/src/app/(admin)/admin/(shell)/videos/VideoManager.tsx:359-368`（裸 `Input`，只在 Enter 时显式 `loadVideos(1)`）+ `:145-174`（`loadVideos` 以 `keyword` 为依赖，`useEffect([loadVideos])` 每次击键重跑）。

**证据**
- 实机：在搜索框逐字输入 `grammar`（7 字符，间隔 90ms）→ **7 次** `GET /api/v1/videos/admin?page=1&page_size=20&keyword=...`；对照用户页搜索（`AdminSearchInput`，debounce 300ms）3 击键只发 **1** 次。读数 `docs/evidence/admin-audit-2026-10-26/ix-report.json` → `videosSearch` / `usersSearch`。
- 后端该端点 `@rate_limit("30/minute")`（`backend/app/api/v1/videos.py:250-252`），连续搜索 + 分页/刷新很容易超限；超限后列表只弹「加载视频列表失败」，旧数据留在屏幕上。

**修复**：videos 搜索改用现有 `AdminSearchInput`（带 debounce + 清空按钮 + 可访问名），或本地 `useDebouncedValue(300ms)`；`Enter` 保留为立即触发。顺带补 `type="search"` 与清空按钮 `aria-label`。

**影响**：慢网下每次击键都重置列表并可能把表格闪成骨架；限流时搜索表现为「加载失败」而非「输入太快」。

#### A-03 设置页 / 数据统计页请求失败后停在**永久骨架**，无错误态、无重试

**位置**：`frontend/src/app/(admin)/admin/(shell)/settings/page.tsx:237-239`（`if (loading || !form) return <AdminSkeleton.Page />`，load 失败只 `toast.error`，`form` 永远为 null）；`frontend/src/app/(admin)/admin/(shell)/stats/page.tsx:179-181`（同型：`if (loading || !stats)`，catch 只 toast）。

**证据**：把对应接口 mock 成 500 后实测
- settings：9s 后仍 21 个 `animate-pulse`、`h1` 缺失、无「重试」文案；截图 `err-settings-500.png`；
- stats：同样 21 个骨架、无错误出口；截图 `err-stats-500-v2.png`；
- 读数 `docs/evidence/admin-audit-2026-10-26/err-path-report.json`（`settings500`）与 `probe-perf-report.json`（`stats500`）。

**修复**：与仪表盘 `page.tsx:161-173` 一致地加 error 状态（`AdminEmptyState` + 重试按钮），或抽一个 `useAdminResource`；`loading` 与 `!data` 不要混为一个分支。

**影响**：后端抖动/限流时管理员看到的是永远转圈的空页面，会以为浏览器卡死。

#### A-04 列表请求失败被渲染成「暂无数据」，没有错误态与重试；过滤后为空也没有「清除筛选」引导

**位置**：`videos/VideoManager.tsx:162-167`（catch 只 toast，`videos` 保持 `[]`）、`:386`（`emptyText="暂无视频"`）；`users/page.tsx:264-269`（`暂无用户`）。

**证据**：mock 500 后视频列表显示「暂无视频」，无重试（`err-videos-500.png`，`err-path-report.json` → `videos500.tableText`）；筛选「低覆盖」无结果时同样只显示「暂无视频」，页面无「清除筛选」（`ix-videos-empty-filtered.png`）；用户页搜 `zzzz-no-user` → 「暂无用户」，无清除引导（`ix-users-empty-filtered.png`）。

**修复**：区分 `error` / `empty` / `filtered-empty` 三态；`filtered-empty` 文案给出筛选条件 + 一键清除。视频列表可复用 `AdminEmptyState` 的 `action`。

#### A-05 壳层把 `/users/me` 的 5xx / 网络错误当成「会话过期」，直接踢回登录页

**位置**：`frontend/src/app/(admin)/admin/(shell)/layout.tsx:30-56`（catch 分支统一 `toast.error("登录已过期，请重新登录")` + `router.replace("/admin/login")`）。

**证据**：拦截 `/users/me` 返回 500（客户端 5xx 会重试 2 次）→ 最终跳转 `/admin/login`，toast「登录已过期，请重新登录」；截图 `err-users-me-500.png`，读数 `err-path-report.json` → `shellUsersMe500`（`usersMeCalls: 3`、`finalUrl: /admin/login`）。真实登录态并未失效（localStorage token 仍在），只是校验请求失败。

**修复**：区分 401/403（会话/权限，跳登录）与 5xx/网络错误（留在原地显示壳层级错误条 + 重试，如「无法连接服务，重试」）；`createApiClient` 已把 `ApiClientError.status` 传出，可直接判断。

**影响**：后端短时抖动 = 管理员被登出；如果 5xx 持续，重新登录会再次被踢，形成「登录后立刻回登录页」的观感循环。

#### A-06 质量阈值把 0–1 比率标成 `%`，且无客户端范围校验，错误回英文 pydantic 文本

**位置**：`frontend/src/app/(admin)/admin/(shell)/settings/page.tsx:279-300`（`NumberSuffixInput suffix="%"`、`step="0.01"`，无 `min/max`）；后端契约是比率：`backend/app/schemas/admin.py:40-41`（`ge=0.0, le=1.0`）。

**证据**：设置页显示「阻塞阈值 0.6 %」「警告阈值 0.8 %」；按「百分比」直觉输入 `60` 保存 → toast 原文
`quality_warn_threshold: Input should be less than or equal to 1`（英文 + 字段名），数据未写入。截图 `err-settings-threshold-422.png`，读数 `probe-threshold.json`。

**修复**：三选一——(a) UI 用百分比（0–100）并在提交时 `/100`；(b) 保留 0–1 但把后缀改为「（比例 0–1）」并在 `Row` 描述里写清「0.8 = 80%」；(c) 加 `min=0 max=1` + 提交前校验提示。错误文案走 `apiErrorMessage` 时对 `VALIDATION_ERROR` 做中文化（当前直接透出 pydantic 文本）。

**影响**：配置质量门禁是最需要精确的运营动作，单位错位会直接导致「配不上/配错」。

#### A-07 送 Pro 按钮没有在途保护，连点会重复发放

**位置**：`frontend/src/app/(admin)/admin/(shell)/users/page.tsx:145-153`（`handleGrantPro`）、`:500-506`（按钮无 `disabled`/loading）；对比 `handleApprove`/`reviewBusy` 是有保护的。

**证据**：拦截 `/users/*/plan` 并人为延迟 800ms，在展开行里连点「赠送 Pro」3 次 → **3 个 PATCH 请求**（`probe-double-submit.json` → `grantProCalls: 3`）；后端按 `duration_days` 延长会员，等于一次误点送 90 天。

**修复**：给按钮加 `loading/disabled={granting}`，请求结束再解禁；或改用统一 `AsyncButton`。

#### A-08 「下线」是无确认的不可逆操作（删除本地媒体文件），与「删除视频」的确认策略不一致

**位置**：`videos/VideoDetailRow.tsx:218-233`（点击直接 `onTakedown(video)` → `takedownVideo`）；同文件 `:483-495` 的删除走 `ConfirmDialog`。

**证据**：展开行里「下线」按钮无二次确认（`ix-videos-expanded.png` 的按钮清单含「下线」，点击即发请求）；后端 `takedown` 会释放媒体（`backend/app/api/v1/videos.py:403`），恢复需重新下载/处理。

**修复**：与删除一致走 `ConfirmDialog`，文案写清「将删除本地媒体、保留学习记录，可重新搬运」。顺带把「搬运到本地」「下线」等动作统一加 loading。

#### A-09 设置页 / 首页编排没有「离开保护」，未保存修改静默丢失

**位置**：`settings/page.tsx:200-203`（只有 dirty 计算与粘性条）、`:391-422`；`home-editorial/HomeLayoutEditor.tsx:937-982`（保存/发布按钮在长页底部）。全仓 admin 无 `beforeunload` 或路由离开守卫。

**证据**：设置页改「站点名称」→ 直接点侧栏「视频管理」→ 再回设置页，输入框已恢复服务端值 `"SeeWord"`（`probe-nav-report.json` → `settingsAfterRoundTrip`），全程无提示；`beforeUnloadRegistered: false`（`ix-report.json` → `settingsUnsavedNav`）。首页编排同理：`dirty` 只用于刷新/发布判断，导航离开不拦截。

**修复**：脏状态下 `beforeunload` + 侧栏/面包屑链接点击拦截（或至少 `ConfirmDialog`）；首页编排可把保存/发布条改为 `sticky bottom-0`。

#### A-10 反馈列表固定拉 50 条且没有分页，第 51 条以后永远看不到

**位置**：`feedback/page.tsx:48-64`（`listAdminFeedback(statusFilter)` 未传分页）+ `frontend/src/lib/adminData.ts:505-517`（`page=1, pageSize=50` 默认）。

**证据**：网络请求为 `GET /api/v1/admin/feedback?page=1&page_size=50&status=open`，页面无分页控件（`ix-report.json` → `feedback.urls`；`desktop-feedback.png` 无分页器）。

**修复**：接 `Pagination` 或改 append 模式（`usePaginatedList` 已支持），至少显示「共 N 条」并在 >50 时提示。

### 可访问性（axe-core 4.x，WCAG 2.1 A/AA + best-practice）

> 扫描方法：`frontend/node_modules` 的 Playwright + 临时安装到 `.tmp-diag/frontend-audit/node_modules` 的 `axe-core`（未改 `package.json`），在桌面 1440 与手机 390 各扫一遍登录页 + 8 个页面 + 视频详情，暗色另扫 6 页。原始结果 `a11y-report.json`、`probe-dark-focus-report.json`。

#### A-11 确认弹窗没有 dialog 语义、没有焦点陷阱，焦点打开后仍留在 `BODY`

**位置**：`frontend/src/components/admin/ui/AdminDialog.tsx:51-83`（`div.fixed` 无 `role="dialog"`/`aria-modal`/`aria-labelledby`，无 focus trap、无焦点归还）；`AdminConfirmDialog` `:102-146` 被用户页封禁/降级/撤销 Pro 使用（`users/page.tsx:323-334`）。

**证据**：打开「封禁用户」确认框后：`role=dialog:false`、`aria-modal:false`、`aria-labelledby:null`、`focusedOnOpen: BODY`、连按 8 次 Tab 焦点全部落在弹窗之外（`ix-report.json` → `confirmDialog`；`a11y-report.json` → `extras.confirmDialogFocus`）。截图 `ix-confirm-ban.png`。

**修复**：复用用户端已有 `useModalFocus`（`frontend/src/hooks/useModalFocus.ts`）或 `components/common/Modal` 的能力：`role="dialog" aria-modal="true" aria-labelledby`、打开时聚焦首个按钮、Tab 循环、Esc 关闭并归还焦点。

#### A-12 行操作下拉：触发按钮无名称、菜单无 `role=menu`、焦点不进入菜单（每页 20 个无名按钮）

**位置**：`frontend/src/components/admin/ui/AdminDropdown.tsx:39-54`（`MoreHorizontal` 图标按钮，无 `aria-label`）、`:56-87`（菜单 `div` 无 role，条目无 `menuitem`，不处理方向键/焦点）。

**证据**：axe `button-name` 在 `/admin/users` 命中 **20 个**节点（`a11y-report.json` → `users`）；实测触发按钮 `ariaLabel:null`、`text:""`；菜单 `roleMenu:false`、`roleMenuItem:0`、打开后焦点仍在触发按钮（`ix-report.json` → `dropdown`）。截图见 `desktop-users.png` 的「…」列。

**修复**：触发按钮加 `aria-label={`${user.name} 的操作`}`；菜单补 `role="menu"`/`role="menuitem"`，打开时把焦点移到第一项，支持 `↑↓/Esc`。

#### A-13 系统设置：5 个文本/数字输入无标签、6 个开关无名称（axe `label` + `button-name`）

**位置**：`settings/page.tsx:20-40`（`role="switch"` 只有 `aria-checked`，没有可访问名；可见标题是兄弟 `<p>`）、`:249-257`/`:280-335`（自建 `TextInput`/`NumberSuffixInput` 无 `id`，`Row` 标题不是 `<label>`）。

**证据**：axe `settings` → `label(5)`（`input[value="0.6"]`、`0.8`、`1800`、站点名、商店 URL）、`button-name(6)`（5 个开关 + 1）；读数 `a11y-report.json`。截图 `desktop-settings-dirty.png`。

**修复**：`Row` 生成 `id` 并通过 `aria-labelledby` 关联控件；开关加 `aria-label={title}`（或 `role="switch"` + `aria-labelledby` 指向标题）。

#### A-14 反馈页 17 个状态 `select` 没有可访问名

**位置**：`feedback/page.tsx:203-212`（每张反馈卡一个无 label 的 `<select>`，无 `aria-label`）。

**证据**：axe `feedback` → `select-name(17)`；`a11y-report.json`。

**修复**：加 `aria-label={`反馈 ${fb.id.slice(0, 8)} 的状态`}`，或包 `<label>`。

#### A-15 用户行展开/收起不可键盘操作，而它是「赠送 Pro」的唯一入口

**位置**：`users/page.tsx:364-370`（`<tr onClick={onToggleExpand}>`，无 `tabIndex`/`role`/`aria-expanded`）、`:469-511`（展开区，`赠送天数` 输入无 label，`:490-497`）。

**证据**：行 `tabIndex:null`；键盘无法触发 `onClick`（`ix-report.json` → `usersRow`）；展开区数字输入 `id:null, labels:0`；chevron `aria-hidden=true` 但它同时是展开指示。截图 `ix-users-expanded.png`。

**修复**：在用户列渲染带 `aria-expanded`/`aria-controls` 的按钮（或给 `tr` 加 `tabIndex=0` 并处理 Enter/Space），展开区输入补 `<label htmlFor>`。

#### A-16 移动端关闭态抽屉的 10 个链接仍在 Tab 序列里；打开后无焦点陷阱、Esc 不关闭、不锁背景滚动

**位置**：`components/admin/AdminSidebar.tsx:234-266`（抽屉 `fixed -translate-x-full`，无 `hidden`/`inert`/`aria-hidden`；打开态无焦点管理；`Esc` 未处理）。桌面侧栏 `:268-309`。

**证据**（390×844）：
- 关闭态：`translate:-100%`、`x=-288`、`aria-hidden:null`、`inert:false`，抽屉内 **10 个** `<a/button>` 执行 `focus()` 全部成功；
- 从「打开导航」按钮起按 Tab，焦点依次进入 `-276px` 处的抽屉链接（10 站）后才回到顶栏（`drawer-report.json` → `closed.drawer.links`、`probe-taborder.json`）；用户键盘操作时焦点「消失」到屏幕外。
- 打开态：`bodyOverflow:visible`（背景可滚动）、`Escape` 后抽屉仍为 `translate:0`（不关闭）。
- 打开/关闭截图 `drawer-closed.png`、`drawer-opened.png`。

**修复**：关闭态加 `inert` + `aria-hidden`（或用 `display:none` 由动画控制）；打开时 `role="dialog" aria-modal`、焦点移入抽屉、Tab 循环、Esc 关闭、`document.body.style.overflow="hidden"`。

#### A-17 登录表单错误不播报：无 `role=alert`/`aria-live`，输入无 `aria-invalid`/`aria-describedby`

**位置**：`app/(admin)/admin/login/page.tsx:196-198`（错误 `div` 只有样式）；`:146-161`、`:172-185`（输入无 `aria-invalid`）。

**证据**：错误密码提交后页面出现「手机号或密码错误」，但该元素 `role:null, aria-live:null`，输入 `ariaInvalid:null, describedBy:null`（`probe-focus-login.json` → `loginErr`）。截图 `desktop-admin-login-wrong-password.png`。

**修复**：错误容器 `role="alert"`，输入 `aria-invalid` + `aria-describedby` 指向错误 id；提交失败后把焦点移到错误处或第一个错误字段。

#### A-18 `text-success` 被当正文色用：12px 文字对比度 3.29:1 / 3.12:1（AA 不达标），横跨 4 个页面

**位置**：`app/(admin)/admin/(shell)/page.tsx:88`、`:115`、`:361`；`stats/page.tsx:87`、`:102`、`:539`；`users/page.tsx:211`、`:430`；`channels/page.tsx:202`、`:216`；`components/admin/StatCard.tsx:23,33`；`QualityReportPanel.tsx:47,55`（共 6 文件 15 处；后台 **0 处**使用设计系统提供的 `text-success-text`）。

**证据**：axe `color-contrast` 命中：`#16a34a` on `#ffffff` = **3.29:1**（dashboard 2、stats 4、users 9）；`#16a34a` on `#ecfdf5` = **3.12:1**（videos 6、channels 10、video-detail 1）；login 错误块 `#dc2626` on `#f7e5e5` = **3.97:1**（`a11y-report.json`）。设计规范要求状态文字走 `text-success-text`/`text-error-text`（`frontend/DESIGN.md:23`、`globals.css` 的语义文字档）。

**修复**：后台所有「小字状态文本」改用 `text-success-text`/`text-warning-text`/`text-error-text`；圆点/图标可继续用 `text-success`。**暗色下 axe 对比度全干净**（`probe-dark-focus-report.json` → `dark.*.violations` 无 `color-contrast`），说明只需挡亮色模式这一档。

#### A-19 表格固定列宽 + 操作列在视口外：390 下三张表无法在不横滑的情况下操作

**位置**：`users/page.tsx:235-311`（8 列手写表，无 `min-w`/卡片降级）、`videos/VideoManager.tsx:372-532`（`DataTable` 7 列）、`channels/page.tsx:171-251`（`min-w-[720px]`）。

**证据**（390×844）：视频表 `scrollW 688 / 容器 308`、**147** 个单元格在视口外；频道表 `853/356`、150 个；用户表 `672/356`、105 个；页面级溢出仍为 0（`overflow-x-auto` 生效）。读数 `mobile-report.json` → `pages[].tables/offscreenCells`；截图 `mobile-videos-viewport.png`（只能看到「视频/状态」两列，操作「编辑」列需横滑）。

**修复**：`md` 以下切换为卡片式列表（每条一行摘要 + 「查看详情/编辑」按钮），或至少冻结首列 + 把操作列固定在右侧；`channels` 表在窄屏改为两行式卡片。

#### A-20 视频详情字幕编辑器在 390 下是 2191px 超宽画布，没有任何「请在桌面编辑」提示

**位置**：`app/(admin)/admin/(shell)/videos/[id]/page.tsx:259-271`（无条件渲染 `VideoSubtitleEditorPanel`）；编辑器时间轴在 `components/video-edit/`（无断点/mobile 分支）。

**证据**：390 下 `DIV.overflow-x-auto.custom-scrollbar` `scrollW 2191 / clientW 356`（`mobile-report.json` → `video-detail.measured.overflowing`）；截图 `mobile-video-detail-viewport.png`（首屏正常，往下是超宽编辑器）。

**修复**：`<md` 时收起编辑器并显示说明 + 「在桌面端编辑字幕」；或提供只读摘要。

### 健壮性 / 配置

#### A-21 系统设置里 4 个「写了库但运行时没人读」的字段/开关（含「启用支付」）

**位置**：`settings/page.tsx:247-269`（站点名称、微信小商店 URL、启用支付）、`:301-306`（转录幻觉检测）；落库在 `backend/app/models/admin_setting.py:25-29,42`。

**证据（代码即事实源）**
- `payments_enabled`：支付路由读的是**环境变量** `settings = get_settings()`（`backend/app/api/v1/payments.py:40,116,175,217`），从未读 `AdminSetting`；后台 PUT 只写 DB（`backend/app/api/v1/admin.py:232-257`）。→ 开关对真实支付门禁无影响。
- `hallucination_detection_enabled`：管道里没有任何 `hallucination_detection` 的读取（转录回调的幻觉检测无条件执行，`backend/app/api/v1/internal.py:141`）。
- `site_name`、`wechat_shop_url`：除 admin 读写接口外，前端没有任何消费者（`rg wechat_shop_url frontend/src` 只命中设置页与类型；真实购买入口是 `/upgrade` 调 `payments/jinshuju/purchase-link`，`app/(main)/upgrade/page.tsx:98`）。
- 实测：该页可正常保存并弹「设置已保存」（`desktop-settings-dirty.png`），但改上述开关不改变任何行为。

**修复**：短期在 UI 上标注「仅登记/暂不生效」或直接隐藏；中期把 `payments_enabled`/幻觉检测接入运行时读取（`AdminSetting` 优先、env 兜底，与 `_effective_quality_gate` 同型），把 `site_name`/`wechat_shop_url` 删除或换成金数据配置状态（见 §6）。

#### A-22 表格最后一个可见行的「…」操作菜单被容器裁切/落到视口外，菜单项不可点

**位置**：`AdminDropdown.tsx:56-62`（`absolute` 下拉，无翻转/Teleport）+ `users/page.tsx:235`（`Card className="overflow-hidden"` 包裹表格）。

**证据**：打开最后一行（第 20 行）的「…」：菜单 rect `y=803..921`，视口高 900、卡片底 `814`，`menuInsideCard:false`，菜单中心点命中的是别的按钮（`probe-dropdown-clip.json`）；截图 `probe-lastrow-dropdown.png` 里只能看到菜单的一条边，三项（封禁/降级/撤销 Pro）不可见。

**修复**：菜单用 portal 渲染并做 `flip` 定位（或 `max-h` + `overflow-y-auto`），或去掉表格容器的 `overflow-hidden`（`overflow-x-auto` 保留在另一层）。同类问题在视频列表、频道表也可能出现。

---

## 3. P3

| 编号 | 位置 | 问题与证据 | 建议 |
| --- | --- | --- | --- |
| A-23 | `components/admin/ui/AdminPageHeader.tsx:18`、`pages/videos/[id]/page.tsx:237` | 移动端超长视频标题溢出：h1 宽 358，内容 `scrollW 1051`，`<span className="truncate">` 是 inline 元素导致省略号不生效，标题被视口硬裁（`mobile-report.json` → `video-detail.h1`；`mobile-video-detail-viewport.png`）。同时 390 顶栏面包屑 2 段时与铃铛挤压（同截图） | h1 内容块级化（`block min-w-0 truncate`）或 `line-clamp-2`；面包屑容器加 `min-w-0` + `truncate` |
| A-24 | `videos/VideoDetailRow.tsx:420-470` | 展开行的 5 个复选框（官方/精选/已发布/首页展示/示范视频）在 `flex gap-6` 里被压成「官/方」「精/选」逐字换行（`ix-videos-expanded.png`） | `flex flex-wrap gap-x-6 gap-y-2` + `whitespace-nowrap` |
| A-25 | `Pagination.tsx:19-44` | 分页只显示「第 N 页」，不显示总条数/页数，不能跳页；`usePaginatedList` 已拿到 `total` 但没被使用（`users/page.tsx:314-320` 未传 `total`） | 传 `total`，显示「共 N 条 · 第 x/y 页」；保留按钮式翻页即可 |
| A-26 | 全站 admin 列表 | 分页/筛选/搜索**不落 URL**：翻页、切筛选后地址仍然是 `/admin/users`（`ix-report.json` → `usersPager.afterFilterUrl`），刷新/分享/后退都会丢状态 | 用 `useSearchParams` + `router.replace` 同步 `page/role/plan/keyword` |
| A-27 | `admin/(shell)/layout.tsx:75-85` | 没有 skip link：每页的第一个焦点停靠点是顶栏面包屑的 Home 图标链接，之后要穿过整个侧栏 8 个入口才到内容；栅格有 3 个 `<nav>`，其中移动抽屉/桌面侧栏两个没有 `aria-label`（axe `landmark-unique`；`probe-perf-report.json` → `structure`）；面包屑 Home 链接只有 `title`（可访问名回退到 title，能用但不稳） | 壳层首位加「跳到内容」；两个 nav 补 `aria-label="后台导航"`/`"移动导航"`；Home 图标链接补 `aria-label` |
| A-28 | `dashboard/page.tsx:247,257,300,321,354`；`stats/page.tsx:131,283,364,398,437,465,497,525` | 标题层级 h1→h3 跳级（axe `heading-order`）；Card 内小标题未用 h2 | 统一 h2（区块）/h3（卡片内） |
| A-29 | `dashboard/page.tsx:161-173` | 统计失败时整页只渲染错误卡，**页面 h1/标题消失**（`err-dashboard-500.png`，`h1:null`） | 错误态保留 `AdminPageHeader`，错误卡放在内容区 |
| A-30 | `login/page.tsx:42` | 登录后固定 `router.replace("/admin")`，忽略 `?next=`；未登录深链到 `/admin/settings` 登录后落到仪表盘（`ix-report.json` → `loginNextParam`） | 读 `searchParams.next`（只允许站内 `/admin` 前缀）后跳转 |
| A-31 | `login/page.tsx:186-192` | 密码可见性切换按钮无 `aria-label`（axe `button-name`，亮/暗均命中） | 加 `aria-label="显示密码"/"隐藏密码"` + `aria-pressed` |
| A-32 | `login/page.tsx:140,166`；admin 全域 26 个 `<label>` | **admin 下 26 个 `<label>` 全部没有 `htmlFor`**（`rg '<label'` 26 条、`<label ... htmlFor>` 0 条），依赖 placeholder 作为可访问名；密码/手机号可见文字与可访问名不一致 | 统一 `<label htmlFor>` + 输入 `id`（或 `FormField` 传 `htmlFor`）；`AdminSearchInput`、`VideoDetailRow`、`MetadataForm`、`HomeContentDraftForm`、`SubtitlePickers` 都在范围内 |
| A-33 | `channels/page.tsx:311-321` | 排序下拉只渲染 0–20；数据库里 `sort_order > 20` 的频道（自动建档）编辑时下拉显示空值 | 用 number 输入，或按当前值动态补项 |
| A-34 | `channels/page.tsx:44-138` | 频道列表无搜索/筛选，24 条已需长滚动；自动建档频道会持续增长 | 顶部加 `AdminSearchInput`（按 name/slug/upstream id 过滤） |
| A-35 | `feedback/page.tsx:66-86` | 「发送公告」无二次确认、无发送对象/条数预览（一键触达全部用户，2000 字上限） | 加确认弹层显示「将通知全部用户」，成功后再给可点击的详情 |
| A-36 | `users/page.tsx:279-302,440-464` | 对自己也展示「封禁用户/降级/撤销 Pro」：后端会 400 拒绝并返回**英文**文案 `Cannot ban yourself` / `Cannot change your own role`（实测 `ban self -> 400`；`backend/app/services/admin_service.py:481-493`） | 行内用 `currentUserId`（已在 `settings/page.tsx:172` 用过）把自我操作置灰并提示；或前端把这两条后端文案中文化 |
| A-37 | `components/admin/ui/AdminTable.tsx`（整文件 257 行） | **死代码**：全仓无任何 import（`rg AdminTable` 只命中自身）；与在用的 `DataTable.tsx` 重复，且内部 checkbox 无名称、th 无 scope | 删除或合并进 `DataTable`，避免后续误用 |
| A-38 | admin 全部表格 | `<th>` 无 `scope="col"`（`desktop-report.json` → `pages[].nav.tables[].ths[].scope` 全为 null）；`DataTable` 的展开/收起也没有 `aria-expanded` | 表头补 `scope="col"`；展开行补 `aria-expanded`/`aria-controls` |
| A-39 | `videos/VideoManager.tsx:127-138`；`AdminTopbar.tsx:120-143` | 轮询成本：视频页每 30s 打 `worker-status` + `admin/stats`（stats 是 30/min 按用户的限流端点），顶栏每 60s 打 `pending-count`；多标签页叠加 | 合并成一个 `admin/health` 轻量端点，或把轮询间隔降到 60s/120s；空数据时停止轮询 |
| A-40 | `videos/VideoManager.tsx:388-413` | 视频列表 20 张缩略图：dev 下 21 张图共 **1.8MB**（`perf-report.json` → `perf.videos.byType.img`），`next/image` 在 dev 未优化 | 给缩略图加 `loading="lazy"`/固定 `sizes`；生产环境确认 `unoptimized` + 尺寸参数 |

---

## 4. 已核查通过（本次实测正常，不要回退，也不要按旧问题重报）

1. **会话与守卫**：两套会话隔离正确（`seeword_admin_token`）；未登录访问 8 条后台路由全部 307 到 `/admin/login?next=…`（`desktop-report.json` → `anonRedirects`）；匿名直接打 admin API 返回 401（实测 `/admin/stats`、`/videos/admin`）；过期 access token + refresh 失败 → 一次跳转回登录页，无死循环（`err-path-report.json` → `expiredSession`，4 段导航）。
2. **角色闸门**：`/users/me` 返回 `role=user` 时显示「无管理员权限」并回登录（`err-non-admin.png`）；后端所有 admin 端点有 `get_admin_user`。
3. **后端错误 envelope 在前端可用**：403 封禁请求 → toast 显示后端 `message`「需要管理员权限」（`err-path-report.json` → `ban403`），未退化成「未知错误」。
4. **XSS**：后台所有用户可控文本（反馈正文/联系方式、用户名、视频标题、注音/字幕文本、公告、首页编辑文案）都走 React 文本节点渲染（`whitespace-pre-wrap`/`truncate`），admin 范围内 **0 处** `dangerouslySetInnerHTML`；`source_url` 由后端校验仅 http/https（`backend/app/schemas/video.py:13-21`），YouTube iframe 只从 URL 提取 11 位 id（`VideoDetailRow.tsx:33-38,158-165`）。未发现存储型 XSS 向量。
5. **重复提交**：封禁/降级/批准/驳回/删除确认都有 busy 或关闭弹层保护（封禁确认连点 2 次只 1 个 PATCH，`ix-report.json` → `confirmDialog.patchCallsAfterDoubleClick`）；登录按钮在途禁用；拦截测试中从登录页登录不产生 open redirect。
6. **分页与筛选**：用户页 39 人 2 页，翻页正确（第 1→2 页），在页 2 切「管理员」筛选后**正确回到第 1 页**且表头「共 2 位用户」同步（`probe-dark-focus-report.json` → `usersPager`）。
7. **空/加载/错误三态**：视频页/用户页/仪表盘有骨架；分辨率级空态；首页编排面板的 loading/加载失败/REVISION 冲突/远程草稿冲突/脏状态提示都实现了（`HomeContentPanel.tsx:453-491`）；`toastApiError` 统一。
8. **暗色模式**：`.dark` token 全站生效（`canvas #0a0a0a / ink #fafafa / hairline #242426`），6 个页面 axe **无对比度违规**，截图 `dark2-*.png`、`dark-dashboard.png`；管理端没有主题开关，跟随系统偏好/用户端 `theme` 键（`route layout.tsx:32-40` 的防闪烁脚本），属既有行为。
9. **页面级横向溢出**：1440 与 390 两档、8 个页面 + 视频详情全部 `scrollWidth-clientWidth = 0`（`desktop-report.json`/`mobile-report.json`）。
10. **信息架构基础**：侧栏分组（概览/内容/运营/数据/系统）与面包屑映射正确，`/admin` 精确高亮、详情页继承父级并补「视频详情」（`AdminSidebar.tsx:114-125`、`AdminTopbar.tsx:17-40`）；UGC 待处理角标只在 `>0` 时出现。
11. **关键交互**：视频状态/审核/质量三组筛选各只发 1 次请求（`ix-videos-status-filter`）；展开行预览/保存/字幕编辑/质量报告重译均有确认；首页编排发布/回滚/预览/冲突提示全链路可用。

---

## 5. 性能观察（dev 口径，非生产结论）

> 方法：`probe-perf.mjs` 采集 PerformanceResourceTiming；dev server 有 HMR/devtools/未压缩开销，数字只用于横向对比，**不能当作生产包体**。

| 页面 | 请求数 | JS transfer | 最大块 | API 次数 | DOM 节点 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin`（首个加载） | 40 | 1265 KB | next-devtools 250KB、react-dom 185KB | 4 | 629 | 首屏包含 dev client 载入；recharts 走 `next/dynamic`（`dashboard/page.tsx:33-36`） |
| `/admin/stats` | 37 | 339 KB | recharts 系列 ~185KB | 3 | 926 | **静态 import recharts**（`stats/page.tsx:8-30`）；作为路由 chunk 只在进入统计页时加载，可接受 |
| `/admin/videos` | 55 | 37 KB | — | 5 | 932 | 缩略图 21 张 1.8MB（dev 未压缩）；`/admin/stats` 每 30s 轮询 |
| 客户端导航（侧栏 8 跳） | — | — | — | 每页 1–3 次，`/users/me` 全程仅 1 次 | — | 无重复拉取/无瀑布（`probe-nav-report.json` → `clientNav`）；平均 ~860ms/跳（dev） |

- 结论：**没有需要立刻处理的大性能缺陷**。可优化项：videos 搜索防抖（A-02）、合并轮询（A-39）、缩略图懒加载（A-40）、`AdminTable.tsx` 死代码（A-37）。
- 环境噪声（如实记录）：首轮走查时 Next dev 代理对 `/api/v1/admin/stats`、`/api/v1/users/me` 各出现 1–2 次 `500`（`desktop-report.json` → `badResponses`）。直连 `:8000` 顺序 20 次全部 200，且随后经代理连续请求在触发限流前均 200；**未复现**为稳定后端缺陷。当时并行审计脚本/浏览器较多，且审计脚本自身会打满 `/auth/phone-login`、`/admin/stats` 的每分钟限额（429）。因此该 500 **不计入产品缺陷**，但 UI 对 5xx 的处理问题按 A-03/A-04/A-05 独立取证。

---

## 6. 信息架构：删掉兑换码后，金数据收款记录该怎么看（替代页面建议）

**现状盘点（代码事实）**

| 事实 | 位置 |
| --- | --- |
| 收款落库在 `jinshuju_payments`（`entry_token` 幂等、5 种状态、金额/档位/买家/错误信息齐全） | `backend/app/models/jinshuju_payment.py:43-70` |
| 同步由 Celery beat 每 5 分钟 + 可选 webhook；同步函数是 `sync_recent_entries` | `backend/app/services/jinshuju_service.py:606-620` |
| 没有任何 admin 读接口读这张表 | `rg JinshujuPayment backend/app/api` → 0 命中 |
| `AdminStatsResponse` 无金额/笔数字段 | `backend/app/schemas/admin.py:143-162` |
| 后台无收款入口、无同步触发按钮 | `AdminSidebar.tsx:45-75`；`adminData.ts` |
| 设置页仍在编辑的 `wechat_shop_url` / `payments_enabled` 对真实收款无影响 | A-21 |

**建议的替代 IA（report only，未实现）**

1. **新页面 `/admin/revenue`（收款记录）**，放在侧栏「运营」组，位于「用户管理」之后：
   - 顶部 KPI 条：今日金额/笔数、本月金额/笔数、待补发（pending）、待人工核对（ignored + error）、已退款（refunded）；
   - 筛选：状态 chips（全部/已发放/待补发/待核对/已退款/异常）+ 时间范围（7/30/90 天，复用 stats 的 7/30/90 交互）；
   - 表格列：时间（`entry_created_at` 本地化）、档位 `tier_name`、金额 `amount_fen/100`（右对齐、tabular-nums）、`trade_status`/`payment_method`、状态徽标、账号（手机号脱敏 + 用户名，来自 `user_id` 关联）、入口（token vs 手机号匹配，`entry_token` 前 8 位）；
   - 行操作：`pending` → 「补发」；`ignored/error` → 「查看原始记录」（脱敏后的 `error_message`，`raw_json` 不进前端）；`refunded` → 「标记已追回」（只写审计备注，不做自动扣减）；
   - 页头按钮：「立即同步」调用新接口（见下），成功后 toast 显示新增/更新条数；「导出 CSV」。
2. **新后端接口（供前端用，管理端鉴权）**：
   - `GET /api/v1/admin/revenue?page=&page_size=&status=&days=` → `{items:[{id, serial_number, tier_name, amount_fen, duration_days, status, phone_masked, user_id, entry_created_at, applied_at, error_message}], total, summary:{today_amount_fen, month_amount_fen, counts_by_status}}`；
   - `POST /api/v1/admin/revenue/sync` → 触发一次 `sync_recent_entries`（按任务里同一把锁防并发，返回 `{scanned, applied, pending, ignored, errors}`）；
   - 在 `AdminStatsResponse` 增补 `revenue_today_fen`、`revenue_7d_fen`、`jinshuju_pending_count`、`jinshuju_attention_count`，让仪表盘/统计页直接显示「收入」与「待处理收款」。
3. **旧 `Order` 表**（支付宝/微信/内测 mock 支付）当前没有消费者与写入方，建议在后台明确标为「历史遗留（不展示）」或直接下线对应 `/admin/orders` 后端路由，避免下一个人又把它当收款来源。
4. **设置页**：把 `wechat_shop_url` / `payments_enabled` 两个死字段替换为**只读的收款通道状态卡**：金数据是否已配置（`JINSHUJU_*` 是否齐全）、最近一次同步时间与结果、webhook 是否启用、当前购买入口链接生成是否正常；密钥永远不回显。这能让「为什么后台看不到收入」变成「后台能看到通道是否健康」。
5. **入口对齐**：`/upgrade` 页的购买按钮、后台收款页、仪表盘 KPI 三处共用同一后端口径（金额单位分、时区 Asia/Shanghai），避免运营与用户看到两套数字。

**验收标准（给接手的实现者）**：能回答「今天收了多少钱/几笔」「哪些付款还没到账，为什么」「某用户是否付过款、哪天、多少钱、是否已开通」三个问题，且全程不接触 `raw_json`/明文手机号。

---

## 7. 测试覆盖缺口

- 现状（`frontend/src/**/*.test.ts(x)` + `frontend/e2e/`）：
  - 单测仅 **`src/stores/adminAuthStore.test.ts`**（1 个用例：过期 token 刷新时不提前弹回登录）+ `createApiClient.test.ts`/`authHelpers.test.ts` 间接覆盖管理端 token；
  - e2e 中 `e2e/home-editorial-full-loop.spec.ts` 用 admin token 驱动 `/admin/videos/[id]` 的首页内容面板与 admin API，`e2e/production/readiness.spec.ts` 只 GET `/admin/login` 的 HTML；`/admin`、`/admin/videos`、`/admin/users`、`/admin/channels`、`/admin/feedback`、`/admin/settings`、`/admin/stats` **没有任何 UI 断言**。
- 高风险未覆盖流程（建议优先补）：
  1. 后台壳层守卫：`/users/me` 401 vs 5xx 的分支、非 admin、过期会话（A-05 的回归测试）；
  2. 设置页失败态与阈值单位/范围（A-03/A-06）；
  3. 视频列表搜索防抖与筛选/分页重置（A-02、A-26）；
  4. 用户动作：封禁/降级/自操作拦截/送 Pro 在途保护（A-07、A-36）；
  5. 确认弹窗焦点陷阱与 Esc（A-11）；
  6. 移动端抽屉焦点/锁滚动（A-16）；
  7. 首页编排冲突/回滚 UI（已有 API 级 e2e，缺 UI 级）；
  8. 一旦实现 §6，收款同步与状态筛选的端到端。

---

## 8. 优化清单（按投入产出排序）

1. **P1 A-01**：按 §6 落 `/admin/revenue` + `GET/POST admin/revenue`，并给仪表盘/统计页加收入 KPI。（最大业务价值）
2. **A-03/A-04/A-05**：给 settings/stats/videos/users 补错误态 + 重试；壳层区分 401 与 5xx。一次改动可消灭「永久骨架/假空/误登出」三类问题。
3. **A-02 + A-07 + A-11 + A-16**：搜索防抖、送 Pro 在途保护、确认弹窗焦点陷阱、移动抽屉 inert/焦点/锁滚动——都是小范围、高收益的可靠性/无障碍修复。
4. **A-06 + A-21**：阈值单位/范围与「死配置」清理（含把支付相关字段替换成金数据状态），避免运营误配。
5. **A-13/A-12/A-14/A-32**：后台输入/开关/下拉/操作按钮的可访问名（一次性把 `label` 关联、`aria-label`、`role=switch` 名称补齐）。
6. **A-18**：亮色模式 `text-success-text` 替换（6 文件 15 处），改完用 axe 复扫。
7. **A-19/A-20**：窄屏表格卡片化 + 字幕编辑器桌面提示。
8. **A-23/A-24/A-22/A-25/A-26**：视觉错版、末行菜单、分页信息、URL 状态同步。
9. **A-37/A-39/A-40**：删死代码、合并轮询、缩略图懒加载。

---

## 9. 未验证 / 限制

1. **真实写操作未执行**：封禁/降级/赠送 Pro/删除视频/下线/发布首页编排等会改数据或产生外部影响的动作，只用「拦截 + mock 响应/500/403」验证 UI 路径，未真实提交（避免改 dev 库/触发管线）。
2. **金数据后台数据不可见**：`jinshuju_payments` 在 dev 库中是否有数据未查询（无 admin 接口），§6 的接口/Celery 行为仅按代码阅读；真实 webhook/同步链路未触发。
3. **生产构建未验证**：未跑 `npm run build`（时间与并发约束），因此 `lib/adminApi.ts:36-50` 在客户端模块里用 `require()` 惰性取 store 的写法只在 dev（Turbopack）验证可用；生产打包/`output:standalone` 未复验。
4. **非管理员 token 的 403**：无普通用户密码凭据，未直接构造非 admin JWT；用「拦截 `/users/me` 返回 role=user」验证了前端拒绝路径，后端 `get_admin_user` 的 403 由后端测试覆盖。
5. **屏幕阅读器实机（NVDA/VoiceOver）与真机 iOS 安全区**：环境不可用；可访问性结论来自 axe + DOM/ARIA 与焦点实测。
6. **暗色模式只做了 token + axe 抽检（6 页）**，未做全站逐元素视觉比对；未验证 `prefers-color-scheme` 切换的实时响应（只验证重载后生效）。
7. **并发快照**：审计期间仓库同时在改（删除兑换码/订单、`backend` 也出现改动，`git status` 约 86 项）。本报告以 12:15–12:45 的读取状态为准；`docs/reports` 里的行号可能随改动漂移，认符号不认数字。
8. **限流**：审计脚本自身触发过 `/auth/phone-login` 与 `/admin/stats` 的 429（每分钟限额按用户/IP），已通过 token 缓存与间隔规避；429 不作为产品缺陷。

---

## 10. 证据索引与复跑

**证据目录**：`docs/evidence/admin-audit-2026-10-26/`

| 证据 | 文件 |
| --- | --- |
| 桌面 8 页 + 视频详情（全页 + 首屏） | `desktop-*.png` |
| 桌面原始读数（console/失败请求/≥400/表格/导航/h1/溢出） | `desktop-report.json` |
| 手机 8 页 + 抽屉 + 弹窗（390×844） | `mobile-*.png`、`mobile-report.json` |
| 抽屉焦点/关闭态取证 | `drawer-closed.png`、`drawer-opened.png`、`drawer-report.json`、`probe-taborder.json` |
| axe 扫描（桌面 + 手机 + 登录错误态） | `a11y-report.json`、`a11y-confirm-dialog.png` |
| 交互（搜索/筛选/分页/展开/下拉/确认/脏状态/暗色/next 参数） | `ix-*.png`、`ix-report.json` |
| 错误路径（5xx/403/非admin/过期会话） | `err-*.png`、`err-path-report.json` |
| 性能/结构/暗色对比度 | `perf-report.json`、`dark2-*.png` |
| 定点：末行菜单裁切、送 Pro 重复提交、阈值 422、焦点、客户端导航 | `probe-lastrow-dropdown.png`、`probe-dropdown-clip.json`、`probe-double-submit.json`、`err-settings-threshold-422.png`、`probe-threshold.json`、`probe-dark-focus-report.json`、`probe-nav-report.json` |

**临时脚本**（`.tmp-diag/frontend-audit/`，只读，不改应用代码）：`common.mjs`（登录/注入会话/采集器）、`walk-desktop.mjs`、`walk-mobile.mjs`、`a11y.mjs`、`interactions.mjs`、`errors-path.mjs`、`probe-drawer.mjs`、`probe-taborder.mjs`、`probe-perf.mjs`、`probe-dark-focus.mjs`、`probe-focus-login.mjs`、`probe-threshold.mjs`、`probe-double-submit.mjs`、`probe-dropdown-clip.mjs`、`probe-nav.mjs`。

复跑方式（工作目录必须是 `frontend/`，脚本从 `frontend/node_modules` 解析 Playwright）：

```powershell
cd C:\Users\Administrator\Speaking\frontend
node ..\.tmp-diag\frontend-audit\walk-desktop.mjs
node ..\.tmp-diag\frontend-audit\walk-mobile.mjs
node ..\.tmp-diag\frontend-audit\a11y.mjs          # 需 .tmp-diag/frontend-audit/node_modules/axe-core
node ..\.tmp-diag\frontend-audit\interactions.mjs
node ..\.tmp-diag\frontend-audit\errors-path.mjs
```

- 会话：脚本用 `POST /api/v1/auth/phone-login`（13900139000 / `SeeWordAdmin!2026`）取 token，缓存到 `.tmp-diag/frontend-audit/token-cache.json`（避免触发登录 429），再同时写 `localStorage.seeword_admin_token` 与 cookie 镜像 `seeword_admin_token`（`proxy.ts` 读它）。
- axe-core 只装在 `.tmp-diag/frontend-audit/node_modules`（`npm i axe-core`），**未修改 `frontend/package.json`**。
