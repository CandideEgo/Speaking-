# SeeWord 用户端视觉还原审计（2026-10-24）

审计对象：本地 dev 站点 `http://localhost:3000`（分支 `redesign`，Next.js 16 App Router）
视觉契约：`C:\Users\Administrator\Downloads\design（seeword）\重新设计各个导航页内容以及产品功能\`
（`index.html` / `styles.css` / `app.js` / `DESIGN-MANIFEST.json` / `DESIGN-HANDOFF.md` / `shot-final.png`）
性质：**只读审计**。未修改任何源码、未提交、未部署、未访问生产。审计新增的文件全部落在 `docs/audit-2026-10-24/` 下（报告 + 临时截图脚本 + 截图）。

---

## 0. 结论速览

- 设计系统的**颜色 token 与外壳几何基本逐值对齐**（12 个中性色/蓝色值、248px 侧栏、56px 顶栏、40px 内容沟、12/18px 圆角、发丝线 `#d2d2d7`）。
- 但**页面级排版语言系统性偏离契约**：设计稿在 发现/频道/练习/词汇/收藏/学习记录/通知/会员 上用 **10–11px 大写眉标 + 紧凑页头**（`styles.css:353 .eyebrow`、`styles.css:368 .page-head-compact`），当前实现改用 **20–30px 粗体页标题**（`user-ui.css:1429`、`user-ui.css:1437`）。首页的眉标在审计期间已改回 12px/600/`#86868b`，**其余 7 页仍是 20–30px**，这是跨页最大的一处偏差。
- **四个页面的核心模块缺失或换形**：词汇（首屏 due-card + 4 张统计卡 + 词单三段全缺）、练习（「选择试卷」卡片网格 + 「已选择」操作条缺失）、我的（深色会员卡 + 账户卡缺失，多出 6 个快捷入口）、发现（首页「已订阅的频道」整段缺失）。
- **首页右栏（审计期间已被修）**：设计的三张白底描边卡（`styles.css:641 .rail-card`）里，第一张原本被改成深色实心卡，暗色下与画布同色、卡片边界完全消失；本审计进行中已由并行改动改回白底描边卡（复核实测：浅色 `rgb(255,255,255)` + `1px #d2d2d7`、暗色 `1px #2c2c2e`）。见 §1.5 快照说明。
- **响应式断点与契约不一致**：设计在 `≤1024px` 收起侧栏并切到底部导航（`styles.css:1669`），实现在 `<768px` 才收起 → 在 manifest 明确要求的 **1024×768 与 820×1180 两档，构图就是两套东西**（实测侧栏仍占 248px、无底部导航）。
- 横向溢出：**9 个视口 × 13 条路由 = 114 次有效测量，全部 0px**，这一项是通过的。

| 指标                     | 设计稿                 | 当前实现（1440×900 实测）              |
| ------------------------ | ---------------------- | -------------------------------------- |
| 侧栏宽                   | 248px                  | 248px ✅                               |
| 顶栏高                   | 56px                   | 56px ✅                                |
| 内容沟（≥1280）          | 40px                   | 40px ✅                                |
| 页面可用宽               | 1112px                 | 1112px ✅                              |
| 页面标题                 | 10–11px 大写眉标       | 20px（练习）/ 30px（其余 6 页）❌      |
| 首页 h1                  | 11px / 600 / `#86868b` | 12px / 600 / `#86868b` ✅（审计期间修复，差 1px） |
| 区块标题                 | 18px / 600             | 20px（首页 feed、通知 h2）❌           |
| 卡片圆角 / 描边          | 12px / 1px `#d2d2d7`   | 12px / 1px `#d2d2d7` ✅                |
| 大卡（hero）圆角         | 18px                   | 18px ✅                                |
| 到期卡底色               | `#1d1d1f`（近黑，非纯黑） | 已改回白底描边卡 ✅（审计期间修复）   |
| 侧栏收起断点             | ≤1024px                | <768px ❌                              |
| 手机底部导航             | `fixed` + 毛玻璃       | 常规流、无模糊 ⚠️（代码有明确取舍说明） |

---

## 1. 审计范围与方法

### 1.1 账号

- 一次性手机号注册（`POST /api/v1/auth/sms/send-code` → `/sms/login`，dev 验证码 `1234`），随后 `change-password` + `onboarding_completed=true`，注入 `localStorage.seeword_token` 与 cookie `seeword_token`。
- 主证据账号：`13938675965`（`vis-audit-2`，**播过种子数据**：14 条词库、其中 4 条标已掌握；2 个收藏视频）。
- 补拍账号：`13340079493`（`vis-audit-3`，桌面 + 手机全套）；响应式探针 `132****`、搜索弹窗 `131****`。
- 为什么必须播种子：全新账号在 词汇/收藏/学习记录/通知 上全是空态，无法与设计稿的富内容版式对比。

> 关键做法：cookie 用 `context.addCookies()` 在首次导航**之前**注入。`frontend/scripts/design-shots.mjs` 用 `addInitScript` 写 `document.cookie`，init script 在文档请求**之后**才执行，所以它第一次访问受保护路由会被 `proxy.ts` 307 到 `/login`（本次复现：`probe-home.png` 整页空白）。这是脚本自身的坑，不是站点缺陷。

### 1.2 截图脚本（临时产物，仅本次审计）

| 文件                                       | 作用                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `docs/audit-2026-10-24/shots.mjs`          | 主脚本：登录+种子 → 13 路由 × 2 视口 → 暗色 3 页 → 溢出矩阵 → console/请求/API 采集 |
| `docs/audit-2026-10-24/shots3.mjs`         | 补拍桌面/手机缺失组合（失败重试 1 次，页间停顿）         |
| `docs/audit-2026-10-24/metrics.mjs`        | 关键元素字号/字重/圆角/描边/盒模型实测（`metrics.json`） |
| `docs/audit-2026-10-24/probe-*.mjs`        | 路由、响应式 1024/820、手机搜索弹窗的定点取证            |

运行方式：`cd frontend; node ../docs/audit-2026-10-24/shots.mjs --tag=vis-audit-2`（借助 `frontend/node_modules/@playwright/test`，用 `createRequire` 从 `frontend/package.json` 解析）。

等待条件（比 `scripts/design-shots.mjs` 严）：`main` 可见 → `main h1` 可见（60s）→ `networkidle` → `.skeleton-shimmer` 计数归零（轮询 40×250ms）→ 再等 700ms。

### 1.3 视口与截图

