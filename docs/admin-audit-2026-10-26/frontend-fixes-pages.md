# 前端修复 B 报告：后台列表/详情页 UX + a11y（users / videos / channels / feedback）

- 任务：task-9「Frontend fixes B: admin list/detail pages UX + a11y」
- 分支/环境：`redesign` 工作树（未提交，未重启 dev server）；前端 `:3000`、后端 `:8000`（development）；管理员 `13900139000 / SeeWordAdmin!2026`
- 日期：2026-10-26（America/Denver）
- 边界：只改 task-9 授权的文件（见 §2）。**未触碰** `AdminSidebar` / `AdminTopbar` / 仪表盘（payments-builder）、`settings` / `stats` / `login` / 壳层 layout / `AdminDialog` / `AdminDropdown`（frontend-fixer-shell）、`lib/adminData` / `types`（payments-builder）、以及用户端 watch 等并发改动；唯一例外是 §3 说明的 `components/video/VideoStatus.tsx`（Lead 明确授权）。
- 另：`hooks/usePaginatedList.ts` 经评估**无需改动**（`total` / `error` / `reload` 已具备），保持原样。

## 1. 修复清单（19 条 finding）

| # | finding | 做法 | 关键改动 |
| --- | --- | --- | --- |
| 1 | **A-02** 视频搜索无防抖（7 击键 7 请求） | 视频页改用共享 `AdminSearchInput`（300ms 防抖 + 回车立即 + 清空） | `videos/VideoManager.tsx`；`AdminSearchInput` 增 `ariaLabel`、`type="search"`、Enter flush、清空按钮 `aria-label` |
| 2 | **A-04** 列表失败被渲染成「暂无数据」 | 视频/用户列表区分 **error / 真空 / 筛选后为空** 三态：错误态含错误信息 + 重试；筛选空态显示当前筛选条件 + 一键清除 | `VideoManager.tsx`、`users/page.tsx`、`DataTable` 新增 `emptyContent` |
| 3 | **A-07** 赠送 Pro 连点重复发放 | 行内动作统一在途闸门（`busyRef` 同步闸 + `busyAction` 状态），封禁/升降级/撤销 Pro/赠送 Pro 全部在途禁用；赠送按钮 `loading` + `aria-busy` | `users/page.tsx` |
| 4 | **A-08** 下线无确认 | 「下线」改为二次确认：文案说明「从公开列表隐藏、删除本地媒体、保留学习记录、可重新搬运」，确认中按钮 busy、防 backdrop 关闭；保留删除确认 | `VideoManager.tsx`、`VideoDetailRow.tsx` |
| 5 | **A-10** 反馈列表固定 50 条无分页 | 反馈列表接 `usePaginatedList`（每页 20）+ `Pagination`，显示「共 N 条 · 第 x/y 页」；保留状态筛选，筛选变更回第 1 页 | `feedback/page.tsx` |
| 6 | **A-14** 反馈状态 select 无名 | 每个 select `aria-label={`反馈 <id8> 的状态`}`；回复输入框补 `aria-label` | `feedback/page.tsx` |
| 7 | **A-15** 用户行展开不可键盘操作 | 首列渲染真实 `<button aria-expanded aria-controls>`（Enter/Space 均可切换，行点击仍可用）；展开区 id 供 `aria-controls`；「赠送天数」改 `<label htmlFor>` + input id | `users/page.tsx` |
| 8 | **A-18** 状态小字对比度不足 | users/channels/videos 页小字状态改用 `text-success-text` / `text-warning-text` / `text-error-text`（圆点/图标保留原色）；videos 的 `VideoStatusBadge` 详见 §3 | users/channels/VideoManager/VideoDetailRow/VideoStatus |
| 9 | **A-22** 用户表末行操作菜单被裁切 | users 表容器去掉 `overflow-hidden`（`Card padding={0}` + `overflow-x-auto md:overflow-x-visible`，窄屏仍可横滑、桌面不裁切）；配合 frontend-fixer-shell 的 portal 下拉，末行菜单完整可见可点 | `users/page.tsx` |
| 10 | **A-23** 视频详情 390 标题溢出 | h1 内容改 `block min-w-0 line-clamp-2 break-words`（原 `truncate` 在 inline span 上不生效）；`title` 保留全文 | `videos/[id]/page.tsx`（面包屑部分见 §6） |
| 11 | **A-24** 展开行 5 个复选框被压成逐字换行 | `flex gap-6` → `flex flex-wrap gap-x-6 gap-y-2`，标签 `whitespace-nowrap` | `VideoDetailRow.tsx` |
| 12 | **A-25** 分页不显示总条数 | `Pagination` 新增可选 `total` / `pageSize`，显示「共 N 条 · 第 x/y 页」（`nav aria-label="分页导航"` + `aria-live`），未传时退回「第 N 页」；users/videos/feedback 均传 | `Pagination.tsx` + 三页 |
| 13 | **A-33** 频道排序只能选 0–20 | 改 `type="number"` 输入（min 0 / max 9999），保留当前值（含 >20 的自动建档频道） | `channels/page.tsx` |
| 14 | **A-34** 频道列表无搜索 | 顶部 `AdminSearchInput`（名称 / slug / 上游频道 ID 客户端过滤），显示「共 N 个频道 · 匹配 M 个」，筛选空态含清除 | `channels/page.tsx` |
| 15 | **A-35** 公告一键群发无确认 | 发送前弹确认框：显示「将通知全部用户」+ 标题 + 内容预览（80 字截断），发送中 busy 禁用；成功 toast 按后端异步语义改为「已加入发送队列（约 N 位用户）」 | `feedback/page.tsx` |
| 16 | **A-36** 对自己也展示封禁/降级/撤销 Pro | 用 `adminAuthStore.user.sub` 判定本人行：三项菜单项 `disabled`，菜单容器 `title` 说明「不能对自己执行该操作」，本人行标注「（本人）」；后端守卫不变 | `users/page.tsx` |
| 17 | **A-38** 表头无 `scope`、展开行无 aria | `DataTable`、users、channels 全部 `<th scope="col">`；展开/编辑按钮 `aria-expanded` + `aria-controls`（detail 行 id：`row-detail-<id>` / `user-detail-<id>`） | `DataTable.tsx` + users/channels/VideoManager |
| 18 | **A-39** 视频页 30s 轮询噪音 | 轮询 30s→60s，且 `videos.length > 0` 时才轮询；标签页隐藏时 `useVisibilityAwareInterval` 自带暂停 | `VideoManager.tsx` |
| 19 | **A-40** 缩略图未声明尺寸 | 视频列表缩略图 `Image` 补 `sizes="80px"`（`Image` 默认 `loading="lazy"`） | `VideoManager.tsx` |

