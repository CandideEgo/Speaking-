# SeeWord 前端功能 / 交互 / 可访问性审计（2026-10-24）

- 审计对象：本地 dev 站点 `http://localhost:3000`（Next.js 16 App Router，分支 `redesign`），后端 `http://127.0.0.1:8000`（development，短信固定码 `1234`）。
- 设计参考：`C:\Users\Administrator\Downloads\design（seeword）\重新设计各个导航页内容以及产品功能\`。该导出是通用 OpenDesign handoff（`DESIGN-HANDOFF.md` 只给视觉/响应式契约，无逐页交互规格），因此**交互预期以当前代码与既有 e2e 契约为准**，设计导出只用于核对响应式矩阵与页面覆盖。
- 只读审计：未修改源码、未提交、未部署、未访问生产、未执行真实支付与真实短信。临时账号与通知数据只写入本地 dev 库。
- 报告：`docs/audit-2026-10-24/frontend-functional.md`；原始读数与脚本在同目录 `_*.json` / `*.mjs`；截图在 `docs/evidence/audit-2026-10-24/`。

## 0. 环境与方法

### 0.1 环境

| 项 | 值 / 说明 |
|---|---|
| OS / 浏览器 | Windows，Playwright Chromium（headless），桌面 1440×900，手机 390×844（`isMobile` + `hasTouch`） |
| 前端 | `next dev`，`localhost:3000`；dev 代理把 `/api`、`/media` 转到 `:8000` |
| 后端 | `uvicorn` dev，`/health` 正常（DB/Redis ok） |
| 临时账号 | 手机号 `139****4301`（`_session.json`），通过 dev 短信码登录，已设密码并完成 onboarding |
| 播种 | 本地 dev 库：收藏 1 个视频、订阅 2 个频道、插入 3 条通知（2 未读 / 1 已读）。只影响临时账号 |
| 设计导出 | 已核对 `index.html` / `styles.css` / `DESIGN-MANIFEST.json` / `DESIGN-HANDOFF.md`；响应式矩阵采用其 9 档视口 |

**环境事件（重要，影响复现）**：审计开始时 `next dev` 已运行约 4 小时，进程 stdout 管道断开（`Error: write EPIPE`），`/channels/{slug}`、`/watch/{id}`、`/watch/{id}/transcript` 稳定返回 500，错误体为 `Jest worker encountered 2 child process exceptions, exceeding retry limit`。这属于 **dev server 降级，不是产品代码缺陷**。为区分二者，我重启了前端 dev（未动后端/数据库），重启后全部路由 200、首屏 TTFB 约 60ms。重启前的那批读数（全部路由卡骨架/500）已作废，不计入发现。日志：`docs/audit-2026-10-24/_next-dev.log`。

**限流说明**：后端 `/users/me`、`/vocabulary/stats` 为 30/min（按用户）。巡检与交互脚本曾因连打出现 429；发现此点后所有全路由巡检加 5.5s 间隔，并改用独立临时账号跑鉴权用例。**429 造成的空白/骨架不计为产品缺陷**，仅在“稳定性”一节说明。

**协作者改动说明（重要）**：审计期间同一工作区有其他协作者在改源码（`git status` 从干净变为 51 项改动，HEAD `a082f6a`），涉及顶栏断点（768→1025）、移动底栏样式、搜索空态文案、首页/watch 组件与后端 search/exam/config 等。为不把“改动前状态”当成现状：F1/F2/F3/F6 与壳层断点、词卡在 2026-10-24T11:55Z 用当前运行站点重跑（`_recheck.json`）；F5 对比度在 12:00Z 重跑（`_contrast-recheck.json`，原数值不变、首页眉标新增一项）；F4（set-password 页）、F7（ChannelCard）、F11（channels 搜索）相关文件不在本次改动清单，沿用首次读数。其中 820 档个人页 tab 被裁的问题已被这次改动修掉，故从发现表移除。报告中的数值以最后一次复验为准；早期截图（19:20–19:40）可能对应改动前状态，引用时以同名 JSON 的时间戳为准。**本报告的定位是“该时间段内 dev 站点快照”，不是对 HEAD 的静态代码审计。**

### 0.2 方法

| 脚本 | 覆盖 |
|---|---|
| `sweep.mjs` | 25 条登录态路由桌面 + 12 条移动端；记录 HTTP 状态、最终 URL、h1/标题层级、横向溢出、a11y 快照、console/pageerror/失败请求、截图 |
| `sweep.mjs --phase=anon` | 9 条公开页 + 10 条受保护路由的登录墙（`/login?next=`） |
| `interactions.mjs` | 导航高亮、搜索弹窗、频道筛选、搜索页 tab、词卡、收藏/点赞乐观更新与回滚、通知已读、个人页 tab、会员入口、深色模式、404、移动底栏/贴顶 |
| `retest.mjs` / `retest2.mjs` / `misc.mjs` | 修正选择器后的补测：返回来源、tab 语义、收藏回滚时序、通知浮层、文稿跳转、频道订阅 |
| `auth.mjs` / `auth2.mjs` / `auth3.mjs` | 登录（验证码/密码）、注册、找回密码、设置密码、onboarding、退出清理、open redirect |
| `filters.mjs` | 首页筛选/排序、慢请求骨架、错误态+重试、空筛选、通知下拉、句子收藏 |
| `responsive.mjs` | 5 个关键页 × 9 档视口（360/390/430/600/820/1024/1366/1440/1920）的横向溢出与越界元素 |

证据文件均可用 `node docs/audit-2026-10-24/<script>.mjs` 复跑（需先 `_refresh.mjs` 换一张 30 分钟有效的 token）。

## 1. 发现表

> 严重度口径：P0 = 不可用/数据或安全问题；P1 = 主功能明显失效且无替代路径；P2 = 明确功能或无障碍缺陷、有绕行；P3 = 一致性/打磨/环境观察。

| 编号 | 严重度 | 页面 | 复现步骤 | 现象 / 证据 | 预期 | 修复建议 |
|---|---|---|---|---|---|---|
| F1 | P2 | 全站顶栏 · 通知铃铛 | 登录 → 任意页点铃铛 → 等 3s | 请求 `GET /api/v1/notifications?page=1&page_size=20` 返回 200，但浮层里 `ul li` 为 0、`animate-spin` 为 1，永远转圈；截图 `docs/evidence/audit-2026-10-24/notif-dropdown-stuck.png`；读数 `_misc.json` → `notification-dropdown-list`（items=0）。根因：`NotificationDropdown` 用 `hasFetchedRef` 防重入，StrictMode 双挂载时第二次跳过拉取，第一次的 `setIsLoading(false)` 又被 `cancelled` 吞掉 | 显示最近 3 条通知或“暂无通知”空态 | 去掉 `hasFetchedRef` 守卫（或把 `setNotifications`/`setIsLoading` 都放进 effect 的同一生命周期），用 AbortController 代替 `cancelled` 布尔值；在 `finally` 里无条件落 `isLoading=false`。dev 必现、生产构建（StrictMode 关闭）预计不复现，但代码对 StrictMode 不安全 |
| F2 | P2 | /、/channels、/notifications、/history、/vocabulary/sets | 打开任一页 → 用键盘/SR 读筛选按钮 | `TabPills` 渲染的是裸 `<button>`：`role`、`aria-selected`、`aria-pressed` 全为 null，只有背景色变化。读数 `_retest.json` → `tabpills-semantics`（5 个按钮 `ariaSelected:null, ariaPressed:null, role:null`）；源码 `components/ui/TabPills.tsx` 无任何 ARIA | 筛选/分类 tab 向 AT 暴露选中态（`role=tablist/tab` + `aria-selected`，或筛选 chips 用 `aria-pressed`） | 在 `TabPills` 内加 `role="tablist"`/`role="tab"`（或 `aria-pressed`）+ `aria-selected`，并补左右方向键。通知页的“全部已读”是独立按钮，不属于筛选 tab，选择器排查时注意区分 |
| F3 | P2 | 全站壳层（桌面） | 进入首页 → 连按 Tab | “跳到正文”链接在 88 个可聚焦元素中排第 **17**（index 16）：第一下 Tab 落在侧栏 Logo `SSeeWord`，要穿过侧栏 15 个停靠点才到跳转链接。读数 `_skip2.cjs`（skipIndex=16/88）；直接聚焦该链接后 Enter 能到 `main#main-scroll`（hash 正确、焦点到 MAIN），说明链接本身有效，是 DOM 位置错了 | 跳转链接应是页面第一个可聚焦元素，键盘用户一进页就能跳过导航 | 把 skip link 移到壳层根节点最前面（`<Sidebar>` 之前）；mobile 下也同样处理 |
| F4 | P2 | /set-password | 已设置过密码的账号登录 → 打开 `/set-password` → 填新密码两次 → 保存 | `POST /api/v1/auth/change-password` 返回 400，页面只显示通用文案“操作未完成，请稍后重试”，无当前密码输入、无下一步指引。读数 `_auth.json` → `set-password`（`body` 含该文案、`alerts` 同文案、控制台 400） | 已有密码的账号应被识别并引导去“我的 → 账号与安全”修改密码（或本页补“当前密码”字段），错误信息可操作 | 前端进入该页时先读用户是否有密码（或后端在 400 detail 里返回明确 `code`），有密码则显示说明+跳转链接；无密码才走首次设置 |
| F5 | P2 | 全站（重点 /、/rankings、/channels/{slug}、/watch） | 打开页面读计算样式 | AA 不达标：侧栏“资料库” 11px `#86868b` on `#fff` = **3.62:1**（每个桌面页都有）；首页眉标“发现 · 10 月 24 日”改为 11px 小字后同样 **3.62:1**；/rankings 元信息 12px `#6e6e73` on `#ececef` = **4.30:1**；/channels/{slug} 与观看页字幕中文 12–13px on `#e8f2fd` = **4.48:1**。读数 `_sweep-desktop.json` / `_sweep-mobile.json`，并在协作者改动后由 `_contrast-recheck.json` 复验（数值不变、首页眉标为新增项）；方法为逐层合成背景的近似计算，已排除压在图片/视频上的文字与 `oklab` 背景的误报 | 正常文本 ≥ 4.5:1 | 调深 `text-muted` / `text-muted-soft`（或提亮 `surface-soft`/`brand-50` 背景）；“资料库”、首页日期眉标这类 11px 小字尤其需要 ≥4.5:1 |
| F6 | P2 | 移动端全站 | 390×844 打开 /、/history、/notifications、/vocabulary、/channels | 关键触控目标 <44px：顶栏搜索/通知 **40×40**、Logo **103×28**（高度只有 28）；筛选 tab 高 **32px**；通知“标为已读”**64×18**、“查看详情”**65×18**；收藏页“取消收藏”**68×20**；观看页“跟随”checkbox **14×14**（可点区域还包含 label 文本，但输入本身远小于 44，未量到 label 达到 44 的证据）。读数 `_sweep-mobile.json` → `smallTargets`；`_touch.js` 汇总；壳层改动后的 `_recheck.json` 复核 Logo=103×28、搜索/通知=40×40 | 用户验收口径 ≥44×44（WCAG 2.5.5 AAA；AA 2.5.8 至少 24×24 + 间距） | 顶栏图标按钮 `min-h-11 min-w-11`；chips 提高到 44 或增大垂直间距；行内动作改成带 padding 的按钮；`SwitchRow` 的 label 整体给 44px 高 |
| F7 | P3 | /channels | 拦截 `**/api/v1/discovery/subscriptions/**` 延迟 1.5s → 点“订阅” | 按钮在 1.5s 内保持“订阅”（只有 disabled），响应后才变“已订阅”；失败只 toast、无状态变化。读数 `_misc.json` → `channel-subscribe-optimistic`（before/optimistic 都是“订阅”，settled 才是“已订阅”） | 与收藏/点赞一致：点击立即切换文案并在失败时回滚 | 参照 `useVideoMeta` 的 in-flight ref + 乐观值 + 失败回滚；`onSubscriptionChange` 与全局事件在回滚时也要同步。**✅ 已修（2026-10-25）**：`ChannelCard` 点击即切换文案/计数并广播事件，失败回滚，响应值异常时再对齐 |
| F8 | P3 | 顶栏通知浮层 | 点铃铛 → 检查 DOM | 浮层是无 `role`、无 `aria-label` 的普通 `div`；铃铛按钮也没有 `aria-expanded` / `aria-controls`。读数 `_retest2.json` → `notification-popover`（`role:null, ariaLabel:null, expandedBefore/After:null`） | 浮层有 dialog/popover 语义与可访问名，触发器反映展开态 | `role="dialog"` + `aria-label="通知"`，铃铛加 `aria-expanded`/`aria-controls`；打开时把焦点移入浮层（目前只有 click-away/Esc 关闭） |
| F9 | P3 | /definitely-not-a-page（404） | 访问任意不存在路径 | `main h1` 的文本是 **“404”**，正文第二行才是“页面不存在”。读数 `_sweep-desktop.json` → `/definitely-not-a-page`（`h1s:["404"]`）；截图 `desktop-definitely-not-a-page.png` | h1 应是页面主题“页面不存在”，404 作为辅助数字 | 把 h1 改为“页面不存在”，数字 404 放到 eyebrow/装饰层 |
| F10 | P3 | /history、/rankings | 打开页面读标题序列 | 标题从 h1 直接跳到 h3（`h1→h3: 今天 · 1 段…`、`h1→h3: <视频标题>`）。读数 `_sweep-desktop.json` → `headingJumps` | 标题层级不跳级 | 分节标题用 h2，卡片标题用 h3；或把现有 h3 降为带样式的 p |
| F11 | P3 | /channels | 在频道搜索框输入 “rachel” | 结果被筛到 1 个频道，但页面没有可见的“清空搜索”按钮（该按钮只在空态分支出现）；只能依赖浏览器 `type=search` 的原生 X（无 aria-label）。读数 `_interactions.json` → `channels-filter`（`clearButton:false`）；截图 `channels-filter-rachel.png` | 有筛选条件时提供明确、可访问的“清空搜索” | 输入非空时渲染带 `aria-label="清空搜索"` 的按钮，点击同时清空 query 与方向筛选 |
| F12 | P3（环境） | 媒体/接口 | 两个浏览器会话并发访问首页/列表 | 并发时出现瞬时 500：6 个 `/media/*_thumb.*`、`/api/v1/users/me`、`/api/v1/vocabulary/stats`；单独复测同一 URL 全部 200（40 次缩略图连打也全 200）。读数 `_sweep-desktop.json` 的 `badResponses`；`_next-dev.log`。另：重启前 dev server 自身 `Jest worker ... exceeding retry limit` 造成 3 条路由 500 | 正常负载下不出现 5xx | 非产品逻辑缺陷，按环境噪声记录；若要排除，需用 testing 形态后端或生产构建复验。不要据此改业务代码 |

