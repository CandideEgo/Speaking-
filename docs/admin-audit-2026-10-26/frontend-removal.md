# 前端清理报告：移除兑换码后台与退役 `/redeem` 壳

- 任务：task-2「Frontend: remove redeem-code admin UI and retired /redeem shell」
- 分支：`redesign`（工作树，未提交）
- 日期：2026-10-26
- 边界：只改 `frontend/src`、`frontend/e2e` 与本报告；未改 `backend/`、根 `CLAUDE.md`、`PROGRESS.md`、`docs/admin-audit-2026-10-26/README.md`。
- 后端并行任务（task-1）正在删除 `GET /api/v1/admin/orders`、`GET /api/v1/admin/redemptions*` 与全部 `/api/v1/redeem-codes/*`；本轮把前端对上述端点的全部调用一并删除，前端不再请求已删端点。

## 1. 删除的文件（4 个页面/spec + 对应目录）

| 路径 | 说明 |
| --- | --- |
| `frontend/src/app/(admin)/admin/(shell)/invites/page.tsx` | 兑换码管理页（生成/导出/作废/退款），仅数据源为 `/api/v1/redeem-codes/*`，整体删除 |
| `frontend/src/app/(admin)/admin/(shell)/orders/page.tsx` | 「订单管理」实为兑换码激活记录（`/api/v1/admin/redemptions*`），整体删除 |
| `frontend/src/app/(main)/redeem/page.tsx` | 退役路由壳（`redirect("/")`），页面与目录删除 |
| `frontend/e2e/redeem.spec.ts` | `/redeem` 白名单/重定向用例，路由已不存在，删除 |

> `orders` 页删除后，后台暂时没有「收入/付款记录」视图；真实收款走站外金数据收款页，**新增收入/付款对账页是后续工作项**（backend 侧金数据付款记录已在 DB，缺只读查询接口与页面）。

## 2. 修改的文件（13 个）

| 文件 | 改动 |
| --- | --- |
| `frontend/src/components/admin/AdminSidebar.tsx` | 移除「运营」分组下 `订单管理`（`/admin/orders`）、`兑换码`（`/admin/invites`）两项；移除不再使用的 `CreditCard`、`Ticket` 图标导入 |
| `frontend/src/components/admin/AdminTopbar.tsx` | 移除 `BREADCRUMBS` 中 `/admin/orders`、`/admin/invites` 两条 |
| `frontend/src/app/(admin)/admin/(shell)/page.tsx` | 删「Pro 用户」卡片的 `redeems_today` 兑换增量；删快捷入口「订单管理」「兑换码」，补「系统设置」，栅格 `lg:grid-cols-5 → lg:grid-cols-4`（4 项在 `sm` 为 2×2、`lg` 为 1×4，无空格子）；`Flag` 导入换 `Settings` |
| `frontend/src/app/(admin)/admin/(shell)/stats/page.tsx` | 删「Pro 用户」卡片的 `redeems_today` 兑换增量；转化漏斗末级文案「兑换 Pro」→「开通 Pro」（后端 `funnel.pro` 就是 Pro 用户数，不是兑换码计数） |
| `frontend/src/lib/adminData.ts` | 删除 `listOrders`、`listRedemptions`、`redemptionSummary`、`listRedeemCodes`、`redeemCodeSummary`、`generateRedeemCodes`、`exportRedeemCsv`、`revokeRedeemCode`、`refundRedeemCode` 共 9 个函数及对应 `AdminOrder`/`RedemptionRecord`/`RedeemCode` 类型导入；`Paginated` 仍被 users/feedback 使用，保留 |
| `frontend/src/types/index.ts` | 删除 `RedeemCode`、`RedemptionRecord`、`AdminOrder` 三个接口与 `AdminStats.redeems_today` 字段 |
| `frontend/src/proxy.ts` | `PUBLIC_PATHS` 移除 `"/redeem"` |
| `frontend/src/lib/navigation.ts` | 归属表注释移除 `/redeem`（`/pricing`、`/checkout` 保留） |
| `frontend/src/lib/navigation.test.ts` | 「无归属路径命中 0 项」用例移除 `/redeem` 期望 |
| `frontend/src/app/(main)/MainLayoutInner.tsx` | 登录墙注释白名单示例 `（/redeem、/upgrade 等）` → `（/upgrade、/contact 等）` |
| `frontend/src/components/layout/PublicTopBar.tsx` | 壳层注释白名单示例 `（/contact、/upgrade、/redeem）` → `（/contact、/upgrade）` |
| `frontend/e2e/mobile.spec.ts` | 删除「Mobile - Redeem Page」describe（2 处断言随路由删除） |
| `frontend/e2e/video.spec.ts` | 删除「Auth Surface」中 redeem 页公开性用例 |

