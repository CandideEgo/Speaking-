# 后台「付费记录」页 + 管理面核心审计修复（task-5）

- 任务：`task-5`「Admin optimization: payment records surface + admin-core audit fixes (backend + frontend)」
- 分支：`redesign`（工作树，未提交；工作树里另有并行任务改动，见 §7.5）
- 日期：2026-10-26
- 边界：只改后端 `app/api/v1/admin.py`、`app/services/admin_service.py`、`app/schemas/admin.py`、`app/services/unlock_service.py`（docstring 一处）、对应测试；前端 `(admin)/(shell)/payments/page.tsx`（新建）、`AdminSidebar.tsx`、`AdminTopbar.tsx`、`(shell)/page.tsx`、`lib/adminData.ts`、`types/index.ts`；本报告与 `docs/evidence/admin-audit-2026-10-26/payments*.png/json`。未改 `video*.py` / `subtitle_edit_service.py` / `feedback.py` / `channels*.py` / `channel_service.py` / `video_service.py` / `notification_service.py`，未改 `CLAUDE.md` / `PROGRESS.md` / docs README，未 commit、未重启 dev server、未做生产操作。

## 1. 结论

1. **后台重新有了真实收款视图**：`GET /api/v1/admin/payments`（列表）+ `GET /api/v1/admin/payments/summary`（状态计数与收入）+ `POST /api/v1/admin/payments/sync`（仅入队 Celery 同步任务，不内联外部 HTTP）。数据源是真实收款表 `jinshuju_payments`，`raw_json` 不外泄；前端新增 `/admin/payments`「付费记录」页，侧栏/面包屑/仪表盘快捷入口齐全。
2. **死端点下线**：legacy `GET /admin/orders`、`AdminOrderRow`、`admin_service.list_admin_orders` 已删除（live 返回 404；`orders` 表/模型保留给历史支付代码）。`recent_activity` 的 payment 来源改读 `jinshuju_payments`（applied/pending），legacy `orders` 仅作兜底。
3. **审计修复（ADM-05/06/09/10/11/14/17）全部落地**，并顺手修掉测试中暴露的两个真实缺陷：
   - 11 位手机号被当作「数据序号精确匹配」塞进 `serial_number`（PostgreSQL `INTEGER`），**线上会 500**（`value out of int32 range`）；已加 int32 边界判断 + 回归测试。
   - 管理员「撤销 Pro」前端一直发 `duration_days: 0`，而后端 schema 是 `ge=1` → **撤销动作一直 422**；改为 `ge=0`（ADM-17 的撤销清空 `plan_source` 因此才真正可用）。
4. 前端 `/admin/payments` 在 1440×900 与 390×844 实测：无横向溢出、无 console 错误、无失败请求（唯一 3 条 `net::ERR_FAILED` 是「错误态 + 重试」用例里主动 abort 列表请求造成的，属预期，见 §6.6）。截图 `docs/evidence/admin-audit-2026-10-26/payments.png`（1440）与 `payments-390.png`（390）。另顺手完成并行任务转交的 A-23「390 面包屑被挤压」纯样式修复（`AdminTopbar.tsx`，`min-w-0` + 截断）。

## 2. API 契约

### 2.1 `GET /api/v1/admin/payments`

- 鉴权：`get_admin_user`；限流 `30/minute`；`response_model=PaginatedResponse[AdminPaymentRow]`。
- Query：`page`(≥1, 默认 1)、`page_size`(1–100, 默认 20)、`status`(Literal `applied|pending|ignored|refunded|error`，非法 → **422** `VALIDATION_ERROR`)、`keyword`(`max_length=100`)。
- 数据来源：`jinshuju_payments` **LEFT JOIN** `users`（`user_id`）。
- 过滤：`status` 精确匹配；`keyword` 小写包含匹配「记录手机号 / 绑定账号手机号 / 交易号 / 档位名」，纯数字额外做 `serial_number` 精确匹配（仅当 `0 < n ≤ 2_147_483_647`，防 int32 溢出）；`%`/`_`/`\` 走 `LIKE ... ESCAPE '\'`，不做通配。
- 排序：`entry_created_at DESC NULLS LAST, created_at DESC, id DESC`（OFFSET 分页稳定）。
- 分页：`{items, page, page_size, has_more, total}`（`total` 必返）。
- Row 字段（`AdminPaymentRow`，**无 `raw_json`**）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | str | 付款记录主键（必填） |
| `entry_token` | str? | 金数据数据记录 token（幂等键） |
| `serial_number` | int | 金数据数据序号（必填） |
| `phone` | str? | **展示手机号**：`COALESCE(users.phone, jinshuju_payments.phone)` |
| `user_id` | str? | 匹配到的账号（未注册补发前为 null） |
| `user_phone` | str? | 绑定账号手机号 |
| `user_name` | str? | 绑定账号昵称 |
| `tier_name` | str? | 月卡/季卡/年卡 |
| `amount_fen` | int? | 实付金额（分） |
| `duration_days` | int? | 发放天数 |
| `trade_status` | str? | 金数据交易状态 |
| `trade_no` | str? | 交易号 |
| `payment_method` | str? | 支付方式 |
| `status` | str | `applied/pending/ignored/refunded/error`（必填） |
| `error_message` | str? | 人工核对原因 |
| `entry_created_at` | str? | 金数据下单时间（ISO） |
| `created_at` | str? | 本地落库时间 |
| `applied_at` | str? | 发放时间 |