### 1.1 已确认正常、但容易被误报的点

- **横向溢出**：所有页面 `documentElement.scrollWidth - clientWidth = 0`；巡检中的“越界元素”都是 `overflow-x-auto` 的分类/筛选横向轨道（首页分类、频道方向、通知筛选），属于设计内的可横滑区域，不是页面级溢出。
- **登录墙**：未登录访问 10 条受保护路由，全部重定向到 `/login?next=<原路径含 query>`；`next` 正确编码，登录后回到原页。公开页 `/login`、`/register`、`/forgot-password`、`/terms`、`/privacy`、`/contact` 未登录可访问；`/set-password`、`/onboarding` 不在公开名单，未登录会被带回登录页并带上 `next`。
- **收藏 / 点赞**：收藏在 1.6s 延迟下点击立即 `aria-pressed=true`、文案变“取消收藏”；DELETE 中断后 300ms 内显示未收藏，1.2s 后回滚为已收藏并 toast“操作失败，请重试”。点赞 0→1 立即更新。读数 `_interactions.json`、`_retest.json`。
- **重复提交**：验证码登录在正确码下连按两次回车只发出 1 次 `/auth/sms/login`（`_auth.json` login-sms-flow）；登录按钮在途会禁用。
- **open redirect**：`/login?next=https://evil.example.com` 登录后落到站内 `/`，未跳外站（`_auth.json` password-login）。
- **退出登录**：UI 登录后退出，localStorage 的 `seeword_token` 为 null、cookie jar 中 `seeword_token` 计数 0，再访问 `/favorites` 得到 `/login?next=%2Ffavorites`（`_auth3.json`）。
- **深色模式**：切换后 `html.dark`、`localStorage.theme=dark`，刷新后保持；`--color-canvas=#0a0a0a`、`--color-ink=#fafafa`。4 个页面截图人工检查无不可读区域：`dark-home.png`、`dark-watch_*.png`、`dark-vocabulary.png`、`dark-profile.png`。
- **`/pricing`、`/checkout`、`/redeem`、`/weekly-report`**：分别重定向到 `/upgrade`、`/`、`/`、`/profile?tab=progress&retired=weekly-report`。前三者是代码注释里写明“内测期退役”的兼容壳，不是死链（`(main)/checkout/page.tsx` 与 `redeem/page.tsx` 都是 `redirect("/")`）。
- **设计导出**：`DESIGN-HANDOFF.md` 未提供逐页交互规格，因此未用它做“设计稿应该怎样”的判断；仅用它的 9 档视口做响应式验收。

