# 前端设计重构落地计划 - prototypes → frontend Next.js

> 来源: `prototypes/seeword/` 33 页设计原型（已 commit `c255fd1`）。
> 目标: 把原型视觉/布局方案落地为 `frontend/` 真实 Next.js 代码，**保留现有功能逻辑与数据接入**。

## 现状关键结论（已调研）

1. **设计 token 已一致**: `globals.css`(771行) 的 brand/ink/canvas/surface/r/shadow token 与原型取自同一套，无需改 token。
2. **几乎所有原型页已有对应真实路由**（27 路由 vs 33 原型）。这是**视觉/布局重构，不是建站**。
3. **browse 页已是视频流模式**（filter-bar + TabPills + VideoCard 网格 + 无限滚动 + skeleton/empty/error），`usePlatformFeed` hook 现成。首页视频流改造 = 复用这套。
4. **FocusCard 已与原型一致**（进度环 + 连续天数 + CTA）。
5. **现有导航 = 左 Sidebar(401行,含GSAP/折叠/主题/退出/合规) + 顶 TopBar(搜索+通知+头像,无logo无nav) + 移动 MobileTabBar**。原型 = 顶 TopBar(logo+nav-links+搜索+通知+头像) + 移动底部tab。

## 已确认决策

- **导航**: 移除左 Sidebar，改顶部 TopBar 水平导航（logo + 首页/发现/练习/词汇/记录 + 搜索 + 通知 + 头像）。移动端顶部 logo+搜索 + 底部 Tab。
- **首页**: 改视频流（FocusCard + 分类/难度筛选 + 视频网格 + 加载更多）。今日计划入口收到 FocusCard CTA + 练习 tab，不丢 AI 计划功能。

---

## 阶段 0: 共享基础（导航 shell 重构）

**目标**: 把导航从「左 Sidebar」迁到「顶 TopBar」，全站主区变全宽。

### 改动

| 文件 | 改动 | 说明 |
|---|---|---|
| `components/layout/TopBar.tsx` (277行) | **重构**: 加 logo(左) + 水平 nav-links(首页/发现/练习/词汇/记录) + 保留搜索/通知/头像 + 加主题切换(从Sidebar迁入) | 复用现有搜索/通知逻辑，只加左半区 |
| `components/layout/Sidebar.tsx` (401行) | **删除** | 导航/主题/退出/合规迁入 TopBar 或 avatar 菜单 |
| `components/layout/SidebarProvider.tsx` | **删除** | 不再需要折叠/移动drawer状态 |
| `app/(main)/MainLayoutInner.tsx` (85行) | 改为 `<TopBar/> + <main>全宽</main> + <MobileTabBar/>`，去掉 Sidebar | 主区从 `flex h-screen overflow-hidden` 改自然流 |
| `components/layout/MobileTabBar.tsx` (154行) | 对齐原型 5 项（首页/浏览/练习/词汇/我的），加「练习」项 | 原型已有此结构 |
| `app/globals.css` | 删 `.nav-badge/.nav-label` 等 Sidebar 专用 CSS；保留 `filter-bar/container-page` | 清理无引用规则 |

### nav-links 数据
```ts
const NAV = [
  { label: "首页", href: "/" },
  { label: "发现", href: "/browse" },
  { label: "练习专题", href: "/practice" },   // 阶段1新增路由
  { label: "词汇本", href: "/vocabulary" },
  { label: "学习记录", href: "/history" },
];
```

### 风险
- Sidebar 的 GSAP 动画、词汇 badge、快捷键(1-4)、合规信息要迁移。快捷键可保留在 TopBar；合规信息移到页脚或 profile。
- `useSidebar` 被多处引用（TopBar/MobileTabBar 等），删除前要全局替换调用点。

### 验证
- tsc + lint + build 绿
- 桌面: TopBar 含 logo+5nav+搜索+通知+头像；主区全宽
- 移动: 顶部 logo+搜索图标 + 底部 5 tab
- 主题切换/退出登录/通知/搜索功能正常

---

## 阶段 1: 核心流（首页视频流 + 练习页）

### 1a. 首页视频流

**目标**: `(main)/page.tsx` (176行) 从「AI 仪表盘」改「FocusCard + filter-bar + 视频网格」。

**改动**:
- 保留: 问候区、FocusCard、成就 banner
- 移除: 「今日计划」区（PlanItemCard 列表）→ 入口收到 FocusCard CTA + 新增「练习」tab
- 新增: filter-bar（复用 browse 的 TabPills + usePlatformFeed）+ 视频网格（复用 VideoCard）+ 加载更多

**复用**: `usePlatformFeed({platform:"home"})`、`TabPills`、`VideoCard`、`filter-bar` CSS、FocusCard。

**数据**: 首页用推荐流（现有 `useFeedStore`）或 `usePlatformFeed`。倾向后者以复用筛选。

### 1b. 练习页（新增路由）

**现状**: 无 `/practice` `/practice-hub` 路由，但有 `components/practice/PracticePanels.tsx`。原型 06/08/10/16 共 4 页。