### 2.2 `GET /api/v1/admin/payments/summary`

- 鉴权 / 限流同 2.1；`response_model=AdminPaymentSummaryResponse`；单条聚合查询（条件 FILTER）。
- 语义（金额单位：分）：

| 字段 | 定义 |
| --- | --- |
| `applied` / `pending` / `ignored` / `refunded` / `error` | 按 `status` 的计数 |
| `paid_total_fen` | **累计收入** = `status='applied'` 的 `amount_fen` 求和（退款/挂起/异常不计） |
| `paid_30d_fen` | 近 30 天收入，窗口按付款时间 `COALESCE(entry_created_at, created_at)` |
| `paid_today_fen` | 今日收入，同上（**UTC 日界**，与后台其它「今日」KPI 一致） |
| `applied_today` | 今日发放笔数，窗口按 `applied_at` |

### 2.3 `POST /api/v1/admin/payments/sync`

- 鉴权；限流 `5/minute`；`response_model=AdminPaymentSyncResponse` → `{"queued": bool}`。
- 仅把现有 Celery 任务 `sync_jinshuju_payments` 入队，**请求内不做任何外部 HTTP**；金数据集成未启用/未配置 token 或 broker 拒绝派发时返回 `queued=false`（任务本身仍会二次校验配置并 `autoretry`）。

### 2.4 已删除的契约

- `GET /api/v1/admin/orders` → 已从路由表移除（live 404，OpenAPI 无该 path）。
- `AdminOrderRow`（schemas）、`admin_service.list_admin_orders` 删除；`orders` 表/模型保留（历史支付代码仍引用）。

### 2.5 增量契约变更（PART B 附带）

- `PATCH /admin/users/{id}/plan` 响应新增 `plan_source`（`"admin"` / null）。
- `PATCH /admin/users/{id}/plan` 请求 `duration_days` 下限 `1 → 0`（撤销 Pro 用；修复前端一直 422 的既有 bug）。
- `/admin/users` 的 `role`/`plan` 非法值由「200 + 静默忽略」改为 **422**；`keyword` 上限 100（超长 422）。
- `/admin/stats` 的 `pro_users` / `funnel.pro` 口径改为**有效 Pro**（`plan='pro' AND (plan_expires_at IS NULL OR plan_expires_at > now)`）；`users_by_plan` 仍是「库内 plan 原样分布」（含过期），差值由 `pro_expired_count` 表达。

## 3. 后端改动清单