## 2. 按页面通过项

| 页面 | 已验证通过 |
|---|---|
| `/` 发现 | h1 唯一；侧栏“发现”高亮（`aria-current=page`）；分类 chip（新闻）、难度 B2、时长筛选都改 URL 并重拉列表；“新闻+B2”后计数文案为“9 个视频”；排序选项在筛选时正确隐藏“推荐”；慢请求显示 8 个骨架；中断 `recommendations/home` 4s 后出现“网络连接失败，请检查网络或稍后重试”+“重试”，点重试恢复 22 张卡；`?category=news&level=C2&duration=long` 显示“没有同时满足这些条件的视频”+“清除筛选”；深色模式正常 |
| `/channels` | h1；搜索 “rachel” 从 73 个链接筛到 7 个（计数“显示 1 / 23”）；订阅按钮可点；方向筛选行可横滑 |
| `/channels/cnbc` | h1、元信息、视频列表渲染；无 console 错误 |
| `/watch/{id}` | 词卡：点词打开 `role=dialog`，`aria-label="… 词卡"`，Esc/关闭按钮都能关；实词 “actually” 1s 内出音标/释义/用法；收藏与点赞乐观更新+回滚；句子收藏“收藏这句↔已收藏这句”往返；`?from=search&q=english` 的“返回搜索”回到 `/search?q=english`；`?from=transcript&sub=…` 类链接可从文稿回跳 |
| `/watch/{id}/transcript` | h1；1323 条带 `sub=` 的句子链接；首条点击后跳到 `/watch/{id}?from=transcript&sub=…` |
| `/practice`、`/practice/exams`、`/practice/listening`、`/practice/daily` | h1；空态/“上次练习”真实数据（无假 0 卡）；考试卡片数量与真实题库一致（63 套，按四级/年份/状态筛选）；点首套“开始”进入 `/practice/exams/{id}`，`exam-workspace` 渲染、150 个选项（30 题）；听力页点“开始听写”进入 `/practice/listening/{id}`，h1“逐句听写”且 `<audio>` 存在；无 console 错误 |
| `/vocabulary`、`review`、`drill`、`sets` | h1；空态文案真实（“还没有任何词单”“还没有到期词”）；新建词单表单/按钮存在（未提交，避免写库） |
| `/search?q=english` | h1；分组导航 `aria-current=page`，点“视频”改 `group=videos` 并重拉；空结果 `?q=zzzzzzzzzz` 显示“没有找到…”，并给“去浏览视频/按频道找”出口 |
| `/favorites` | h1；视频/句子/词三组计数与真实数据一致（1/0/0）；空句子态有说明与 CTA；取消收藏可用 |
| `/history` | h1；空态/统计文案真实（除标题跳级 F10） |
| `/notifications` | h1；3 条真实通知；点“标为已读”未读 2→1，顶栏铃铛 `aria-label` 同步为“通知，1 条未读”；“全部已读”后未读 0、按钮禁用；类型筛选切换列表；通知设置预览读取真实偏好 |
| `/profile` | h1 随 tab 变；5 个 tab 都有 `role=tab` + `aria-selected`，URL `?tab=` 与面板同步；方向键从左到右切换并把焦点送到下一个 tab；内容/资料/进度/账号/设置均渲染 |
| `/upgrade` | h1；三档价格真实（19.90/49.90/199.90）；桌面显示二维码（data URL）、“复制支付链接”可用、提供“刷新会员状态”；未点任何支付入口 |
| `/rankings` | h1、榜单行、缩略图、元信息渲染（除对比度 F5 与标题跳级 F10） |
| `/login`、`/register`、`/forgot-password`、`/set-password`、`/onboarding` | 见第 3 节表单与鉴权 |
| `/terms`、`/privacy`、`/contact` | 未登录可访问，h1 与正文渲染 |
| 404 | 渲染 `main h1` + “页面不存在” + “回首页挑一段”，点回首页成功（h1 语义见 F9） |