附带：A-12 在 users 页调用点补 `label={`${displayName} 的操作`}`（配合 frontend-fixer-shell 落盘的 `AdminDropdown.label`），20 个触发按钮全部有名。

## 2. 改动文件（10 个，809 insertions / 332 deletions）

| 文件 | 改动 |
| --- | --- |
| `frontend/src/app/(admin)/admin/(shell)/users/page.tsx` | A-04/A-07/A-15/A-18/A-22/A-25/A-36/A-38，错误/空/筛选空三态，防重闸门 |
| `frontend/src/app/(admin)/admin/(shell)/videos/VideoManager.tsx` | A-02/A-04/A-08/A-18/A-25/A-38/A-39/A-40，下线确认、错误态、轮询降频 |
| `frontend/src/app/(admin)/admin/(shell)/videos/VideoDetailRow.tsx` | A-08（交给父级确认）、A-18、A-24 |
| `frontend/src/app/(admin)/admin/(shell)/videos/[id]/page.tsx` | A-23（h1 溢出） |
| `frontend/src/app/(admin)/admin/(shell)/channels/page.tsx` | A-18/A-33/A-34/A-38（搜索、数字排序、scope） |
| `frontend/src/app/(admin)/admin/(shell)/feedback/page.tsx` | A-10/A-14/A-35（分页、select 名称、公告确认、异步入队文案） |
| `frontend/src/components/admin/DataTable.tsx` | `emptyContent` + `th scope="col"` + detail 行 id |
| `frontend/src/components/admin/Pagination.tsx` | 可选 `total`/`pageSize` + 「共 N 条 · 第 x/y 页」+ nav 语义 |
| `frontend/src/components/admin/ui/AdminSearchInput.tsx` | `ariaLabel`、`type="search"`、Enter 立即触发、清空按钮名称 |
| `frontend/src/components/video/VideoStatus.tsx` | A-18 videos 对比度（Lead 授权，见 §3） |

## 3. 跨边界改动说明（A-18 videos）

axe 实测 videos 页 6 处 `color-contrast` 的目标是 `VideoStatusBadge`（`.text-success.bg-success-soft`，3.12:1），配色定义实际在共享的 `frontend/src/lib/videoStatus.tsx`（`PROCESSING_STATUS_CONFIG`）。经 Lead 授权，只改 `frontend/src/components/video/VideoStatus.tsx`：