| 文件 | 改动 |
| --- | --- |
| `app/schemas/admin.py` | 删 `AdminOrderRow`；新增 `AdminPaymentRow` / `AdminPaymentSummaryResponse` / `AdminPaymentSyncResponse`（含语义 docstring，明确不暴露 `raw_json`）；`AdminUserPlanResponse` 增 `plan_source`；`AdminUserPlanRequest.duration_days` 放开 `ge=0` |
| `app/api/v1/admin.py` | 新增 2 个只读付款路由 + sync 入队路由；删 `/orders`；`role`/`plan`/`status` 改 `Literal` 校验；`keyword` 加 `max_length=100`；plan 响应补 `plan_source` |
| `app/services/admin_service.py` | 新增 `list_admin_payments` / `payment_summary` / `enqueue_payment_sync`、`_like_escape` / `_parse_enum_filter` / `_parse_payment_status` 辅助；`recent_activity` payment 改读 `jinshuju_payments`（orders 兜底）；ADM-05 有效 Pro 口径；ADM-09 `_lock_admin_rows` + `_assert_not_last_admin`（ban/demote，事务内锁全部 admin 行 + 409）；ADM-17 grant 写 `plan_source="admin"` / revoke 清空；ADM-10 users 排序加 `User.id`；ADM-11 过滤枚举显式校验 + LIKE 转义 + keyword 长度上限；ADM-14 settings 首建 SAVEPOINT + 交叉校验前置；删 `list_admin_orders` |
| `app/services/unlock_service.py` | `is_active_pro` docstring 去掉「每小时降级任务存在」的失效说法，改为事实（**不存在降级任务**，过期后 `plan` 仍是 pro，故以有效期为准） |
| `tests/test_admin_payments.py`（新） | 20 条：403/401、分页 total/has_more、status 过滤与非法 422、keyword（手机号/交易号/档位/序号；`%`/`_` 转义；11 位数字不触发 serial int32 溢出；长度上限）、手机号 COALESCE 回退与绑定优先、稳定排序、summary 数学与空集、sync（disabled/缺 token/配置齐全入队）、recent_activity 改读金数据（applied/pending 两种文案）、`raw_json` 不泄露 |
| `tests/test_admin_panel.py` | 新增 6 组：有效 Pro 口径（过期不计入 `pro_users`/`funnel.pro`；`pro_expired_count` 保留；`users_by_plan` 仍为库内分布）、ADM-11 非法枚举 422 + 通配符转义 + 长度上限、ADM-10 同时间戳分页不重不漏、ADM-09 最后一个可用管理员不可封/不可降 + 有第二管理员时可封 + 被禁管理员不算可用 + API 自操作守卫、ADM-17 grant/revoke 的 `plan_source`、ADM-14 阈值非法不污染对象 + 单例只建一行 |
| `tests/test_response_contract.py` | 新增 payments 三个端点的 OpenAPI 类型断言 + `AdminPaymentRow` 字段清单/无 `raw_json` 断言 + 「`/api/v1/admin/orders` 不在 paths」断言（只追加，未动并发队友的 feedback 断言） |

## 4. 前端改动清单

| 文件 | 改动 |
| --- | --- |
| `app/(admin)/admin/(shell)/payments/page.tsx`（新） | 「付费记录」页：`AdminPageHeader` + 同步/刷新；5 个 `StatChip`（已发放/待补发/待人工/已退款/累计收入 ¥ + 近 30 天/今日收入辅助行）；`FilterPills`（全部/已发放/待补发/待人工/已退款/异常）；`AdminSearchInput`（手机号/交易号/档位）；表格 7 列（时间含序号 / 用户 / 档位 / 金额 / 状态 Badge / 交易号 / 发放时间）；loading 骨架、空态、错误态 + 重试、`Pagination`；`overflow-x-auto` + `min-w-[880px]` 表格保证 390 不横向溢出；`th scope="col"`、`sr-only` caption、搜索区 `role="search"` + aria-label；只读（退款提示回金数据处理）；同步按钮 loading + toast |
| `components/admin/AdminSidebar.tsx` | 「运营」分组新增「付费记录」`/admin/payments`（`CreditCard` 图标） |
| `components/admin/AdminTopbar.tsx` | 面包屑新增 `/admin/payments` → 付费记录；并接收并行任务转交的 A-23 窄屏修复：面包屑容器 `min-w-0`、`AdminBreadcrumb` 传 `min-w-0 [&_span]:min-w-0 [&_span]:truncate`、右侧操作区 `shrink-0`（纯样式，390 下面包屑不再挤压操作区） |
| `app/(admin)/admin/(shell)/page.tsx` | 快捷入口 4→5：加「付费记录」，栅格 `lg:grid-cols-4 → lg:grid-cols-5` |
| `lib/adminData.ts` | 新增 `listPayments` / `paymentSummary` / `syncPayments`（typed，`Paginated<AdminPayment>`） |
| `types/index.ts` | 新增 `AdminPaymentStatus` / `AdminPayment` / `AdminPaymentSummary`，与后端字段一一对应（不含 `raw_json`） |

## 5. ADM 修复逐条