## 3. 表单与鉴权结果

| 用例 | 结果 | 证据 |
|---|---|---|
| 登录空提交 | 两个字段级 `role=alert`：“请输入正确的手机号”“请输入完整的验证码”；不发 `/auth/*` 请求 | `_auth.json` login-empty-validation |
| 验证码错误 | 保持 `/login`，`#login-error` 显示“验证码错误或已失效” | `_auth.json` login-sms-flow |
| 验证码正确 | 跳到 `?next=/favorites`；localStorage + cookie 都写入 | 同上 |
| 连按两次回车 | 仅 1 次 `/auth/sms/login` | 同上 |
| 密码错误 / 正确 | “手机号或密码错误” / 登录成功且不跳外站 | `_auth.json` password-login |
| 注册 | 未勾协议时提交按钮 disabled；填手机号+验证码+勾选后可提交；成功后进入 `/set-password?from=register&next=%2Fonboarding`（可跳过设密码，再进 onboarding） | `_auth.json` register-and-onboarding（失败点只是脚本等 `/onboarding`，实际 URL 已记录） |
| onboarding 门 | 未完成引导访问 `/` 会被送回 `/onboarding`；h1“第一次进入：三步设好学习起点”；“跳过设置”弹出“跳过会关闭考试词高亮”，点“仍然跳过”后回 `/`，后端 `onboarding_completed=true`，刷新仍在 `/` | `_auth2.json`、`_auth3.json` onboarding-gate / onboarding-skip-confirm |
| 首次设置密码 | 无密码账号在 `/set-password` 填两次新密码 → 保存成功，按 `next` 进入 onboarding | `_auth2.json` set-password-first-time |
| 已设密码账号再访问设置密码 | **失败**：400 + “操作未完成，请稍后重试”（F4） | `_auth.json` set-password |
| 找回密码 | 手机号 → 验证码 → 新密码三步；弱密码提示“至少 8 位…”，两次不一致提示“两次输入的密码不一致…”；强密码提交后显示“重置成功”，新密码可登录 | `_auth.json` forgot-password / login-with-reset-password |
| 退出登录 | localStorage 与 cookie 双清，cookie jar 0 条，受保护页回登录墙 | `_auth3.json` logout-ui-login |
| 密码登录页 tab | `role=tablist`、`aria-selected`、左右方向键切换；切到密码模式后焦点进入面板首个输入框 | 源码 + `_auth.json` password-login（切换后可输入） |

