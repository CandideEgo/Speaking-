# 后台壳层/弹窗/下拉/登录/设置/统计修复报告（task-8，2026-10-26）

- 仓库：`C:\Users\Administrator\Speaking`，分支 `redesign`；前端 `frontend/`（Next.js 16 App Router + React 19 + Tailwind v4）。
- 对应审计：[`docs/admin-audit-2026-10-26/frontend.md`](./frontend.md)（下称「审计」）中的 A-03/05/06/11/12/13/17/18（部分）/21/22/27（skip link 部分）/28/30/31/32/37。
- 任务：共享任务 board `task-8`「Frontend fixes A: admin shell/dialog/dropdown/login/settings/stats a11y & error states」。
- 性质：**只改本条线负责的文件 + 本报告 + 证据截图**。未改 `users/videos/channels/feedback` 页面、`DataTable`/`Pagination`、`AdminSidebar`/`AdminTopbar`、仪表盘 `page.tsx`、`lib/adminData.ts`、`types/index.ts`、`CLAUDE.md`/`PROGRESS.md`；未新增依赖、未加 design-system 白名单/豁免、未 commit、未重启 dev server、未触碰生产。
- 并行约束：工作树同时有两路改动（payments/admin 壳层线、用户端观看页线）。本报告只对上述归属文件负责；全量门禁若因并行文件失败，会在 §3 单独归因。

## 0. 结论

审计中归属本线的 14 条发现**全部修复**（其中 A-18 覆盖本线四类小字状态色；A-37 删除死文件并清理 barrel）。全量 `npm run check` 在本线文件上是绿的（design-system 9 条 / 会话写入 2 条 / tsc / ESLint / Prettier），单测 336 条通过；浏览器实测覆盖 dialog 语义+焦点陷阱+Esc 归还、末行下拉不被裁切、设置/统计 500 错误态+重试、登录错误 live region+安全 `?next=`、阈值 60→0.6 保存、skip link、1440/390 无横向溢出与 axe 复扫。

唯一需要评审注意的跨文件改动：删除死文件时同步删掉了 `components/admin/ui/index.ts` 里对它的 re-export —— 该 barrel 是 `AdminTable` 的唯一引用点（全仓 `rg AdminTable` 确认零消费者），不删这 6 行 `tsc` 会红；这不属于任务里点名的「不要改」清单。

## 1. 修复一览