| 发现 | 修复 | 测试/证据 |
| --- | --- | --- |
| **ADM-05** 统计口径把过期 Pro 算作 Pro；docstring 说存在降级任务 | `pro_users`/`funnel.pro` 改为「未过期 Pro」；保留 `pro_expired_count`；`users_by_plan` 保留库内分布并注释；`unlock_service.is_active_pro` docstring 改为「不存在降级任务，以有效期为准」 | `test_admin_panel.py::TestAdminStatsActivePro`（造 1 个过期 + 1 个有效 Pro，断言 611→口径正确）；SQLite/实库口径见 §6.4 |
| **ADM-06** 后台看不到真实收款、recent_activity 只读空 `orders` | 2 个只读付款端点 + summary + sync 入队；`recent_activity` 改读 `jinshuju_payments`（applied「开通 Pro」/pending「付款待开通」），`orders` 仅兜底 | `test_admin_payments.py::TestRecentActivityPayment`；live 探测 §6.4 |
| **ADM-09** 无最后管理员保护 | ban（封禁）与 role（降级）在实际移除管理员可用性前，`SELECT ... FOR UPDATE` 按 `id` 顺序锁全部 admin 行并 `populate_existing` 复核，统计其他「未封禁管理员」为 0 → **409 CONFLICT**；保留「不能操作自己」；plan 变更不改变管理员身份故不额外加锁（已有目标行锁） | `test_admin_panel.py::TestLastAdminProtection`（服务层覆盖「并发互封时输的那条事务」路径）、API 自操作 400 |
| **ADM-10** 排序无 tiebreaker / 缺 total | `/admin/users` 排序加 `User.id`；付款列表 `entry_created_at DESC NULLS LAST, created_at DESC, id DESC`；两个列表都返回 `total` | `TestAdminUserListPagination`（同 created_at 两页不重不漏）、payments 排序测试 |
| **ADM-11** 非法枚举静默忽略 + LIKE 通配符注入 | `role`/`plan`/`status` 用 `Literal` → 422；服务层再做显式校验（防御直接调用）；keyword 统一 `_like_escape` + `escape="\\"` + 最长 100；付款 keyword 纯数字只对 int32 内序号做精确匹配 | `TestAdminUserFilterValidation`、payments keyword 测试 |
| **ADM-14（settings）** 首建并发 500、交叉校验先改对象 | `get_admin_settings` 首建改 SAVEPOINT（撞主键回滚后重读，最多 3 次，仍失败 409）；`update_admin_settings` 先用 patch+现值合并成 float 校验，通过后才 `setattr` | `TestAdminSettingsConcurrencySafety`（同 session 校验失败后对象未被改；单例只建一行） |
| **ADM-17** 管理员发放不维护 `plan_source` | grant 写 `plan_source="admin"`，revoke 清 `None` 并清 `plan_expires_at`；响应增 `plan_source`（additive） | `TestAdminPlanSource` |
| ADM-19（orders 部分）/§5 死代码 | 删 `GET /admin/orders` + `AdminOrderRow` + `list_admin_orders` | `test_response_contract.py::test_legacy_admin_orders_route_is_gone`；live 404 |
| ADM-16/18 等 | 不在本任务边界（ADM-09 的「持久化管理审计表」也**未做**，见 §8） | — |

## 6. 验证

环境：中文 Windows，后端 `backend/.venv/Scripts/python.exe`（`PYTHONUTF8=1`、`PYTHONPATH='.'`，在 `backend/`）；前端命令在 `frontend/`；dev 后端 :8000（`--reload`）+ Next :3000 全程运行。

### 6.1 后端 lint / format

```
> ruff check app tests
All checks passed!
> ruff format --check app tests
321 files already formatted
```

### 6.2 后端定向测试（新增/修改文件）

```
> pytest tests/test_admin_payments.py tests/test_admin_panel.py \
    tests/test_response_contract.py tests/test_presence.py -q
======================= 85 passed in 154.84s (0:02:34) ========================

# 文件级用例数（collect-only）：test_admin_payments 20 / test_admin_panel 22 /
# test_response_contract 38 / test_presence 5 = 85
```

### 6.3 后端全量测试

```
> pytest tests/ -q
========== 1458 passed, 14 skipped, 30 warnings in 724.73s (0:12:04) ==========
```