## 4. 横向溢出矩阵

`responsive.mjs`：每页加载一次，按 9 档视口 resize 后量 `documentElement.scrollWidth - clientWidth`。**全部为 0**。

| 页面 | 360 | 390 | 430 | 600 | 820 | 1024 | 1366 | 1440 | 1920 |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/channels` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/watch/{id}` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/vocabulary` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/profile` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

附注：

- 越界元素（`offenderCount`）只在横向滚动轨道内出现：首页分类 chips（360–600）、频道方向 chips（820）。页面本身无横向滚动条。
- 移动底栏：390 下高 61px、贴底（bottom=844），5 个入口都有 `aria-current`；壳层断点在并发改动后从 768 调到 **1025**——820/1024 仍显示移动底栏（高 61、贴底），1025 起隐藏并显示侧栏（宽 248）；360/430 同样贴底。读数 `_recheck.json`。
- 同一批改动修掉了审计中期在 820 档看到的个人页第 5 个 tab 被裁问题：复验时 5 个 tab 的最后一个右边界 594 < 820，已不可复现，因此不作为发现保留。
- 观看页移动端：滚动到 `scrollTop=551`（到底）后画框 `top=56`，即贴在壳顶栏下沿；画框高 201；播放控制条在常规流内（top=488, bottom=590），与底栏（top=783）不重叠；词卡底边 783，正好在底栏上沿，无遮挡。截图 `retest-mobile-watch.png`、`ix-mobile-watch-sticky.png`、`ix-mobile-wordcard.png`。
- 安全区（`env(safe-area-inset-bottom)`）无法在桌面 Chromium 真实模拟，**未执行真机刘海/Home indicator 验证**。