| 发现 | 文件 | 做法 | 验证 |
| --- | --- | --- | --- |
| A-03 设置/统计失败永久骨架 | `(shell)/settings/page.tsx`、`(shell)/stats/page.tsx` | 拆 `loading` / `loadError` / 无数据三态；错误态保留 `AdminPageHeader`、用 `AdminEmptyState` + 「重试」；刷新失败但有旧数据时顶部错误条（`role="alert"`）+ 重试，不丢旧内容；不再把失败混成骨架或空数据 | mock 500 → 0 个 `animate-pulse`、h1 在、重试可恢复；见 §4 |
| A-05 壳层把 5xx 当会话过期 | `(shell)/layout.tsx` | 仅 401/403 才 toast+跳登录；5xx/网络错误（`ApiClientError.status>=500` 或 0）保留会话，渲染壳层级错误卡 + 重试；用递增 runId 丢弃过期响应 | `/users/me` 500 → 仍停留 `/admin`、token 保留、重试后恢复；401/403 → 跳 `/admin/login` |
| A-06 阈值单位错/无校验/英文 422 | `(shell)/settings/page.tsx` | 选「百分比 UI」：展示 0–100（60% ↔ 后端 0.6），提交 `/100`；`number` 输入补 `min=0 max=100 step=0.1`；中文范围/大小关系校验 + `role="alert"`，非法时禁用保存；`VALIDATION_ERROR` 保存失败时给中文口径兜底 | 输入 150 → 中文提示 + 保存禁用；GET 0.6/0.8 显示 60/80；PUT payload 实测 `0.6/0.8` |
| A-11 确认弹窗无 dialog 语义/焦点陷阱 | `ui/AdminDialog.tsx` | `role="dialog" aria-modal="true"`；有可见标题用 `aria-labelledby`，`AdminConfirmDialog` 的标题 `<h3>` 生成 id 后同样用 `aria-labelledby`（不再依赖 `aria-label`）；复用用户端 `hooks/useModalFocus.ts` 做打开聚焦、Tab 循环、Esc 关闭、关闭归还焦点；保留背景滚动锁 | `role=dialog`、`aria-modal=true`、`labelledBy→封禁用户`；焦点在「取消」；Tab×8 全在弹窗内；Esc 后焦点回触发按钮 |
| A-12 行操作下拉无名称/无 role/焦点不进菜单 | `ui/AdminDropdown.tsx` | 新增可选 `label?: string` 作为触发按钮 `aria-label`；菜单 `role="menu"`/条目 `role="menuitem"`；打开聚焦首项，↑/↓/Home/End 移动，Esc 关闭并归还焦点，Tab 关闭后继续正常顺序；菜单 `aria-labelledby` 指向触发按钮 | 20 个触发按钮 0 无名；`role=menu`、3 个 `menuitem`；方向键实测移动；Esc 归还 |
| A-22 末行下拉被容器裁切 | 同上 | `createPortal` 到 `document.body` + `position: fixed`；按视口空间 flip（下方不足且上方更宽裕时向上）并 clamp，超高时菜单内部滚动；滚动/缩放关闭菜单防脱位；不再受 `overflow-hidden`/`overflow-x-auto` 祖先影响；API 向后兼容（`items/trigger/align/className` 不变） | 第 20 行菜单 rect 完全在 1440×900 视口内、3 项中心点命中菜单 |
| A-13 设置页输入无标签/开关无名 | `(shell)/settings/page.tsx` | `Row` 标题改为 `<label htmlFor>` + 生成 label/description id 约定；文本框/数字框补 `id` + `aria-describedby`；`Toggle` 补 `aria-labelledby`（指向行标题）与 `aria-describedby` | 实测 0 个无 label 输入、6 个开关均有名 |
| A-17 登录错误不播报 | `login/page.tsx` | 错误块 `role="alert"` + 固定 id；两个输入补 `aria-invalid` + `aria-describedby` | 实测 `role=alert`、`aria-invalid=true`、`aria-describedby=admin-login-error` |
| A-18 小字状态色对比度不足 | `login/page.tsx`、`stats/page.tsx`、`QualityReportPanel.tsx`、`StatCard.tsx`、`settings/page.tsx` | 小字状态文本改 `text-success-text` / `text-error-text` / `text-warning-text`；圆点与图标保持 `text-success`/`text-error` | 计算出 `#15803d`（统计 delta）、`#b91c1c`（登录错误/设置校验）；见 §4 |
| A-21 死配置假装生效 | `(shell)/settings/page.tsx` | 4 个字段（站点名称 / 微信小商店 URL / 启用支付 / 转录幻觉检测）加「仅登记，运行时未读取」徽标，并把描述改成真实口径（支付门禁读 env、幻觉检测无条件执行、字段无消费者）；**没有**假装接通 | 实测 4 处标注 |
| A-27 壳层无 skip link | `(shell)/layout.tsx` | 壳层第一个可聚焦元素「跳到内容」（`sr-only` → `focus:not-sr-only`），`main id="admin-main" tabIndex={-1}` | Tab 首焦点=跳到内容；Enter 后 `activeElement=admin-main`、hash=`#admin-main` |
| A-28 stats 标题跳级 h1→h3 | `(shell)/stats/page.tsx` | `ChartCard` 小标题 `h3` → `h2`（页面 h1 来自 `AdminPageHeader`） | 实测 h1×1、h2×7、h3×0 |
| A-30 登录忽略 `?next=` | `login/page.tsx` | 提交成功后读 `window.location.search` 的 `next`，只放行站内 `/admin` 或 `/admin/...`；拒绝 `//host`、`/\host`、换行、非 admin 前缀、以及绕回登录页自身的地址 | `/admin/settings` 生效；`https://evil…`、`//evil…`、`/watch/abc` 全部回落 `/admin` |
| A-31 密码可见性按钮无名 | `login/page.tsx` | `aria-label`「显示密码/隐藏密码」+ `aria-pressed` | 实测翻转 label 与 pressed |
| A-32 登录 label 未关联 | `login/page.tsx` | `<label htmlFor>` + 输入 `id`；图标 `aria-hidden` | 实测两个输入各 1 个关联 label |
| A-37 `ui/AdminTable.tsx` 死代码 | `ui/AdminTable.tsx`、`ui/index.ts` | 先全仓确认零 import 后删除文件；同步删除 `ui/index.ts` 里的 re-export（唯一引用点） | `tsc --noEmit` 通过；`git status` 显示 `D` |

## 2. 关键实现细节（给评审）

### 2.1 壳层错误分级（A-05）