### 文案调整（用户可见）

| 位置 | 前 | 后 |
| --- | --- | --- |
| `(main)/contact` FAQ | 「兑换码在哪里输入？有效期多久？」+「无需输入兑换码 / 兑换码或人工开通发邮件」 | 「付款后多久开通？在哪里查看会员有效期？」+「从升级页进入金数据收款页，微信内完成付款，支付确认后自动开通到发起购买的当前账号，不需要另填手机号；超过 30 分钟未到账附订单号发 support@seeword.top」 |
| `(main)/contact` 反馈提示（FAQ + 联系我们卡片） | 「账单、发票、兑换码问题请附订单号或兑换码」 | 「账单、发票问题请附订单号」 |
| `app/terms` 会员开通行 | 「支付确认后开通至发起购买的登录账号，无需兑换码」 | 「支付确认后开通至发起购买的登录账号，无需另行激活」 |
| admin `settings` 「启用支付」说明 | 「非经营性平台，保持关闭。关闭时仅支持兑换码激活。」 | 「非经营性平台，保持关闭。会员收款走升级页的站外金数据收款页，支付确认后自动开通到当前账号。」 |

口径来源：根 `CLAUDE.md`「会员收款走站外金数据收款页（`JINSHUJU_*` env）」——站内 `/upgrade` 进金数据收款页，付款后 Celery 自动延长当前账号，不需要买家填手机号。

## 3. 验证（真实输出）

### 3.1 `npm run check`（design-system + session-writes + tsc + eslint + prettier）→ exit 0

```
check-design-system：DEC-075 前端设计系统门禁（9 条规则）
扫描 src/ 共 374 个文件（按规则去重前）
  规则 1 · 页面不得自带容器类：通过
  规则 2 · 不得写原始调色板工具类：通过
  规则 3 · rounded-* 只允许 sm|md|lg|pill|full|none：通过
  规则 4 · page.tsx 不得自写 <h1：通过
  规则 5 · 不得写任意值 hex 颜色：通过
  规则 6 · 无色阶 white/black 不得当面用：通过
  规则 7 · 实心主操作不得用 brand-500 配白字：通过
  规则 8 · (main) 下不得自写 <main>：通过
  规则 9 · 实心主操作不得用 brand-500 配裸白字：通过

PASS：9 条规则全部通过。
check-session-writes：会话写入唯一入口门禁（2 条规则）
扫描 src/ 共 374 个 .ts/.tsx
  规则 1 · 不得写 document.cookie：通过
  规则 2 · 不得直接写会话的 localStorage key：通过
通过。

> seeword-frontend@0.1.0 typecheck
> tsc --noEmit            （无输出 = 通过）

> seeword-frontend@0.1.0 lint
> eslint src/ e2e/        （无输出 = 通过）

> seeword-frontend@0.1.0 format:check
Checking formatting...
All matched files use Prettier code style!
```

- 未新增任何 design-system 白名单/豁免，未改 `frontend/scripts/check-design-system.mjs`。
- 白名单清单与改动前一致（仍为 9 条点名理由）。

### 3.2 `npm run test:unit` → exit 0

```
 Test Files  31 passed (31)
      Tests  336 passed (336)
   Duration  678ms
```

`src/lib/navigation.test.ts` 50 个用例全过（含本次修改的「无归属路径命中 0 项」）。

### 3.3 残留引用 grep → 无匹配

```powershell
# 在 frontend/ 下
rg -n "redeem|Redeem|REDEEM|兑换|admin/invites|admin/orders|listOrders|Redemption|invites" src       # exit 1（无匹配）
rg -n "redeem|Redeem|REDEEM|兑换|admin/invites|admin/orders|listOrders|Redemption|invites" e2e       # exit 1（无匹配）
rg -n "AdminOrder|RedeemCode|RedemptionRecord|redeems_today|redeem-codes|/redeem|兑换" src e2e scripts # exit 1（无匹配）
```

全仓库（排除 `node_modules` / `.git` / `.tmp-diag` / 二进制）扫描仍能命中的只有：

| 位置 | 性质 | 处置 |
| --- | --- | --- |
| `backend/app/api/v1/admin.py` `@router.get("/orders")`、`backend/app/schemas/admin.py::AdminOrderRow` | 后端在删（task-1 进行中）；前端已无调用方 | 归 backend-remover（本轮边界外） |
| `docs/PROGRESS.md:379,486,489`、`docs/audit-2026-10-24/*`、`docs/code-review-2026-10-20.md`、`docs/product-review-2026-10.md`、`docs/beta-prototype-alignment-2026-10.md` | 历史评审/记录文档，描述旧实现（`/redeem`、`redeem-codes`） | 历史事实，不改；Lead 负责文档口径 |
| `docs/evidence/design-redo/*.json` | 旧截图批次的路由清单（历史证据） | 历史证据，不改 |