- 在该组件渲染时把 `text-success` / `text-warning` / `text-error` 映射为 `text-success-text` / `text-warning-text` / `text-error-text`（12px 文字档，AA 达标）；**不改** `lib/videoStatus.tsx`、不改布局/文案/行为。
- 影响面：admin 视频列表 + 用户端同款状态徽标文字颜色略深（可接受的对比度修复）；图标随 `currentColor` 同步变深。
- 复测：`axe videos @1440` 与 `@390` 均为 **0 violations**。

## 4. 文案变更

| 位置 | 前 | 后 |
| --- | --- | --- |
| 反馈页公告发送成功 toast | 「公告已发送给 N 位用户」 | 「已加入发送队列（约 N 位用户）」（按 Lead 补充：后端已改异步入队，`notified_count` 是入队人数） |
| 视频下线确认 | 直接执行 | 「下线视频」确认框：从所有公开列表隐藏并删除本地媒体文件；学习记录保留，之后可重新搬运 |
| 视频/用户/频道筛选空态 | 只显示「暂无视频/暂无用户」 | 明确展示当前筛选条件 + 「清除筛选/清除搜索」 |
| 反馈筛选空态 | 只显示「暂无反馈」 | 「当前筛选下没有反馈」+ 清除筛选 |

## 5. 验证（真实输出）

### 5.1 `npm run check` → exit 0

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
check-session-writes：… 规则 1/2 通过。
> tsc --noEmit            （无输出 = 通过）
> eslint src/ e2e/        （无输出 = 通过）
> prettier --check …      All matched files use Prettier code style!
```

- 未新增任何设计系统白名单/豁免；未改检查器。
- 白名单与改动前一致（9 条点名理由）。
- 注：工作区同时有用户端 watch 并发改动与其它队友改动，本次 check 是**整树**跑通（exit 0），不是只挑我的文件。

### 5.2 `npm run test:unit` → exit 0

```
 Test Files  31 passed (31)
      Tests  336 passed (336)
   Duration  775ms
```

### 5.3 Playwright 浏览器验证（chromium，dev :3000 + :8000，管理员会话）→ 27/27 通过

脚本：`.tmp-diag/frontend-audit/verify-pages-fixes.mjs`（复用审计目录 Playwright + axe-core，未新增 `package.json` 依赖）。
原始结果：`docs/evidence/admin-audit-2026-10-26/fixes-pages/verify-report.json` 与 `verify-run.log`。

| 验证项 | 实测结果 |
| --- | --- |
| A-02 防抖 | 逐字输入 `grammar`（7 击键，间隔 80ms）→ **1** 次 `GET /videos/admin`；输入框 `type="search"` |
| A-02 Enter | 键入后立即回车 → **200ms 内**发出 1 次请求（首请求延迟 **15–22ms**），未等 300ms 防抖 |
| A-04 视频错误态 | mock 500 → 显示「加载视频列表失败」+ 重试，**不再**显示「暂无视频」；点重试恢复列表 |
| A-04 视频筛选空 | 搜 `zzzz-no-video` → 「没有匹配的视频」+ 清除筛选；清除后恢复 20 行 |
| A-04 用户错误/筛选空 | mock 500 → 「加载用户列表失败」+ 重试；`zzzz-no-user` → 「没有匹配的用户」+ 清除后恢复 20 行 |
| A-07 连点赠送 Pro | 同一 tick 连点 2 次（`el.click(); el.click();`）+ 拦截 PATCH 延迟 700ms → **1** 个 PATCH；在途按钮 `aria-busy=true`、`disabled=true` |
| A-08 下线确认 | 点「下线」→ dialog「下线视频」含「删除本地媒体…学习记录保留」；取消 → **0** 个 takedown 请求；确认（拦截后端）→ **1** 个请求、dialog 关闭 |
| A-15 键盘展开 | 聚焦展开按钮按 Enter → `aria-expanded=true` 且 `#user-detail-…` 出现；按 Space → `aria-expanded=false` |
| A-22 末行菜单 | 第 20 行「…」菜单 rect `y=645..763`（视口 900）`insideViewport=true`、中心点命中菜单（`centerHitInside=true`）、`inTable=false`（已 portal 到 body） |
| A-25 分页 | 「共 615 条 · 第 1/31 页」 |
| A-36 自我保护 | 搜本人手机号 → 本人行菜单三项全部 `disabled`：封禁用户 / 降级为普通用户 / 撤销 Pro |
| A-38 scope | 用户页全部 `<th>` 均有 `scope="col"`（缺失 0） |
| A-33 频道排序 | 排序输入为 `type="number"`，值 = 当前行 sort_order（`0`） |
| A-34 频道搜索 | 24 行 → 搜 `zzzz-no-channel` → 「没有匹配的频道」；清除后恢复 24 行 |
| A-10/A-14 反馈 | 「共 17 条 · 第 1/1 页」；17 个状态 select **全部有** aria-label（未命名 0） |
| A-35 公告确认 | 点发送 → dialog 含「将通知全部用户」+ 标题/内容预览；取消 → 0 个 POST；确认（拦截后端）→ 1 个 POST、dialog 关闭 |
| A-23 390 视频详情 | 长标题 h1 `scrollWidth 358 = clientWidth 358`，页面横向溢出 **0px** |
| axe 扫描（WCAG 2.1 A/AA + best-practice） | users@1440/390、videos@1440/390、channels@1440、feedback@1440 → **全部 0 violations** |