- 判定只看 `ApiClientError.status`：`401/403` → `toast.error("登录已过期，请重新登录")` + `router.replace("/admin/login")`；**其它**（5xx、网络失败 status=0、非 ApiClientError）→ `status="error"`，渲染 `role="alert"` 错误卡 + 重试按钮，不调用 `logout()`、不清 token。
- 重试走 `checkSession()`（`useRef` 递增 runId），避免旧响应覆盖新结果；`error` 状态页不渲染 sidebar/topbar，避免未验证角色时暴露导航。
- 说明：`/users/me` 返回 `role!=="admin"` 的既有「无管理员权限 + 800ms 后跳登录」逻辑保持不变。

### 2.2 下拉 menu 的定位与焦点（A-12/A-22）

- 首次渲染菜单是 `visibility:hidden` 的 portal，`useEffect` 量到真实尺寸后算 `{top,left,maxHeight}` 再显示（`useLayoutEffect` 会触发 SSR 警告，故用 effect；隐藏态先渲染，不会闪）。
- 空间不足时向上 flip；水平方向按 `align` 计算后 clamp 到 `[8, innerWidth - width - 8]`；高度不足时菜单内部滚动（`overflow-y-auto`）。
- 打开时焦点进第一个可用 `menuitem`；点击条目前先 `closeMenu(true)` 把焦点还给触发按钮，再执行 `item.onClick()` —— 这样紧跟着打开的 `AdminDialog` 会把「打开弹窗前的焦点」正确记为触发按钮，关闭后归还。
- 兼容性：调用方 API 不变；新增可选 `label`。`frontend-remover` 已在 users 页传 `label={\`${displayName} 的操作\`}`，实测生效（见 §4）。未传 `label` 且用默认「…」图标时兜底 `aria-label="更多操作"`。

### 2.3 阈值百分比（A-06）

- 数据层仍是 0–1 比例（不改后端契约）：`ratioToPercentText(0.6)="60"`，输入时 `percent/100` 回写 form，保存提交的是比例。
- 输入用字符串草稿（允许清空/输入中），非法值不写 form，`role="alert"` 提示「需为 0–100 的百分比」，保存按钮 `disabled`。
- 422 兜底：`ApiClientError.code === "VALIDATION_ERROR"` 时显示中文提示，不再裸露 `quality_warn_threshold: Input should be less than or equal to 1`。

### 2.4 设置页标签结构（A-13）

- `Row` 现在接收 `field: {control,label,description}`（由 `fieldIds(key)` 生成），渲染 `<label htmlFor={control} id={label}>` 与 `<p id={description}>`；控件统一传 `describedBy`。
- `Toggle` 用 `aria-labelledby`（行标题 id）+ `aria-describedby`；`label htmlFor` 对 `<button>` 同样成立（button 是 labelable 元素），点标题也能切换。

## 3. 门禁与单测

工作目录 `frontend/`：

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| design-system（9 条） | **PASS** | 无新增白名单/豁免；输出打印的白名单与改动前一致 |
| session-writes（2 条） | **PASS** | 扫描 374 个 `.ts/.tsx` |
| `tsc --noEmit` | **PASS** | 全仓通过（含并行改动当时的快照） |
| `eslint src/ e2e/` | **PASS**（本线文件单独跑 exit 0） | 全量 lint 也通过 |
| `prettier --check` | 本线 9 个文件 **PASS**；全量最终一轮 **FAIL**，唯一失败文件是并行队友的 `(shell)/users/page.tsx`（非本任务文件，未改） | 12:59 的首轮全量 `npm run check` 曾整体 exit 0；13:0x 复跑时该文件被并行改动后未格式化。**归因如实**：与本线文件无关 |
| `npm run test:unit` | **PASS**：31 files / 336 tests | 13:07 复跑仍全绿 |

未新增单测的原因：硬边界只允许改点名的源文件（测试与源码同目录，新增 `*.test.tsx` 会落到边界外）；本线的纯逻辑（`resolveAdminNext`、百分比换算）已由 Playwright 行为用例覆盖，且没有把测试塞进别人的测试文件。

## 4. 浏览器实测（Playwright chromium，dev :3000 / :8000）

管理员会话：`13900139000 / SeeWordAdmin!2026`（脚本复用 `.tmp-diag/frontend-audit/token-cache.json`，未写入任何业务数据；设置保存用 `page.route` mock PUT 响应，**未真实改库**）。