- 全页截图：**1440×900**（桌面）与 **390×844**（手机），`fullPage: true`。
- 横向溢出检查：**1920×1080 / 1440×900 / 1366×768 / 1024×768 / 820×1180 / 600×960 / 430×932 / 390×844 / 360×800**（= `DESIGN-MANIFEST.responsiveViewports` 全集）。
- 暗色抽查：`/`、`/vocabulary`、`/profile`（1440×900，`localStorage.theme=dark` + `colorScheme: dark`）→ `vis-audit-2-dark-home.png`、`vis-audit-2-dark-vocabulary.png`、`vis-audit-2-dark-profile.png`。
- 额外定点：1024×768 与 820×1180 首页构图（`vis-audit-3-home-1024x768.png` / `vis-audit-3-home-820x1180.png`）；dev 服务崩溃后两条路由的隔离复测（`probe-channels-rachel-s-english.png`、`probe-watch-28091082-....png`）。

### 1.4 证据目录

全部截图在 `docs/audit-2026-10-24/shots/`，原始报告 `vis-audit-2-report.json`（console / 失败请求 / API≥400 / 溢出矩阵）、`vis-audit-3-report.json`、`metrics.json`。

### 1.5 快照与并发改动（重要）

审计开始时任务说明为「工作区干净」，但审计进行中 `git status` 出现 **13 个已跟踪文件被修改**（含 `frontend/src/app/(main)/page.tsx`、`frontend/src/components/home/DiscoverRail.tsx`）——同一工作区里有并行 agent 在改代码/写文档（`docs/audit-2026-10-24/` 下还出现了其他人的 `auth.mjs`、`sweep.mjs`、`_next-dev.log` 等）。

因此：

- 快照时间：**2026-10-24 05:35（America/Denver）**，即 `vis-audit-4` 与 `metrics.json` 的复核时刻；
- **`vis-audit-2` / `vis-audit-3` 截图是修改前**的首页（深色到期卡 + feed 分隔线 + 20px 眉标）；
- **`vis-audit-4-home-desktop.png` / `-mobile.png` 是复核后**的浅色首页（白底描边卡、无分隔线、12px 眉标）；`vis-audit-4-home-dark-*.png` 是同一时刻的暗色版；
- `metrics-pre.json` 保存了改动前的页头字号，`metrics.json` 是复核后的实测，两者可直接 diff（首页 h1 20px/700/`#1d1d1f` → 12px/600/`#86868b`；其余 7 页仍是 30px/700）；
- 本报告的行号按**复核时**的代码校准；发现表里对已修的条目明确标注「审计期间已修」，并保留原问题描述（便于回溯为什么改）；
- 并发负载（多个浏览器同时打 dev 服务）也是 §6.2 里 Next dev worker 崩溃的主要嫌疑。

---

## 2. 逐页对比结论

还原度口径：**高** = 结构、层级、控件与设计一致，只剩数值级差异；**中** = 区块集合基本对得上但形状/顺序/密度有偏差；**低** = 核心区块缺失或被换成另一套信息结构。

| 页面                       | 还原度 | 主要偏差                                                                                                                                                                                                                                                             | 证据截图                                                     |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 应用壳（侧栏/顶栏/底栏）   | 高     | 几何全对；多出侧栏折叠按钮；每页底部多出站内页脚；手机底栏非 fixed/无毛玻璃；1024 与 820 两档不收侧栏                                                                                                                                | `vis-audit-2-home-desktop.png`、`-mobile.png`                 |
| 搜索弹窗                   | 高     | 结构与设计一致（图标+输入+关闭+结果区+底部两段提示）；空态文案被简化（设计 `没有找到「q」`+建议）                                                                                                                                    | `vis-audit-2-search-dialog-desktop.png`、`vis-audit-3-search-dialog-mobile.png` |
| 发现 `/`                   | 中     | ① ~~页头眉标变成 20px 粗标题~~（审计期间已改回 12px/600/`#86868b`，复核通过）；② ~~右栏第一张卡改成深色~~（同上，已改回白卡）；③ 「已订阅的频道」整段缺失；④ feed 工具条多「时长」筛选、区块间距 22.4px（设计 38px）；⑤ hero 元信息字段与主 CTA 文案不同；⑥ 右栏多「查看学习记录」卡、「本周节奏」少了设计的那句注 | `vis-audit-2-home-desktop.png`（修前）、`vis-audit-4-home-desktop.png`（修后）、`vis-audit-2-home-mobile.png` |
| 频道 `/channels`           | 中     | ① h1「全部频道」30px vs 设计眉标「频道」；② 缺页头右侧「已订阅 N」徽标 +「去发现」按钮；③ 频道卡**没有封面图**（设计 320×200 封面 + 名称/描述/统计/订阅），改成头像圆 + 最近收录行；④ 网格 3 列 vs 设计 2 列；⑤ 多出搜索框 | `vis-audit-2-channels-desktop.png`、`-mobile.png`             |
| 频道详情 `/channels/[slug]` | 中    | ① 缺 380×240 封面 hero（改用头像 + 浅蓝推荐卡）；② 多右栏「频道信息 / 相关频道」；③ 面包屑「— ← 全部频道」与设计「← 频道 + 频道名」不同                                                                                                | `vis-audit-3-channel-detail-desktop.png`、`-mobile.png`       |
| 练习 `/practice`           | 中     | ① **「选择试卷」卡片网格 + 「已选择」操作条整块缺失**（设计的首屏主模块）；② 多出「逐句听力」横条；③ 缺页头右侧「回看错题」；④ 右栏缺「这一版包含」；⑤ 「按题型练」列表本身与设计高度一致（01/02/03 + tag + 描述 + 题组统计 + 真题/开始） | `vis-audit-2-practice-desktop.png`、`-mobile.png`             |
| 词汇 `/vocabulary`         | 低     | 设计首屏是 **深色 due-card + 4 张统计卡 + 词单 set-grid** 三段；实现换成「复习 / 词库」两个 tab，首屏只有一句统计行 + 空态。统计卡的「全部词汇/学习中/已掌握/新词」四宫格不存在；词单卡片（进度条 + 计数）不存在                              | `vis-audit-2-vocabulary-desktop.png`、`-mobile.png`           |
| 词汇复习 `/vocabulary/review` | 未定 | 无到期词，只能看到空态（文案 + 两个按钮），设计的翻卡/自评（认识·模糊·不认识）流程未取得证据                                                                                                                | `vis-audit-2-vocabulary-review-desktop.png`、`-mobile.png`    |
| 词汇集合 `/vocabulary/sets` | —      | 设计稿没有独立路由（词单是词汇页内的 set-grid），实现把它做成独立页 + 2 列卡片 + 进度环；属于路由拆分差异                                                                                                                                  | `vis-audit-2-vocabulary-sets-desktop.png`、`-mobile.png`      |
| 我的 `/profile`            | 中     | ① 缺 **深色 member-mini 卡**（体验会员 / 所有视频与逐句字幕 / 查看会员）与**账户卡**（邮箱/会员状态/通知）；② 头像 56px vs 设计 120px、无「学习第 N 天」；③ tabs 5 个（内容/资料/进度/账号/设置）vs 设计 4 个（概览/收藏/学习记录/设置）；④ 多出 6 个快捷入口网格 + 右栏「相关页面」；⑤ 学习资产四卡与设计 asset-grid 一致 ✅ | `vis-audit-3-profile-desktop.png`、`-mobile.png`              |
| 收藏 `/favorites`          | 中低   | ① 设计是「视频 / 原句」两个 tab + 2 列 fav-grid（96px 缩略图 + 标题 + 元信息 + 右上角移除 X）；实现是**三段常驻分区**（视频/句子/词）+ 右栏两段说明 + 虚线空态卡；② 多出整块右栏（收藏说明），主栏被压到 760px | `vis-audit-3-favorites-desktop.png`、`-mobile.png`            |
| 学习记录 `/history`        | 中低   | ① 设计是 4 张统计卡 +「最近观看」「最近练习」卡 +「近 7 天」圆点 +「词汇进展」键值卡；实现是裸数字统计（无卡面）+ 全部/学习中/已完成 tab + 记录列表 + 右栏说明；② 「最近练习」「词汇进展」两段不存在                       | `vis-audit-3-history-desktop.png`、`-mobile.png`              |
| 通知 `/notifications`      | 中低   | 设计只有一条单列 `notification-row` 列表（图标 + 标题 + 正文 + 时间 + 查看）+ 页头两个按钮；实现多出类型 tab 行（带计数）、「最近通知」分区标题、通知设置预览块、右栏「未读统计/什么时候会收到」两段                      | `vis-audit-3-notifications-desktop.png`、`vis-audit-3-notifications-mobile.png` |
| 会员 `/upgrade`            | 中     | ① 设计是**深色 member-card**（当前状态/体验会员/体验中 + 两个暗底按钮）+ 权益卡（4 条带图标的 benefit 行）+ fineprint + 常见问题 FAQ；实现是两张白卡（勾选式权益清单 + 档位/二维码），无深色卡、无 FAQ、无页头「体验会员」徽标 | `vis-audit-3-upgrade-desktop.png`、`-mobile.png`              |
| 观看 `/watch/[id]`         | 中     | ① 设计的当前句操作是 4 个 ghost 文本按钮（播放这一句／收藏原句／上一句／下一句）+ 竖分隔线；实现是 6 个胶囊按钮（上一句／重听本句／下一句／少一点辅助再听／继续播放／收藏这句）；② 多出字幕模式 tabs（双语/英/中/关闭）+ 跟随开关 + 看全文；③ 多出「我的笔记」整段；④ 标题层级与右侧字幕卡结构对得上 ✅ | `vis-audit-3-watch-desktop.png`、`-mobile.png`                |