- exit code 0；collected 1472（1458 + 14 skip）。
- 14 个 skip 全为本机未设 `PG_TEST_URL` 的 `integration` 用例（catalog/favorites/jinshuju 并发/celery 等真连 Postgres 语义），与本次改动无关。
- 说明：本轮在收尾前还跑过一次全量（**1415 passed / 14 skipped**，685.58s），之后补了 int32 修复 + 1 条回归测试；且**并行队友在同一工作树新增了测试**（如 `test_admin_subtitle_pipeline.py`），所以最终一次全量的 collected 从 1429 变成 1472、pass 数从 1415 变成 1458。最终数字对应「收尾时整棵工作树」的状态，包含并行任务的测试，不是我一个人的增量。

### 6.4 live API 实测（dev :8000，管理员 token）

```
GET  /api/v1/admin/payments/summary
→ {"applied":3,"pending":2,"ignored":1,"refunded":1,"error":1,
   "paid_total_fen":26970,"paid_30d_fen":24980,"paid_today_fen":19990,"applied_today":1}
GET  /api/v1/admin/payments?page=1&page_size=2
→ total=8、has_more=true、条数=2；首条 phone=18800001111、status=applied、无 raw_json
GET  /api/v1/admin/payments?status=bogus        → 422 VALIDATION_ERROR
GET  /api/v1/admin/payments?keyword=13611116666 → total=1（11 位手机号不再 500）
GET  /api/v1/admin/orders                       → 404（端点已删）
POST /api/v1/admin/payments/sync                → 200 {"queued": true}（dev .env 已配金数据；任务由本机 Celery worker 消费，未新增付款行）
```

### 6.5 前端门禁与单测

```
> npm run check
check-design-system：9 条规则全部通过（无新增白名单）
check-session-writes：2 条规则通过
tsc --noEmit：通过
eslint src/ e2e/：通过
prettier --check："All matched files use Prettier code style!"
→ exit 0
```

> 过程说明（如实记录）：收尾早期 `npm run check` 曾在 prettier 关失败，唯一原因是并行队友正在改的 `src/app/(admin)/admin/(shell)/users/page.tsx` 未格式化（我未触碰该文件）；该文件由队友格式化后，最终一次 `npm run check` 五关全绿、exit 0。

```
> npm run test:unit
Test Files  31 passed (31)
Tests       336 passed (336)
Duration    692ms
```

### 6.6 Chromium 浏览器实测（1440 / 390，管理员登录 13900139000）

脚本：临时 `.tmp-diag/payments-admin/walkthrough.cjs`（`.tmp-diag/` 已被 gitignore）；结果 JSON：`docs/evidence/admin-audit-2026-10-26/payments-walkthrough.json`；截图：`payments.png`（1440×900）、`payments-390.png`（390×844）。

| 项 | 1440 | 390 |
| --- | --- | --- |
| HTTP / h1 | 200，「付费记录」 | 200，「付费记录」 |
| 横向溢出（documentElement） | 无（scrollWidth=clientWidth=1440） | 无（scrollWidth=clientWidth=390）；表格在 `overflow-x-auto` 容器内横向滚动（`table_wrapper_scrollable=true`），页面本身不滚 |
| 表格行 | 8 行，7 个 `th[scope="col"]` | 8 行 |
| 面包屑 / 侧栏 | 面包屑含「付费记录」；侧栏「付费记录」高亮（`aria-current`） | 面包屑单行显示、不挤压右侧操作区（A-23 转交的 `min-w-0` + truncate 修复）；汉堡抽屉内可点到「付费记录」 |
| 搜索 | `role="search" aria-label="搜索付款记录"` | 同 |
| 分页 | 「第 1 页」可见 | 可见 |
| 状态筛选 | 点「待补发」→ 共 2 条（2 行）；点「全部」恢复 | — |
| 关键字 | 搜 13611116666 → 共 1 条 | — |
| 空态 | 搜不存在值 → 「暂无付款记录」 | — |
| 错误态 + 重试 | abort 列表请求 → 「加载付款记录失败」+ 重试按钮；恢复后 8 行 | — |
| 仪表盘快捷入口 | `/admin/payments` 链接存在 | — |
| console 错误 | 0 | 0 |
| 失败请求（/api/ 且 ≥400） | 0 | 0 |
| 预期内错误 | 错误态用例主动 abort 产生的 3 条 `net::ERR_FAILED`（仅此用例） | — |