| 场景 | 实测读数 |
| --- | --- |
| 行操作下拉（`/admin/users`，20 行） | 触发按钮 20 个、无名 0 个（例：「19286834001 的操作」）；末行菜单 `role=menu`、3 个 `menuitem`；菜单 rect `top=645 bottom=763`（视口 900）、左右/上下均在视口内；3 项中心点 `elementFromPoint` 均命中菜单；方向键：Down→「提升为管理员」、Up→「封禁用户」；Esc 关闭且焦点回到触发按钮 |
| 确认弹窗（封禁用户） | `role=dialog`、`aria-modal=true`、`aria-labelledby→"封禁用户"`（visible 文本）、`aria-label=null`；打开后焦点在「取消」；连按 Tab×8 全部仍在弹窗内；Esc 关闭（`dialogGone=true`）且焦点回到该行「…」按钮 |
| 设置页 500 | mock GET 500 → 页面 h1「系统设置」保留、`animate-pulse=0`、显示「无法加载系统设置 / mock upstream 500 / 重试」；点重试后表单出现 |
| 设置页阈值 | 服务端比例 0.6/0.8 → 输入显示 `60`/`80`，`min=0 max=100`，后缀 `%`，label 关联「阻塞阈值/警告阈值」；输入 150 → `role=alert`「阻塞阈值需为 0–100 的百分比…」、`aria-invalid=true`、保存按钮 `disabled`；恢复 60/80 后保存，截获 PUT payload `quality_block_threshold:0.6, quality_warn_threshold:0.8`（`ratioOk=true`） |
| 设置页 a11y | 无 label 输入 0 个；6 个开关均有可访问名（启用支付/新用户注册/翻译质量阻塞/转录幻觉检测/下载失败自动重试/Watchdog 轮询）；死配置标注 4 处；axe（wcag2a/aa/21a/21aa/best-practice）**0 违规**（保存成功 toast 的对比度违规来自全局 sonner `richColors` 配色，不是页面内容，且不在本任务边界——复扫无 toast 时干净） |
| 统计页 500 | mock GET 500 → h1「数据统计」保留、`animate-pulse=0`、「无法加载统计数据 / 重试」；重试后 h1×1、h2×7、h3×0；axe **0 违规** |
| 统计页状态色 | KPI delta 计算色 `rgb(21,128,61)`（`--success-text #15803d`），不再用 `text-success` |
| 登录页 | 两个输入各 1 个 label；错误块 `role=alert`、`#admin-login-error`、色 `rgb(185,28,28)`（#b91c1c）；输入 `aria-invalid=true` + `aria-describedby`；眼睛按钮 `aria-label` 显示密码→隐藏密码、`aria-pressed` false→true；axe 0 违规 |
| 登录 `?next=` | `/admin/settings` → 落到 `/admin/settings`；`https://evil.example/steal`、`//evil.example/steal`、`/watch/abc` → 全部落到 `/admin` |
| 壳层 `/users/me` 5xx | mock 500（客户端重试后）→ URL 仍 `/admin`、`localStorage` token 仍在、`role=alert`、有重试；点重试后渲染 `main#admin-main` |
| 壳层 401/403 | mock `/users/me` 401/403（同时 mock refresh 401，避免真实 token 轮换）→ 跳 `/admin/login`（审计既有的过期会话行为不回退） |
| skip link | `/admin/settings` 首个 Tab → 「跳到内容」（`<a href="#admin-main">`）；Enter 后 `activeElement=admin-main`、`hash=#admin-main` |
| 横向溢出 | 1440：login/settings/stats/users 均 `scrollWidth-clientWidth=0`；390：login/settings/stats 均 0 |

**证据文件**

- 截图：`docs/evidence/admin-audit-2026-10-26/fixes/`
  - `fixes-users-lastrow-dropdown.png`（末行菜单）、`fixes-users-confirm-dialog.png`（确认弹窗焦点）
  - `fixes-settings-500-error.png`、`fixes-settings-threshold-invalid.png`、`fixes-settings-normal.png`
  - `fixes-stats-500-error.png`、`fixes-stats-normal.png`
  - `fixes-login-error.png`
  - `fixes-shell-users-me-500.png`
  - `fixes-1440-{login,settings,stats,users}.png`、`fixes-mobile-390-{login,settings,stats}.png`
  - （QualityReportPanel 无可展示数据，未产出该面板截图，见 §5）
- 机器读数（临时目录，不入库）：`.tmp-diag/frontend-audit/verify-shell-fixes.json`、`verify-shell-fixes-2.json`、`verify-shell-401.json`、`verify-1440.json`、`verify-a18.json`
- 复跑脚本（临时目录，未改 `package.json`）：`verify-shell-fixes.mjs`、`verify-shell-fixes-2.mjs`、`verify-shell-401.mjs`、`verify-1440.mjs`、`verify-a18.mjs`；运行方式：

```powershell
cd C:\Users\Administrator\Speaking\frontend
node ..\.tmp-diag\frontend-audit\verify-shell-fixes.mjs
node ..\.tmp-diag\frontend-audit\verify-shell-fixes-2.mjs
node ..\.tmp-diag\frontend-audit\verify-1440.mjs
```