## 5. 控制台 / 网络错误清单

| 场景 | 请求 / 消息 | 状态 | 结论 |
|---|---|---|---|
| 重启前 dev server 降级 | `/channels/cnbc`、`/watch/{id}`、`/watch/{id}/transcript` | 500（body: `Jest worker encountered 2 child process exceptions`） | 环境故障；重启后 200，不计入产品缺陷 |
| 404 页 | `GET /definitely-not-a-page` | 404 | 预期；页面有“页面不存在”与回首页出口（h1 见 F9） |
| 并发两个浏览器会话 | 6 个 `/media/*_thumb.*` + `/users/me` + `/vocabulary/stats` | 500 | 瞬时；单独复测全 200（缩略图 40 连打全 200）。按环境噪声记录（F12） |
| 登录鉴权用例 | `/auth/sms/send-code` | 429 | 测试连打触发 IP 限流；前端显示错误，不计缺陷 |
| 频道订阅回滚用例 | `DELETE /discovery/subscriptions/rachel-s-english` | `net::ERR_FAILED` | 脚本主动 abort，用于验证失败路径；toast“网络连接失败，请检查网络或稍后重试” |
| 首页错误态用例 | `/recommendations/home` ×3 | `net::ERR_FAILED` | 脚本主动 abort；4s 后出现错误态+重试，点重试恢复 22 张卡 |
| 网络正常时 | 25 条桌面路由 + 12 条移动路由 | 全部 200 | 无未捕获异常；console 仅 Next 的 LCP `<Image>` 警告与 image 404 预期项 |
| 深色模式 | 4 页 | 200 | 无 console 错误 |