> 说明：一次性账号没有到期词与历史记录，**词汇 / 词汇复习 / 收藏 / 学习记录 / 通知** 的截图多为空态或单条数据。这些页「缺哪个模块、多了哪块」的结论主要来自代码（发现表里每条都给了文件与行号），空态截图只用于验证版式、页脚、空态形状与横向溢出，不作为「模块存在与否」的证据。

---

## 3. 发现表

位置一律指当前实现仓库内的真实文件与行号；设计依据指导出目录内的文件与选择器/行号。

| 编号  | 严重度 | 页面/组件 | 位置 | 偏差描述 | 设计依据 | 修复建议 |
| ----- | ------ | --------- | ---- | -------- | -------- | -------- |
| V-01 | P1 | 频道 / 练习 / 词汇 / 收藏 / 学习记录 / 通知 / 会员（页头） | `frontend/src/app/user-ui.css:1429`（30px/700）、`:1437`（eyebrow 变体 20px）、`frontend/src/components/ui/PageHeader.tsx:42-45` | 这 7 个一级页用 30px 粗体页标题（练习为 20px）；设计这 7 页的 h1 都是 **10–11px 大写眉标**（灰 `#86868b`，字距 .09em），大标题只留给详情页（频道名、观看标题、个人姓名）。复核实测：频道 30/700、词汇 30/700、我的 30/700、通知 30/700、会员 30/700、收藏 30/700、学习记录 30/700、练习 20/600 —— 均未变 | `styles.css:353-368` `.eyebrow`/`.page-head-compact`；`app.js:1217`（频道）、`1330`（练习）、`1542`（词汇）、`1930`（收藏）、`1971`（学习记录）、`2114`（通知）、`2139`（会员） | 给 `PageHeader` 增加 `variant="eyebrow"` 的**真实 11px** 规格（现为 20px 折中），或对上述 7 页统一走眉标；只有详情页保留 30px 标题。首页同款改动已落地（V-02），可直接复用到 `PageHeader` |
| V-02 | ✅ 已修 | 首页标题 | `frontend/src/components/home/HomeEditorialHero.tsx`（组件写 `text-caption`）；复核时 `user-ui.css` 已去掉对 `h1` 的 1.25rem/1.3rem 覆盖 | **原问题**：首页 h1 实测 20px/700 近黑（手机 20.8px），设计是 11px/600 浅灰大写。**现状态**：复核实测 **12px / 600 / `rgb(134,134,139)`**（=`#86868b`），与设计只差 1px 字号 | `styles.css:369`（`.page-head-compact .eyebrow{font-size:11px}`）、`app.js:1034` | 再把 12px 调到 11px 即完全对齐；这条改法建议同时用于 V-01 |
| V-03 | ✅ 已修 | 首页右栏「今天到期」 | `frontend/src/components/home/DiscoverRail.tsx:167-190`（复核时已是 `rounded-md border border-hairline bg-canvas p-[18px]`） | **原问题**：设计三张 rail 卡都是白底 + 1px 描边 + 12px 圆角，实现把第一张改成 `bg-surface-dark` 实心卡，内边距 16px、数字 44px。**现状态**：白底 / 1px `#d2d2d7` / 12px 圆角 / 18px 内边距 / 42px 数字 / 「今天到期 · 复习」标题行 / 单个主 CTA + 文本链，与设计一致 | `styles.css:641-648` `.rail-card`/`.rail-title`/`.rail-kicker`/`.due-number` | 无需再改；保留这条记录以防回退 |
| V-04 | P1 | 首页缺失模块 | `frontend/src/app/(main)/page.tsx:103-144`（只有 header/continue/hero+rail/feed） | 设计首页第 4 段「已订阅的频道」整段（标题 + 「管理频道 →」+ 3 列 sub-card 网格）在当前首页不存在（复核：`document.body.innerText` 无「已订阅的频道」） | `app.js:1123-1133` `subscribed-strip`；`styles.css:775` `.subscribed-strip{repeat(3,1fr)}`、`:776` `.sub-card` | 在 feed 之后补回该段（数据来自 `/api/v1/discovery/subscriptions`，rail 已在用同一接口） |
| V-05 | P1 | 词汇页首屏 | `frontend/src/app/(main)/vocabulary/page.tsx:312-320`（PageHeader + 2 tab） | 设计首屏 = 深色 due-card（kicker 今天复习 / 大数字 / 两个暗底按钮）+ 右侧 2×2 统计卡（全部词汇·学习中·已掌握·新词，各带 hint）+ 「词单」4 张 set-card（标题/描述/词数/进度条/计数）。实现三段全无，只剩 tab 与一行统计 | `app.js:1547-1589`；`styles.css:1109-1131`（vocab-hero/due-card/stat-card）、`:1166-1168` `.set-grid`/`.set-card` | 恢复 vocab-hero 两栏（深色 due-card + stats-grid）与 set-grid；把现有「复习/词库」tab 降级为词单之上的筛选 |
| V-06 | P1 | 练习页缺核心模块 | `frontend/src/app/(main)/practice/page.tsx:153-160`（页头后直接是「逐句听力」条） | 设计首页第二段是「选择试卷」：3 列 paper-card（kicker/名称/元信息/构成/单选标记，选中态蓝框 + 浅蓝底）+ 底部「已选择」操作条（已选择 xx / 看构成 / 开始作答）。实现完全没有试卷选择交互 | `app.js:1348-1382`；`styles.css:898` `.paper-grid`、`:899-947` `.paper-card` / `.is-selected` / `.paper-radio` | 补 paper-grid + selected-bar；现在「按套卷练」的单行列表不能等价替代（无选中态、无构成预览） |
| V-07 | P1 | 响应式断点 | `frontend/src/components/layout/Sidebar.tsx:49` / `user-ui.css:1529`（`min-width:768px` 才显示侧栏） | 设计在 **≤1024px 隐藏侧栏**并显示顶栏移动品牌 + 固定底部导航；实现到 **<768px** 才切。实测 1024×768 与 820×1180：侧栏仍 `flex`、宽 248px、底部导航 `tabbarVisible:false` | `styles.css:1669-1690`（`@media (max-width:1024px){.sidebar{display:none}.mobile-brand{display:flex}.mobile-tabs{display:flex;position:fixed...}}`） | 侧栏/底栏断点改到 1024；`md:` 系列栅格同步复核（当前 `md:grid-cols-2` 在 820 会挤） |
| V-08 | ✅ 已修 | 全站外壳 | `frontend/src/app/(main)/MainLayoutInner.tsx:126`（`{!isWatch && <SiteFooter />}`） | 每个应用页底部多出「用户协议 / 隐私政策 / 帮助与反馈」页脚 + 分隔线。设计应用壳里没有页脚；内容短的页面（如词汇复习空态）页脚会紧贴空态、下方留大片空白 | `index.html:90-113`（shell 只有 sidebar/topbar/main）、`styles.css:329` `.main{...padding-bottom:72px}` 无 footer | 应用壳内移除 `SiteFooter`（或只在未登录/营销页保留）；底部留白交给 `.main` 的 72px |
| V-09 | P2 | 页头面包屑 | `frontend/src/components/ui/PageHeader.tsx:42-44`；样式 `user-ui.css:1411-1427`（`::before` 画 1.125rem 横线） | 「— 我的」「— 频道」「— 词汇」这种横线 + 两字眉标是设计中不存在的元素；设计眉标本身没有前置横线，且我的/收藏/学习记录/通知同属「我的」下，设计只有一行眉标 | `styles.css:353` `.eyebrow`（无 `::before`） | 去掉 `::before` 横线；或整块改用 V-01 的眉标规格 |
| V-10 | ✅ 已修 | 首页 feed 工具条 | `frontend/src/components/home/HomeFeed.tsx:37-38`（`DURATION_OPTIONS`）+ 工具条渲染 | 多出「时长：全部时长」下拉；设计工具条只有 分类 chips + 难度 + 排序 + 条数 | `app.js:1141-1167` `feedFilters()`；`styles.css:690-705` | 去掉时长筛选，或收进「更多筛选」浮层（不占首行） |
| V-11 | P2 | 首页 feed 分区 | `frontend/src/app/(main)/page.tsx:124`（`mt-9`）+ `user-ui.css:1153-1158`（`.home-video-feed{margin-top:1.4rem}` 覆盖）+ `page.tsx:128`（h2 用 `text-title`） | **分隔线已在本审计期间移除**（复核实测 `borderTopWidth:0`）；但区块上间距实测 **22.4px**，设计是 38px（`mt-9`=36px 被 `.home-video-feed` 的 22.4px 覆盖）；标题仍是 20px，设计 18px | `styles.css:370-380`（`.section{margin-top:38px}`、`.section-title{font-size:18px}`） | 把 `.home-video-feed` 的 `margin-top` 改到 38px，标题降到 18px（或新增 `text-section` token） |
| V-12 | P2 | 首页 hero 元信息与主 CTA | `frontend/src/components/video/VideoMetadata.tsx:21,31`（「原片发布」「N 次播放」）、`frontend/src/components/home/FeaturedVideoCard.tsx:125`（「观看完整视频」） | 设计的 hero 元信息是「218 句逐句字幕 · 主题 · 点赞 · 收藏」，主 CTA 是「从这句话开始」（跳 `?t=62.76` 的那一句），次 CTA「看频道」 | `app.js:1069-1081`（`hero-quote` + `hero-meta` + `hero-actions`） | 主 CTA 改为「从这句话开始」并带 `t`；元信息换成字幕句数 + 主题 + 点赞 + 收藏（发布/播放量属后台字段，不该占首屏） |
| V-13 | ✅ 已修 | 首页 rail 细节 | `DiscoverRail.tsx:239-249`（「本周节奏」）、`:259-268`（7 段进度）、`:273-281`（多出的「查看学习记录」卡） | CTA 与说明已按 V-03 一起对齐（单主按钮 + 「全部 N 词」文本链 + 「复习过的词会从到期列表里移走」）。**仍存**：① 「本周节奏」是 7 段小条，设计是一条 57% 进度条；② 缺设计那句「只记录发生过的学习；没有任务打卡，也不补记。」；③ rail 第 4 张「查看学习记录」卡设计里没有 | `app.js:1101-1108`、`styles.css:648` `.rail-note`、`:665-667` `.week-row` | 进度条改单条；把「只记录发生过的学习…」补回去（它是「0 分钟」的唯一解释）；删掉第 4 张卡 |
| V-14 | P2 | 频道目录 | `frontend/src/app/(main)/channels/page.tsx:205`（`<PageHeader crumb="频道" title="全部频道" />`）、卡片 `frontend/src/components/channels/ChannelCard.tsx` | ① 标题「全部频道」30px，设计眉标「频道」+ 右侧「已订阅 N」+「去发现」；② 设计频道卡是 **320×200 封面图 + 名称/描述/统计行/等级·更新节奏/订阅按钮** 的两列卡；实现无封面，改成 40px 头像 + 标签 + 一行统计 + 「最近收录」缩略行 + 底部「订阅 / 进入频道 →」；③ 网格 `xl:grid-cols-3`（实测 3 列） | `app.js:1208-1246`、`970-987` `channelCard()`；`styles.css:791` `.channel-grid{repeat(2,1fr)}`、`:792-802` `.channel-card` + `.channel-cover` | 卡片补回封面 hero；网格改 2 列；页头补右侧徽标与按钮 |
| V-15 | P2 | 频道详情 | `frontend/src/app/(main)/channels/[slug]/page.tsx`（hero 区） | 缺设计的 380×240 频道封面 hero（三列：封面 / 正文 / 订阅+看一条）；改为头像圆 + 名称 + 浅蓝推荐卡，并多出右栏「频道信息 / 相关频道」 | `app.js:1263-1276` `.channel-hero`；`styles.css:1735` 区块 | 补封面 hero；右栏信息可保留但需与设计确认（契约里没有） |
| V-16 | P2 | 我的页缺卡 | `frontend/src/app/(main)/profile/page.tsx:211-254`（用户卡）、`:509-533`（右栏只有「相关页面」） | 缺**深色 member-mini 卡**与**账户卡**（邮箱 / 会员状态 / 通知，各带「查看」）；头像 56 vs 120；身份副行是手机号+目标+加入天数（设计是「体验会员 · 学习第 15 天」） | `app.js:1850-1856`、`1901-1913`；`styles.css:1402` `.member-mini`、`:1408` 账户卡 | 右栏补 member-mini（深色）+ 账户卡；头像升到 120px，或在大屏用 96px 折中 |
| V-17 | ✅ 已修 | 我的页多余模块 | `profile/page.tsx:294-354`（6 个快捷入口）、`:509`（相关页面） | 设计「概览」tab 只有 最近学习 + 学习节奏（左）与 member-mini + 账户（右）；实现多出 6 个图标入口网格与「相关页面」链接列表，页面被拉长 | `app.js:1878-1915` | 删掉 6 宫格（收藏/历史已有侧栏入口），右栏让位给 V-16 的两张卡 |
| V-18 | ✅ 已修 | 收藏页 | `frontend/src/app/(main)/favorites/page.tsx:210-224`（页头 + 统计）、`:284`（视频分区）、`:373`（句子分区）、`:470`（词分区）、`:561-615`（右栏） | 设计是「视频 / 原句」两个 tab（带计数）+ 2 列 fav-grid（卡片右侧 X 移除）；实现是三段常驻 + 右栏说明，主栏被压到 760px | `app.js:1919-1963`；`styles.css:1473-1475` `.fav-grid`/`.fav-card` | 改回 2 tab + 2 列网格；「词」若必须保留，作为第三个 tab 而不是常驻段 |
| V-19 | ✅ 已修 | 学习记录页 | `frontend/src/app/(main)/history/page.tsx:196-216`（裸数字统计）、`:256`（has-aside）、`:322-363`（右栏说明） | 设计 4 个统计数字在**描边卡内**；实现是画布上的裸数字（无卡面）；设计「最近练习」「词汇进展」两段不存在于实现；实现多出右栏两段说明 | `app.js:1966-2013`；`styles.css:1133` `.stat-card` | 统计数字套 `Card`；按设计补「最近练习」「词汇进展」，或明确记录这是有意的产品改动 |
| V-20 | ✅ 已修 | 通知页 | `frontend/src/app/(main)/notifications/page.tsx:203-215`（页头）、`:241`「最近通知」、`:362-374` 通知设置预览、`:414` 未读统计、`:442` 什么时候会收到 | 设计中通知页=单列列表（未读行浅蓝底 + 蓝点）+ 页头「通知设置」「全部标为已读」；实现多出 5 个类型 tab（带计数）、「最近通知」分区标题、通知设置预览块（两个开关）、右栏「未读统计 / 什么时候会收到」 | `app.js:2109-2132`；`styles.css:1490-1513` `.notification-row(.is-unread)` | 按契约收敛为单列列表 + 页头两按钮；类型筛选/设置预览若要保留，需产品侧确认（超出本导出契约） |
| V-21 | P2 | 会员页 | `frontend/src/app/(main)/upgrade/page.tsx:212`（`PageHeader crumb="会员" title="升级 SeeWord 会员"`）、`:217` 起两张白卡 | 缺设计的**深色 member-card**（eyebrow 当前状态 / 体验会员 / 体验中·所有已接入视频可看 / 管理订阅·先去复习）与**常见问题 FAQ**；权益清单是勾选文本行，设计是带图标方块 + 标题 + 说明的四行 benefit | `app.js:2143-2173`；`styles.css:1515-1529` `.member-layout`/`.member-card`/`.benefit` | 左侧改深色 member-card（保留真实套餐信息），权益改 benefit 行；补 FAQ（付费说明也在这里，符合「不动真实支付流程」的边界） |
| V-22 | ✅ 已修 | 暗色模式 — 首页到期卡 | 同一处 `DiscoverRail.tsx:167`（`bg-canvas` + `border-hairline`） | **原问题**：`bg-surface-dark`(#0a0a0a) 与暗色画布 (#0a0a0a) 同色，卡片无边界、只剩悬浮文字（`vis-audit-2-dark-home.png`）。**现状态**：复核暗色实测 `background rgb(10,10,10)` + `border 1px rgb(44,44,46)`，边界可辨（`vis-audit-4-home-dark-desktop.png`） | 设计没有暗色导出；判据是「卡片面必须与画布可区分」 | 无需再改；后续若再加实心深卡，暗色下用 `--surface-dark-elevated`(#161616) |
| V-23 | ✅ 已修 | 观看页操作区 | `frontend/src/app/(main)/watch/[id]/page.tsx:1314`（重听本句）、`:1328`（少一点辅助再听）、`src/components/watch/WatchBottomBar.tsx:319` | 设计当前句下方是 4 个无边框 ghost 按钮 + 竖分隔线（`.divider`）；实现是 6 个胶囊按钮，其中「重听本句」为蓝色实心主操作，另有「继续播放」「少一点辅助再听」等设计里没有的动作 | `app.js:2261-2272`；`styles.css:1315` `.current-card` / `.current-actions` | 若坚持增强，至少让视觉语言与契约一致：4 个 ghost 文本按钮 + 竖分隔，蓝色只留给整页唯一主操作 |
| V-24 | ✅ 已修 | 首页「继续观看」 | `frontend/src/components/home/DiscoverRail.tsx:48-62`（失败/无数据直接 `return null`） | 设计里该条是常驻模块（封面 86×48 + kicker + 标题 + 元信息 + 进度条 + 「继续」）；实现在无记录时整块消失，首屏顶部落差 1 行高 | `app.js:1043-1055`；`styles.css:526-575` | 无记录时给「看一段视频就会出现在这里」的占位条，保持节奏稳定 |
| V-25 | P3 | 侧栏折叠按钮 | `frontend/src/components/layout/Sidebar.tsx:59-76` | 设计中侧栏**没有折叠控件**（固定 248px）；实现顶部多一个 chevron 按钮（且折叠状态存 localStorage），折叠后变为 72px 图标栏 | `index.html:59-88`；`styles.css:134-176` | 保留功能可以，但要写进设计契约或默认折叠状态不落盘；否则首屏与设计不一致（折叠态截图会完全不同） |
| V-26 | P3 | 手机顶栏品牌 | `frontend/src/components/layout/TopBar.tsx:75-84`（只渲染品牌方块 S） | 设计手机顶栏是「S 方块 + SeeWord 文字」（`styles.css:1674` `.mobile-brand`），实现只有方块 | `index.html:92`；`styles.css:1674-1682` | 补 `SeeWord` 文字（15px/600，字距 -.02em） |
| V-27 | P3 | 词卡形态 | `frontend/src/components/watch/WordCardSheet.tsx`（sheet） | 设计是居中 `<dialog class="word-dialog">`「单词卡」（eyebrow + 关闭按钮 + 内容），实现是移动端底部 sheet / 桌面浮层 | `index.html:135-141`；`styles.css` `.word-dialog` | 保持移动 sheet 合理；桌面端建议回到居中 dialog 以贴合契约 |
| V-28 | P3 | 搜索空态文案 | `frontend/src/components/search/GlobalSearchDialog.tsx:229` | 「没有找到相关内容」；设计是「没有找到「q」」+「试试更短的词，或者直接搜中文释义。」 | `app.js:2676` | 对齐文案（含查询词回显） |
| V-29 | P3 | accent hover 方向 | `user-ui.css:68`（`--color-action-primary-hover:#0066cc`，比基色更深）、`:127`（暗色下变为 `#0071e3`） | 设计 `--accent-hover:#0077ed`（比 `#0071e3` 更亮）；悬停方向相反 | `styles.css:16-18` | 改为 `#0077ed`（按钮悬停）与 `#0066cc`（active），与设计一致 |
| V-30 | ✅ 已修 | 统计数字字号 | `frontend/src/components/profile/ProfileOverview.tsx:110`（1.75rem）、`DiscoverRail.tsx:168`（2.75rem） | 设计 asset-value 23px、due-number（首页版）42px；实现 28px / 44px | `styles.css:1393`、`:646` | 对齐 23/42px，或把这两个值收敛进 token |

---

## 4. 全局问题

### 4.1 颜色 token —— 基本逐值对齐 ✅

`styles.css:4-30` 与 `user-ui.css:11-99` 对照：`#ffffff / #f5f5f7 / #ececef / #fbfbfd / #1d1d1f / #424245 / #6e6e73 / #86868b / #d2d2d7 / #86868b / #0071e3 / #0066cc` **全部一致**。
只有三处漂移：
1. `--accent-hover` 方向相反（V-29）。
2. 深色实心卡底色 `#0a0a0a`（`globals.css:49` `--color-surface-dark`）vs 设计 `--fg #1d1d1f`。首页的错误用法已修（V-03/V-22）；词汇页 due-card 与会员页 member-card 仍用纯黑，与设计的 `#1d1d1f` 差一档，但同属「近黑实心卡」，视觉差异很小。
3. 主题 token 的命名层：设计 `--surface-warm` 在实现里叫 `--sidebar-bg`（值一样），另有一个历史遗留别名 `--color-surface-cream-strong`（`user-ui.css:33`）指向 `--surface-strong`，命名与「蓝白」体系不符。

### 4.2 字号层级 —— 主要问题区 ❌

- 设计的小号段非常细：10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 14px 都在用；实现的 `text-caption`(12) / `text-meta`(13) / `text-copy`(15) 只有三档，导致同一屏里「辅助信息」被统一放大 1–2px，密度变松。
- 页标题（V-01/V-02）是最大落差：设计 11px 眉标 vs 实现 30px（7 页）/ 20px（练习）。首页已修到 12px（V-02）。
- 区块标题：设计 18px/600（`styles.css:378`），实现 `user-sec-title` 20px/650（`metrics.json` 通知页 h2 = 20px / 650）。
- 一致的部分：hero 标题 30px/600 ✅、hero 引文 16px + 左 2px 蓝线 ✅、正文 15px ✅、meta 12–13px ✅。

### 4.3 间距与几何

- 外壳：248 / 56 / 40 / 1112px 全对。
- 页面纵向：`.user-page` 22px 顶 / 72px 底，与 `styles.css:321-327` `.main{padding:22px 40px 72px}` 一致 ✅；但**首页**用 `pt-4`(16px)（`page.tsx:104`）→ 比设计少 6px。
- 区块间距：设计 38px（`.section`），实现 32px + 分隔线（V-11）。
- 卡片内边距：设计 rail 18px / hero 24px / stat 14px；实现 rail 14–16px（`p-3.5`/`p-4`）、hero 20–24px，整体偏紧 2–4px。

### 4.4 圆角与描边

- 12px 卡片 / 18px 大卡 / 胶囊 9999 全部对上 ✅。
- 内容卡统一 `1px #d2d2d7`、无阴影 ✅（比设计还严格：设计的 `.channel-card:hover` / `.paper-card:hover` 有 `shadow-sm`，实现只有边框变化——属于可接受的减法）。
- 但**同一页里有三种卡面语言混用**：描边卡（`rounded-md border-hairline`）、无描边深色卡（`rounded-lg bg-surface-dark`）、虚线空态卡（`rounded-lg border-dashed border-hairline-strong bg-surface-soft`）。设计里虚线只用于 `.empty`，而且是 **18px 圆角 + 居中两行文字**（`styles.css:507-515`，无图标圆、无按钮组）；实现的虚线卡额外加了 40px 圆形图标 + 主次两个动作，视觉重量比设计重一档。

### 4.5 响应式

- **断点是硬伤**：设计 ≤1024 收侧栏 + 底部导航（V-07）。manifest 的 `tablet-landscape 1024×768` 与 `tablet-portrait 820×1180` 因此和设计不是同一套布局。
- 设计 ≤1240 时首页右栏变 3 等分横排（`styles.css:1651`），实现是 `xl:`(1280) 才出右栏，1024–1279 右栏落到内容下方单列。
- 设计 ≤1080 时 `watch-grid` 单列 + `transcript-card` 取消 sticky；实现用 `xl`（1280）判断，1024–1279 的观看页仍是双栏。
- 手机底部导航：设计 `position:fixed` + `backdrop-filter: saturate(180%) blur(20px)` + 半透明白（`styles.css:1678`）；实现是常规流 + 不透明 `bg-canvas`（`MobileTabBar.tsx:44-49`）。代码里写了刻意取舍（iOS 地址栏），这一点**不建议为了对齐而改回 fixed**，但应在契约里注明。
- 横向溢出：**0 处**（见 §6）。

### 4.6 深色模式

- 变量体系可用：`.dark .user-ui` 覆盖 12 组中性色 + 品牌蓝色阶，实测 `canvas` = `rgb(10,10,10)`、`ink` = `#f5f5f7`，对比度正常。
- 抽查 3 页（首页 / 词汇 / 我的）：**首页那张「与画布同色」的深色卡已在审计期间修掉**（复核：`border 1px rgb(44,44,46)`，边界可辨）；词汇页与我的页未发现同色无边界问题。
- 深色下 `--hairline:#2c2c2e` 的卡片边界可辨；`surface-card #1a1a1c` 作为浅面也成立。
- 深色下绘图类元素（进度条 `bg-brand-500`→`#0a84ff`）仍清晰。

### 4.7 空 / 加载 / 错误态

- **加载态**：外壳有 `ShellSkeleton`，首页有 `EditorialSkeleton` + `FeedSkeleton`，列表页有 `SkeletonCardGrid`——本次全部有效截图都能等到 `.skeleton-shimmer` 归零后再出内容，未捕获到「截图截在加载中」的帧。
- **空态**：实现统一了 `EmptyState`（图标圆 + 标题 + 说明 + 主 CTA），文案质量高（「收藏还是空的：看视频时，右上角书签收藏整段…」）。但**形状与设计不同**：设计 `.empty` 是虚线描边 + 居中两行文字（无图标圆、无按钮组），而实现是虚线大卡 + 圆形图标 + 两个动作，视觉重量明显更重；此外 通知/收藏/学习记录 三个空态都额外配了一块「怎么用」的说明区，属于加料。
- **错误态**：`ErrorState` 有标题 + 重试，符合「失败用 ErrorState + 重试」的约定 ✅。首页「继续观看」失败时退化成一行文字 + 内联「重试」（`DiscoverRail.tsx:48-61`），与其它页的错误卡不一致（P3）。
- **首启态**：词汇页在词库为空时把 hero 换成引导（`vocabulary/page.tsx` 注释），但实际渲染只剩「词库还是空的」+ 一个按钮，设计里那张深色 due-card 直接消失 —— 这会让新用户永远看不到词汇页的核心模块。

### 4.8 内容与真实数据占位

- 实现整体**没有假数据**（这点比设计稿更强）：所有数字来自 `/users/me/overview`、`/vocabulary/stats`、`/learning/*`；空则显示 0 或空态。设计稿里的「218 句 / 1.3 万赞 / 4 月 7 天」都是原型占位，**不应照抄**。
- 但由此产生「契约文案 vs 真实字段」的冲突，需要产品决策的三处：
  1. 首页 hero 元信息（V-12）：设计的「字幕句数 + 主题 + 点赞 + 收藏」在实现里被替换成「播放量 + 原片发布日期 + 收藏数」——后两者对学习者价值低。
  2. 「本周节奏」注（V-13）：「只记录发生过的学习；没有任务打卡，也不补记。」这句是产品口径，删掉后右栏只剩数字，失去了对「0 分钟」的解释力。
  3. 「今天先复习 5 个，大约 2 分钟」（V-13）：设计用固定 5 个/2 分钟，实现按 `reviewBatch` 与真实队列算——**文案应对齐真实值**，不能照抄 5/2 分钟。

---

## 5. 已还原良好、不建议动的部分

1. **外壳几何**：248px 侧栏、56px 顶栏、40px 内容沟、1112px 内容宽、`container-page` 单一归属 —— 与设计逐值一致，且门禁（`check-design-system.mjs` 第 1/8 条）在守。别为了某个页面再开新容器。
2. **中性色与蓝色 token**：12 个值全对，`.user-ui` 作用域隔离把橙色管理端留在原地。这套变量是资产，不要重命名。
3. **首页 hero 卡解剖**：封面左 / 内容右、kicker 三枚徽标（今日精选·黑胶囊 / 等级 / 时长）、30px 英文标题、中文副行、2px 蓝色竖线引文 + 中文译文、右下时长角标 —— 与 `shot-final.png` 几乎逐像素同构。
4. **首页 feed**：3 列 / 16:9 封面 / 12px 圆角 / 右上角时长 / 分类 chips（选中黑底）/ 难度·排序下拉 / 条数 —— 密度与设计一致。
5. **导航三面**：侧栏（5 主 + 「资料库」分组 + 词汇计数 + 未读点 + 底部头像/设置）、顶栏（搜索胶囊 + ⌘K + 待复习胶囊 + 铃铛红点 + 头像）、手机底栏（5 tab + 词汇徽标）—— 信息与顺序都对。
6. **搜索弹窗结构**：图标 + 输入 + 关闭 + 结果区 + 底部两段提示，与 `index.html:124-133` 同构。
7. **练习页「按题型练」**：序号 01/02/03 + 标题 + 推荐 tag + 描述 + 「N 个完整题组 · M 题」+ 真题/开始 —— 与设计逐字级接近，可作为其它页的模板。
8. **我的页「学习资产」四卡**：标签 / 28px 数字 / hint 三行结构 = 设计 `.asset`，网格 2→4 列也对。
9. **观看页信息架构**：返回 + 标题 + 元信息 + 播放器 + 当前句卡（英文逐词可点 + 中文 + 操作）+ 右侧字幕列表（时间戳 + 英文 + 中文 + 当前句高亮）—— 主体与设计同构，只是控件更多。
10. **空/加载/错误三态组件化**：`EmptyState` / `ErrorState` / `Skeleton` 三件套统一，比设计稿的静态 `.empty` 更完整；**不要因为卡片形状不同就把它拆回每页自拼**。
11. **无横向溢出**：9 个视口全 0，移动端 360/390/430 三档均通过。
12. **首页右栏第一张卡（修复后）**：白底 + 1px 发丝线 + 12px 圆角 + 18px 内边距 + 42px 数字 + 「今天到期 / 复习」标题行 + 单主 CTA —— 复核后与 `styles.css:641-648` 逐项对上。**这条不要回退**（曾经用深色实心卡导致暗色下卡片消失）。
13. **首页页头眉标（修复后）**：12px / 600 / `#86868b`，只差设计 1px —— 这套写法应当成为 `PageHeader` 眉标变体的参照实现（V-01）。

---

## 6. 横向溢出 / console error / API error 全记录

### 6.1 横向溢出（`documentElement.scrollWidth - clientWidth`）

9 视口 × 13 路由 = 117 次，114 次有效测量（3 次因 dev 服务中断未取得）：

| 视口       | 有效测量 | 最大溢出 |
| ---------- | -------- | -------- |
| 1920×1080  | 13       | 0        |
| 1440×900   | 13       | 0        |
| 1366×768   | 12       | 0        |
| 1024×768   | 13       | 0        |
| 820×1180   | 12       | 0        |
| 600×960    | 13       | 0        |
| 430×932    | 13       | 0        |
| 390×844    | 12       | 0        |
| 360×800    | 13       | 0        |

**结论：未发现任何横向溢出。** 失败/重试的 3 行：`1366×768 /profile`、`820×1180 /upgrade`、`390×844 /profile`（均为下述 dev 服务中断所致，复测通过）。

### 6.2 console error（34 条原始记录，去重 4 类）

| 类别 | 内容 | 判定 |
| ---- | ---- | ---- |
| Next dev 服务端崩溃 | `Failed to load resource: 500` ×21、`pageerror: Error: Jest worker encountered 2 child process exceptions, exceeding retry limit` | **环境问题，非产品缺陷**。并发审计时多个浏览器同时打 dev 服务（同目录还有其它 agent 的脚本与 `_next-dev.log`），Next dev 的 worker 崩溃，随后出现 `ERR_CONNECTION_REFUSED`。隔离复测 `/channels/rachel-s-english`、`/watch/<id>` 均为 **200 + main 可见**（`probe-routes.mjs`，截图 `probe-channels-rachel-s-english.png` / `probe-watch-28091082-….png`） |
| 崩溃窗口内的业务提示 | `[vocabularyStore] fetchStats failed ApiError: 服务暂时不可用，请稍后重试` | 同上，代理层 500 的连带表现 |
| 我自己的注入脚本 | `pageerror: SecurityError: Failed to read the 'localStorage' property from 'Window'` | **审计脚本产物**（init script 在受限源上执行），与站点无关 |
| React DevTools / HMR 提示 | `Download the React DevTools…`、`[HMR] connected` | info 级，非错误 |

### 6.3 失败请求（8 条）

`/profile`、`/favorites`、`/history`、`/notifications`、`/upgrade`、`/watch/<id>`、`/` 的 `net::ERR_CONNECTION_REFUSED`，以及 `/api/v1/notifications/unread-count` 的 `net::ERR_ABORTED`（页面卸载时的正常 abort）。全部落在同一个 dev 服务崩溃窗口内，重跑后消失。

### 6.4 API ≥ 400（去重 5 条）

`500 /api/v1/vocabulary/stats`、`500 /api/v1/users/me`、`500 /api/v1/notifications/unread-count`、`500 /api/v1/users/me/deletion`、`500 /api/v1/payments/jinshuju/purchase-link` —— 同样只在崩溃窗口出现（这些 URL 是 Next dev 的 `/api` rewrite 代理，服务端进程已死时统一 500）。**未观察到任何来自 FastAPI 的业务 4xx/5xx。**

> 备注：`/health` 在审计开始时为 200（database ok / redis ok），后端侧没有任何异常证据；上述 500 全部发生在浏览器 ↔ Next dev 之间。

---

## 7. 未执行与限制

1. **到期词流程未取到富态证据**：种子账号 `due_review_count=0`（新词尚未排期），所以 `/vocabulary/review` 只截到「今天的到期词已经清空」空态；设计稿的翻卡 + 认识/模糊/不认识三档自评流程**未做像素级对比**。
2. **答题/交卷流程未对比**：`/practice/exams/*`、`/practice/daily` 不在本次路由清单内（设计稿的 `practice/run`、`practice/wrong` 对应的是原型逻辑，与实现路由不是一对一）。
3. **视频播放态未截**：观看页停在首帧（未点播放），播放器控件、字幕同步、词卡浮层的视觉未取证。
4. **设计侧只有 1440 的成品截图**（`shot-final.png`、`screenshot-*.png`）；390/820/1024 的设计表现是**读 `styles.css` 的 `@media` 推断**的，没有导出图片可直接叠图。因此响应式结论基于「设计 CSS 声明的断点行为」，不是像素比对。
5. **暗色无设计参考**：导出目录没有暗色稿，暗色只做了一致性与可见性检查（V-22 是「与自身 token 体系冲突」，不是与设计冲突）。
6. **快照不是同一时刻**：dev 服务在第一轮/第二轮各丢失 9 / 8 张截图（`shots3.mjs` 重试补齐），且审计期间工作区被并行改动（§1.5）。`vis-audit-1` 是空数据版本，只作对照；首页请以 `vis-audit-4` 为准，其余页以 `vis-audit-2` / `vis-audit-3` 为准。**报告的行号与「已修」状态均以复核时（`vis-audit-4`）的代码为准。**
7. 未逐条比对：`/rankings`、`/search`、`/pricing`、`/checkout`、`/redeem`、`/contact`、`/weekly-report`（设计导出里没有对应页面）。