### 3.4 管理员浏览器走查（Playwright，chromium，dev :3000 + :8000）

登录 `http://localhost:3000/admin/login`（13900139000 / SeeWordAdmin!2026）后走查；脚本为临时文件 `.tmp-diag/frontend-removal/admin-walkthrough.cjs`（`.tmp-diag/` 已在 `.gitignore`），结果 JSON 归档在 `docs/evidence/admin-audit-2026-10-26/frontend-removal/walkthrough.json`。

必需三页（1440×900 与 390×844 各一遍）：

| 路由 | status | h1 | 横向溢出 | 404 页面 | 控制台错误 |
| --- | --- | --- | --- | --- | --- |
| `/admin` | 200 | 运营概览 | 无 | 否 | 0 |
| `/admin/users` | 200 | 用户管理 | 无 | 否 | 0 |
| `/admin/stats` | 200 | 数据统计 | 无 | 否 | 0 |

- 侧栏 + 快捷入口（以及三页）的全部 `/admin*` 链接逐个真实打开：**无 404、无死链**；侧栏文案为「仪表盘 / 视频管理 / 首页编排 / 频道管理 / 用户管理 / 反馈公告 / 数据统计 / 系统设置」——不再含「订单管理」「兑换码」。
- 已删路由探针：`/admin/invites`、`/admin/orders`（管理员登录态）与 `/redeem`（用仅存在性 cookie 越过边缘登录墙）均返回 **HTTP 404** 且渲染 404 页。
- 唯一控制台错误即上述 3 个探针的「404 resource」日志，属预期。
- 截图（新生成）：`docs/evidence/admin-audit-2026-10-26/frontend-removal/admin-1440.png`、`admin-users-1440.png`、`admin-stats-1440.png`、`admin-390.png`、`admin-users-390.png`、`admin-stats-390.png`。
- 同一次走查的首轮里，`/admin/home-editorial` 出现 1 次瞬时 `500 GET /api/v1/users/me`、`/admin/settings` 出现 `429 GET /api/v1/admin/admins`；复核 `GET /users/me` 直连返回 200，第二轮完整重跑**全部消失**（判断为后端 task-1 热重载瞬时 500 + 全局 200/min 限流被快速连续导航触发，均与本次改动无关；必需三页两轮均为 0 错误）。

### 3.5 e2e（如实标注）

- `npx playwright test e2e/redeem.spec.ts`：**spec 已删除，未执行**（路由已不存在，删除是任务要求）。
- 替代冒烟：`npx playwright test e2e/public-layout.spec.ts --project=chromium` → **2 passed (24.8s)**（覆盖 /login、/register、/terms、/privacy、404 页与 onboarding/set-password，三档视口 + 亮暗主题，无横向溢出）。
- 验证被改 spec 仍可跑：`npx playwright test e2e/video.spec.ts --project=chromium -g "Auth Surface"` → **2 passed (6.6s)**；`npx playwright test e2e/mobile.spec.ts --list` → **24 tests**（文件可正常解析，redeem 用例已不在）。
- **未执行**：全量 `npx playwright test`（四个 project、39 个 spec；dev 后端非 `ENV=testing`，全量并行会撞限流；且 backend 正在并行重写，全量结果不可归因）。`e2e/redeem.spec.ts` 之外没有其它 spec 引用 `/admin/invites`、`/admin/orders` 或 `/redeem`（grep 证明见 3.3）。

## 4. 残余项与风险

1. **后台暂无收入/付款视图**：`orders` 页删除后，管理员看不到金数据付款记录/收入。真实收款数据在后端（金数据同步），但缺只读管理接口与页面——建议后续加「付款/收入」页（列表 + 按档位/时间汇总），本任务只删不加。
2. **backend 侧的 `/admin/orders` 与 `AdminOrderRow` 仍在工作树中**（task-1 进行中）；前端已无任何调用，删除归 backend-remover。
3. **历史文档仍提及 `/redeem` / 兑换码**：`PROGRESS.md`、`docs/audit-2026-10-24/*`、`docs/evidence/design-redo/*.json` 等是历史记录，按分工由 Lead 决定口径，本轮未改。
4. **管理端设置里的「微信小商店 URL」行保留**：它不属于兑换码链路（属旧购买入口字段，现行收款是金数据），是否清理建议随「付款/收入」工作项一起评估；本轮未动，避免扩大边界。
5. `/redeem` 删除后，外部书签直达 `/redeem` 会先被登录墙拦到 `/login?next=/redeem`（未登录）或得到 404（已登录），系统不再提供该路径的重定向壳——与「删除退役路由」的验收口径一致。
6. 未提交 git；未重启 dev server（热更新生效）。