状态色：已发放 green / 待补发 amber / 待人工 amber / 已退款 neutral / 异常 red；金额 `tabular-nums`；时间与交易号使用 mono 字体。

### 6.7 dev 库播种数据（截图用，可回滚）

`jinshuju_payments` 原为 0 行。为截图播种了 8 行 `trade_no LIKE 'TEST-EVID-%'` / `entry_token LIKE 'evid-entry-%'`（覆盖 applied/pending/ignored/refunded/error，其中 1 行 40 天前用于验证 30 天窗口）。**这 8 行是 dev 假数据，不属于代码改动**；保留是为了让 Lead 能直接打开页面复核，删除语句：

```sql
DELETE FROM jinshuju_payments WHERE entry_token LIKE 'evid-entry-%';
```

## 7. 风险与未做项

1. **最后管理员保护只在服务层被直接测试**：API 层有「不能操作自己」守卫，单请求下 actor 自身必是可用管理员，故「最后一个管理员」分支只能在并发互封/互降时由输掉锁竞争的那条事务触发。测试用服务层调用覆盖了该分支；真实 Postgres 并发未做压测（本机 dev 后端只有一个管理员 token，且写操作会污染 dev 库）。SQLite 测试库忽略 `FOR UPDATE`，锁语义只能靠代码复核（锁序：按 `id` 升序锁全部 admin 行，避免 ABBA 死锁）。
2. **ADM-14 的「并发首建」未做真并发测试**：SAVEPOINT 路径在 SQLite 单连接上无法复现两个事务同刻插入；已覆盖「重复 GET 只建一行」与「校验失败不污染对象」。SAVEPOINT 模式与 `home_content_service` 一致，Postgres 语义成立。
3. **持久化管理审计表（ADM-09 后半）未做**：审计发现建议新增 `admin_audit_logs` 记录 ban/role/plan/delete/takedown 等，属新表 + 迁移，超出本轮文件边界（本轮无迁移）。当前仅有 `logger.info("admin_action ...")` 结构化日志（ban/role/plan/payments_sync）。
4. **`AdminSearchInput` 组件没有 `aria-label`/`id` 透传**：它不在本任务可改文件清单内，页面用 `role="search" aria-label="搜索付款记录"` 给搜索区做无障碍命名 + 描述性 placeholder；如需给 input 本身加可编程 label，需改共享组件（`components/admin/ui/AdminSearchInput.tsx`），建议后续统一做。
5. **A-23「390 面包屑被挤压」（frontend-fixes-pages 转交）已顺手修掉**：只动 `AdminTopbar.tsx`（我的文件范围）加 `min-w-0` + 截断 + 右侧 `shrink-0`，纯样式、无行为变化，已在 390 走查确认；无遗留转交项。
6. **同步按钮的浏览器点击未在走查中触发**：dev `.env` 已配置真实金数据凭据，点击会向真实金数据接口拉取并可能把真实付款落进 dev 库（本轮通过 curl 触发过一次，worker 消费后未新增行，未发现数据污染）。按钮的 loading/disabled/toast 逻辑走代码复核；端点入队行为由 pytest（配置齐全 → `queued=true` 且 Celery `delay` 被调用）与 live curl 覆盖。
7. **`recent_activity` 仍是「取最近 8 条再合并排序」**：金数据与注册各自 limit 8 后合并取 8，理论上极端分布下可能漏掉中间项（与既有实现同构，未扩大改动面）。
8. **dev 库保留了 8 行 TEST-EVID 付款数据**（见 §6.7），会出现在后台「最近动态」与付款页统计中，便于复核；如不想保留请执行 §6.7 的 DELETE。

## 8. 复核命令速查

```powershell
cd C:\Users\Administrator\Speaking\backend
$env:PYTHONUTF8=1; $env:PYTHONPATH='.'
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m ruff format --check app tests
.\.venv\Scripts\python.exe -m pytest tests/test_admin_payments.py tests/test_admin_panel.py tests/test_response_contract.py -q
.\.venv\Scripts\python.exe -m pytest tests/ -q

cd ..\frontend
npx prettier --check "src/app/(admin)/admin/(shell)/payments/page.tsx"
npm run test:unit

# 浏览器：管理员登录 13900139000 / SeeWordAdmin!2026 后打开 http://localhost:3000/admin/payments
# 截图与 JSON 见 docs/evidence/admin-audit-2026-10-26/payments.png / payments-390.png / payments-walkthrough.json
```