## 5. 未做 / 延后（跨边界，如实记录）

| 项 | 原因 |
| --- | --- |
| A-18 的 dashboard/users/channels/videos 等页面 | 不在本线文件边界（并行 fixer + payments 线负责），本线只改了 settings/stats/login/QualityReportPanel/StatCard |
| A-25 分页计数、A-26 URL 状态、A-35 公告确认、A-36 自操作拦截、A-14 反馈 select | 属于 users/feedback/DataTable/Pagination 线 |
| A-16 移动抽屉 inert/焦点/锁滚动 | `AdminSidebar` 由 payments 线负责 |
| `AdminTable.tsx` 是否有隐藏动态引用 | 已 `rg AdminTable` 全仓（含 e2e/scripts）确认零消费者后才删；`tsc` 通过 |
| QualityReportPanel 运行时色值取证 | dev 库 20 个视频的 quality-reports 均为空（接口 200 无数据），面板渲染「暂无质量报告」；色值改为静态核对（`text-success-text`/`text-error-text`/`text-warning-text`），未伪造数据 |
| StatCard 运行时取证 | 全仓无 import（`rg StatCard` 仅自身与 Badge 注释），属潜在死代码但不在删除清单；仅做 A-18 色值修正，是否删除留给后续评审 |
| 新增单测 | 见 §3 边界说明 |

## 6. 风险与兼容性

1. **AdminDropdown 行为变化**：菜单从「表格内 absolute」改为「body portal + fixed」；打开时焦点进首项、滚动/缩放会关闭菜单、Tab 会关闭菜单并把焦点还给触发按钮。这是 A-12/A-22 的预期行为，但如果有页面依赖「菜单 DOM 在触发按钮旁边」做事件冒泡/样式，需要复核（全仓只有 users 页使用，实测正常）。
2. **阈值 UI 单位变化**：库里仍是 0–1；界面上 0.6 现在显示为 60。运维/测试若按旧 UI 记忆直接输入 0.6，会得到 0.6%（比例 0.006）——校验允许 0–100，所以不会报错。报告与描述文案已写明「60% = 0.6」，建议后续在 `AdminSettings` 注释或运营手册里补一句（不在本任务边界）。
3. **删除 `ui/AdminTable.tsx` 同时改了 `ui/index.ts`**：barrel 是唯一引用点，属删除死代码的必要连带改动；若评审认为 barrel 不应动，可回退为「保留 barrel 但删文件」——那会直接 `tsc` 失败，不建议。
4. **壳层 5xx 错误卡不渲染 sidebar/topbar**：角色仍未验证时避免暴露导航；如果后端 5xx 长时间持续，管理员会停在「无法验证管理员会话」页，需要点重试或自查后端，而不是被登出——这是 A-05 的取舍。
5. **测试环境噪声（非产品缺陷，如实记录）**：
   - A-05 的 401 回归脚本用真实 token 走了一次 `logout()`，把共享的 `.tmp-diag/.../token-cache.json` 里 access token 拉黑（测试工具产物）；随后删除缓存重新登录，不影响产品代码。
   - 登录真实错误尝试期间后端返回 429（并行脚本共享每 IP/分钟登录限额），A-17 的最终证据用 mock 401「手机号或密码错误」验证错误 UI（`role/aria-invalid/describedby/颜色` 与真实路径一致）；首个真实 429 场景同样走了 `role=alert` 路径。
6. **未验证**：屏幕阅读器实机（NVDA/VoiceOver）、暗色模式逐项复扫（A-18 只影响亮色档；本次 axe 均在亮色下跑）。

## 7. 改动文件清单

```
M  frontend/src/app/(admin)/admin/login/page.tsx
M  frontend/src/app/(admin)/admin/(shell)/layout.tsx
M  frontend/src/app/(admin)/admin/(shell)/settings/page.tsx
M  frontend/src/app/(admin)/admin/(shell)/stats/page.tsx
M  frontend/src/components/admin/ui/AdminDialog.tsx
M  frontend/src/components/admin/ui/AdminDropdown.tsx
M  frontend/src/components/admin/ui/index.ts        # 删除死代码的 re-export（唯一引用点）
D  frontend/src/components/admin/ui/AdminTable.tsx  # A-37
M  frontend/src/components/admin/QualityReportPanel.tsx
M  frontend/src/components/admin/StatCard.tsx
+  docs/admin-audit-2026-10-26/frontend-fixes-shell.md
+  docs/evidence/admin-audit-2026-10-26/fixes/*.png
```