- 控制台：6 条 500 全部来自本脚本**故意 mock** 的列表 500（GET 5xx 客户端重试 3 次：视频 3 + 用户 3）；`pageErrors=0`。无其它 4xx/5xx（`badResponses` 仅这 6 条 + 2 条历史 `/media/*_thumb.webp` 500；后者直连复测 **200**，是后端热重载窗口的瞬时现象，与本改动无关）。
- 真机数据未被修改：赠送 Pro / 下线 / 公告发送全部用 `page.route` 拦截并伪造响应，未写库、未群发。

### 5.4 截图（`docs/evidence/admin-audit-2026-10-26/fixes-pages/`）

`users-expanded-1440.png`、`users-error-1440.png`、`users-filtered-empty-1440.png`、`users-lastrow-dropdown-1440.png`、`videos-error-1440.png`、`videos-filtered-empty-1440.png`、`videos-takedown-confirm-1440.png`、`channels-filtered-empty-1440.png`、`feedback-pagination-1440.png`、`feedback-announce-confirm-1440.png`、`video-detail-390.png`。

### 5.5 未执行

- 全量 `npx playwright test`（四 project/39 spec）：本次验收是后台专项定向验证，且工作区同时有用户端 watch 并发改动 + 多个队友的 backend/frontend 在飞，全量结果不可归因；后台专项已按 task-9 要求用真实浏览器逐项取数。
- `npm run build`：dev 验收口径，未执行。

## 6. 延后 / 跨边界残留（不半实现）

| 项 | 状态 | 原因 / 说明 |
| --- | --- | --- |
| **A-19** 表格 390→卡片式重设计 | **未做（有意延后）** | 需要三张表（users/videos/channels）统一的信息架构与卡片版式，属于独立设计任务；本轮只保证「横向滚动不产生页面级溢出」（现状 0px）并把操作列留在可横滑范围内。若半做会与 DataTable/Pagination 演进冲突。 |
| **A-20** 视频详情字幕编辑器 390 屏蔽 | **未做（有意延后）** | 编辑器在 `components/video-edit/`（非本任务 owned 文件），需要产品确认「移动端只读 or 完全隐藏」；本轮只修了详情页 h1 溢出。 |
| **A-26** 列表分页/筛选/搜索落 URL | **未做（有意延后）** | 涉及三页 `useSearchParams` + `router.replace` 与 `usePaginatedList` 的初始化约定，属跨页架构改动；按要求不半实现。 |
| **A-23 面包屑 `min-w-0`** | **未改** | 面包屑在 `components/admin/AdminTopbar.tsx`（payments-builder 正在改），按边界未触碰；390 下该处仍可能与铃铛挤压，建议由 Topbar 负责人补 `min-w-0 + truncate`。 |
| **A-36 tooltip** | 已完成（native `title`） | `AdminDropdownItem` 没有 tooltip 字段（组件归 frontend-fixer-shell），用菜单项 `disabled` + 容器 `title` 表达原因，不新增组件 API。 |
| 视频列表「共 N 条」 | 已接 `Paginated.total` | 若后端某分支不返回 `total`，`Pagination` 自动退回「第 N 页」，不显示错误数字（后端 ADM-10 补 total 中）。 |

## 7. 结论

task-9 要求的 19 条 finding 全部落地并经真实浏览器逐项验证（27/27），`npm run check` 与 `npm run test:unit` 整树通过；未触碰任务边界外的文件（`VideoStatus.tsx` 为 Lead 明确授权）；A-19/A-20/A-26 按要求显式延期并说明理由，A-23 的面包屑部分因文件归属转交 Topbar 负责人。