**改动**:
- 新增 `app/(main)/practice/page.tsx`（练习专题 hub，原型 08）
- 现有 watch 页内嵌练习（05-watch）保留
- 06 考试模式 / 10 单词训练 / 16 试卷专栏：评估是否独立路由或嵌入

**待确认**: 练习页信息架构（独立 `/practice` vs 嵌入 watch）— 阶段 1 开始时再定。

### 验证
- 首页: FocusCard + 筛选 + 网格 + 加载更多，tsc 绿
- AI 计划入口不丢（FocusCard CTA + 练习 tab）

---

## 阶段 2: 内容浏览（5 页）

| 原型 | 现有路由 | 改动 |
|---|---|---|
| 11-browse | `/browse` ✅ | 已对齐，微调视觉 |
| 13-search | `/search` ✅ | 对齐原型结果页布局 |
| 12-history | `/history` ✅ | 对齐分组续播 |
| 09-vocabulary | `/vocabulary` ✅ | 对齐掌握度+层级筛选 |
| 10-vocab-drill | 无 | 新增 `/vocabulary/drill` 全屏训练 |

工作量: 中。主要是视觉对齐 + 1 个新增页。

---

## 阶段 3: 认证引导（4 页）

| 原型 | 现有路由 | 改动 |
|---|---|---|
| 01-login | `/login` ✅ | 对齐原型分栏布局 |
| 02-register | `/register` ✅ | 对齐密码强度+条款 |
| 15-forgot-password | `/forgot-password` ✅ | 对齐 |
| 14-onboarding | `/onboarding` ✅ | 对齐 3 步+跳过 |

工作量: 中。现有页功能完整，视觉对齐。

---

## 阶段 4: 会员法律（7 页，原型最新）

| 原型 | 现有路由 | 改动 |
|---|---|---|
| 23-landing | `/landing` ✅ | 对齐 hero+学习闭环 |
| 22-pricing | `/pricing` ✅ | 对齐套餐卡+对比表 |
| 17-checkout | `/checkout` ✅ | 对齐双路径 |
| 18-upgrade | `/upgrade` ✅ | 对齐三步指引 |
| 19-redeem | `/redeem` ✅ | **加分格输入+状态机**（现有是单 input） |
| 20-terms | `/terms` ✅ | 对齐 TOC+进度 |
| 21-privacy | `/privacy` ✅ | 对齐 TOC+不存储支付 |

工作量: 中。redeem 改造最大（分格输入+5 错误文案状态机）。其余视觉对齐。

---

## 阶段 5: 管理后台（9 页，原型最新）

| 原型 | 现有路由 | 改动 |
|---|---|---|
| 24-admin-login | `/admin/login` ✅ | 对齐左品牌面板 |
| 25-admin-dashboard | `/admin` ✅ | 对齐 KPI+趋势+系统状态 |
| 26-admin-videos | `/admin/videos` ✅ | **加质量列+质量筛选**（阶段0后端已支持） |
| 27-admin-video-detail | `/admin/videos/[id]` ✅ | **加质量报告+换引擎重翻译**（后端已支持） |
| 28-admin-users | `/admin/users` ✅ | 对齐 |
| 29-admin-orders | `/admin/orders` ✅ | 对齐退款 clawback |
| 30-admin-invites | `/admin/invites` ✅ | 对齐生成/导出/作废 |
| 31-admin-stats | `/admin/stats` ✅ | 对齐图表+漏斗 |
| 32-admin-settings | `/admin/settings` ✅ | 对齐质量门禁配置 |

工作量: 大。admin shell 现有已是侧栏式（与原型一致），主要加质量门禁相关 UI（对接后端阶段0-5）。

---

## 阶段 6: 个人中心（1 页）

| 原型 | 现有路由 | 改动 |
|---|---|---|
| 07-profile | `/profile` ✅ | 对齐 4 tab（资料/进度/设置/偏好） |

工作量: 小。

---

## 执行节奏

1. **第一批 = 阶段 0 + 1a**（导航 shell + 首页视频流）— 验证两个核心决策方向，确认后再推进
2. 阶段 1b 练习页（信息架构待定）
3. 阶段 2-6 按序，每阶段一个 commit

## 全局原则

- **保留功能**: 所有数据接入（api/stores/hooks）不变，只改布局/视觉
- **复用组件**: VideoCard/TabPills/PageHeader/Button/Input 等已有组件优先复用
- **每阶段验证**: tsc + lint + build 绿码为准
- **token 不动**: globals.css 设计 token 已与原型一致
- **原型为视觉参考**: 原型的静态示例数据换成真实数据接入

## 风险与对策

| 风险 | 对策 |
|---|---|
| 首页砍今日计划区丢失 AI 计划入口 | FocusCard CTA + 练习 tab 保留入口；计划页可单独留 |
| Sidebar 删除影响多处 useSidebar 调用 | 全局搜索替换，确保无残留 |
| 练习页信息架构未定 | 阶段 1b 开始时确认 |
| watch 页 814 行最大 | 单独评估，可能拆分阶段 |
| admin shell 与原型都是侧栏式 | admin 阶段保留侧栏，不强制统一为顶栏 |