未捕获异常（`pageerror`）：重启后的巡检为 **0**。

## 6. 可访问性清单

| 检查 | 结果 |
|---|---|
| `html lang` | `zh-CN` |
| landmark | 每页 1 个 `main`；`header`/`nav`/`footer` 存在；`main` 有 `tabindex=-1` 供 skip link 落焦 |
| h1 | 除 404 页外均为 1 个可见 h1（404 页 h1 文本为“404”，F9） |
| 标题层级 | `/history`、`/rankings` 存在 h1→h3 跳级（F10） |
| 图片 alt | 所有可见 `<img>` 都有 `alt` 属性；无缺失 alt 的图 |
| 表单标签 | 登录/注册/找回/设置密码/筛选/搜索的输入都有 `<label for>` 或 `aria-label`；`inputsWithoutLabel=0`；OTP 每格有“验证码第 N 位” |
| 可访问名 | 可见交互元素无空名（`unnamed=0`）；仅通知浮层容器缺角色（F8） |
| 键盘 | 跳转链接可直接聚焦并 Enter 到 `main#main-scroll`；但它是第 17 个可聚焦元素（F3）。焦点可见：首链接 3px 蓝色 outline、侧栏链接 3px outline。搜索弹窗焦点陷阱（Tab 8 次未逃出）、Esc 关闭、关闭后焦点回触发按钮；词卡 Esc/关闭按钮均可关；个人页 tab 支持方向键 |
| 对话框 | 全局搜索用原生 `<dialog>` + `aria-label="全局搜索"`；词卡 `role=dialog` + `aria-label="{word} 词卡"`；通用 Modal 有 `role=dialog`/`aria-modal`/焦点陷阱/Esc；通知浮层缺角色（F8） |
| aria-current | 侧栏与移动底栏的当前项都有 `aria-current=page`；搜索分组导航也有 |
| 触控目标 | 顶栏 40×40、Logo 28×28、chips 32px 高、通知/收藏行内操作 18–20px 高、词卡“跟随”14×14（F6） |
| 对比度 | 3.62:1（资料库）、4.30:1（榜单元信息）、4.48:1（频道/字幕元信息）（F5）；深色模式截图人工检查无不可读 |
| 重复 id | 巡检未发现重复 id |
| 空名链接 | 无 |

## 7. 稳定性与状态完整性

- **骨架**：首页慢请求（2.5s）显示 8 个 `animate-pulse` 卡片骨架；`ShellSkeleton` 在鉴权初始化时出现；channels/rankings 有同构骨架；搜索 `aria-busy=true` + “正在搜索”。
- **错误 + 重试**：首页 feed 网络失败 4s 后显示错误文案与“重试”，点击恢复；频道页/通知页代码也有 `ErrorState`。
- **空态**：通知、收藏句子、词单、搜索无结果、练习记录都有“说明 + 下一步 CTA”，没有用 0 假数据冒充内容。
- **未登录/401**：登录墙按 cookie 拦截；access token 过期时（审计中途实测）受保护页会跳 `/login`；退出会清 localStorage + cookie。
- **刷新恢复**：深色模式刷新保持；onboarding 未完成刷新仍回引导；登录后刷新保持会话（cookie + localStorage）。
- **跨页同步**：通知已读后顶栏铃铛 aria-label 从“通知，2 条未读”变“通知，1 条未读”；订阅变更通过自定义事件同步频道卡（代码层），本次只测了单卡。
- **已知不稳定**：F1 的通知浮层在 dev 下永远 loading；F12 并发瞬时 500 属于环境噪声。

## 8. 未执行项（及原因）

| 项 | 原因 |
|---|---|
| 真实短信发送、真实手机号注册 | 明确禁止；只用 dev 固定码 `1234` |
| 站外支付/购买闭环 | 明确禁止；只验证到二维码/复制链接/价格，不点“去支付” |
| 屏幕阅读器（NVDA/VoiceOver）实测 | 环境无 AT；用 DOM/ARIA 与可访问名启发式代替 |
| iOS 真机安全区/刘海、Safari 手势 | 桌面 Chromium 无法模拟 `env(safe-area-inset-*)` 与 iOS 地址栏收缩 |
| `/practice/exams/{id}` 实际作答与交卷、`/practice/exams/redo`、`result/{id}`、`/practice/listening/{id}` 的听写提交、`/vocabulary/sets/{id}` 与 `/sieve` 过筛 | 时间/数据限制；已验证进入页/工作区/音频加载，但未作答、未提交（避免写库） |
| onboarding 三步完整提交（非跳过） | 只走“跳过设置→仍然跳过”；完整表单提交需要选择兴趣/目标/时长并写偏好，未执行 |
| 深色模式全站逐元素对比度 | 只做 4 页截图+变量检查；`oklab()` 背景使自动对比度计算不可靠，未给出全站数字 |
| 生产构建 / nginx / 生产响应头 | 明确禁止部署；生产与 dev 的 proxy/缓存行为不同 |
| 并发压力/性能 | 只观察到并发下的瞬时 500，未做正式压测 |

## 9. 优先修复建议（按投入产出）

1. **F1 通知浮层**：影响每个登录用户的首屏通知入口，改动小（effect 生命周期），建议最先修。
2. **F4 设置密码 400**：会让“已有密码”的用户卡在无解错误上，补明确引导即可。
3. **F3 skip link + F2 TabPills + F6 触控目标**：一次壳层/组件改造能覆盖大量页面，属于系统性无障碍债。
4. **F5 对比度**：调 token 即可，但会影响全站观感，建议与设计一起定值。
5. **F7/F8/F9/F10/F11**：打磨项，可随下个迭代清掉。

---

### 附：关键证据索引

- 巡检原始读数：`_sweep-desktop.json`、`_sweep-mobile.json`、`_sweep-anon.json`
- 交互：`_interactions.json`、`_retest.json`、`_retest2.json`、`_misc.json`、`_filters.json`
- 鉴权：`_auth.json`、`_auth2.json`、`_auth3.json`
- 响应式：`_responsive.json`
- 当前态复验（协作者改动后）：`_recheck.json`（skip link、通知浮层、TabPills、820/1024/1025 壳层、触控目标、词卡）、`_contrast-recheck.json`（对比度）
- 快照：HEAD `a082f6a`；审计结束时 `git status --porcelain` 51 项（23 个 tracked 修改 + 未跟踪的 docs/证据目录）；这些改动不是本审计产生的
- 截图：`docs/evidence/audit-2026-10-24/`（`desktop-*`、`mobile-*`、`rwd-*`、`dark-*`、`notif-dropdown-stuck.png`、`retest-mobile-watch.png`、`ix-mobile-wordcard.png`）
- dev server 日志：`_next-dev.log`（含重启前 `Jest worker` / `EPIPE` 与重启后 200 记录）
