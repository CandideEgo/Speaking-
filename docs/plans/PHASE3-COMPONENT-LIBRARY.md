# Phase 3 — 统一组件库 实施计划

> 落地 `docs/plans/REDESIGN-2026-07.md` Phase 3，对齐 ADR-0005。watch 页为风格锚点，保持 coral/cream/brand 色系。

## 现状基线（探索结论）

- **Design tokens 已存在**：`tailwind.config.ts`（brand/indigo/surface/ink/text/border + radius/spacing/shadow/typography）+ `globals.css`（CSS 变量）。问题：无文档；legacy 别名（`cream-*/navy/olive/coral/teal/accent-amber`）与正式 token 并存。
- **已有原语**（design loop 迭代 2-4）：`Button/Card/Input/Textarea/Badge/Modal/ConfirmDialog/DataTable` + 12 个 `ui/*` 专用组件（Eyebrow/LinkButton/MetricCard/PageHeader/PriceCard/ProgressRing/SectionHeader/Select/TabPills/TimelineItem/VideoCard）。
- **缺失**：
  - `Avatar` — 5+ 处重复 `avatar_url ? <img> : <initial+gradient>` 逻辑（TopBar/CommunityFeedWidget/community page/ProfileTab/CommentThread）。
  - `Image` — 11 处裸 `<img>` 带 `eslint-disable @next/next/no-img-element`。
  - 布局原语 `Container/Stack/Grid`。
- **next.config.js** `remotePatterns` 仅 `**.aliyuncs.com` + `i.ytimg.com`；但 `mediaUrl()` 已把 7 个 CDN host（ytimg/hdslb/biliimg/douyinpic/douyincdn/douyinstatic/aliyuncs）代理到 API host。故 `Image` 主要需放行 API host + CDN fallback。
- **watch 页样式锚点**已确认：`bg-canvas`/`border-hairline`/`rounded-lg|xl`/`shadow-lift|brand`/`brand-50/500/600`/`text-ink`/`text-muted`。

## 实施步骤

### Step 1 — Design tokens 文档化 + 审计（不删 legacy）
- 新建 `docs/frontend/DESIGN-TOKENS.md`：color/spacing/radius/typography/shadow 全表，标注 **preferred token** vs **legacy alias**（legacy 保留向后兼容，Phase 4+ 新代码用 preferred）。
- **不删 legacy 别名**：40+ 调用点，Phase 4 重写时自然清除；现在删风险高、收益低。

### Step 2 — `Avatar` 组件
- 新建 `frontend/src/components/ui/Avatar.tsx`：
  - props：`src`、`name`（首字母 + color seed）、`size`（xs 24 / sm 28 / md 32 / lg 40 / xl 64）、`className`、`as`
  - `src` 有值 → `next/image`；加载失败或无 src → 渐变背景 + 首字母（复用 `lib/avatar.ts` 的 `avatarColor` + `userInitial`）
  - `"use client"`，forwardRef
- 新文件，无现有 symbol 改动 → 无需 impact 分析。

### Step 3 — `Image` 组件
- 新建 `frontend/src/components/ui/Image.tsx`：
  - `next/image` 包装；`src` 自动过 `mediaUrl()`
  - 内置 loading（pulse placeholder）/error（fallback）状态，吸收 `VideoThumbnail` 的 `useEffect` 计时器逻辑
  - props：`src`、`alt`、`fill | width+height`、`className`、`fallback`（ReactNode）、`rounded`
- 替代 11 处裸 `<img>` + 收敛 `VideoThumbnail` 状态机。

### Step 4 — `next.config.js` images.remotePatterns
- 扩充：`aliyuncs/ytimg/hdslb/biliimg/douyinpic/douyincdn/douyinstatic` + `localhost`（dev API）+ 解析 `NEXT_PUBLIC_API_URL` hostname。
- 因 `mediaUrl` 已代理 CDN→API host，prod 同源时 next/image 直走；dev 跨端口需 localhost 放行。

### Step 5 — 布局原语 `Container/Stack/Grid`
- `Container.tsx`：`max-w-page mx-auto px-4 sm:px-7`（替代 `.container-page`），`as` prop。
- `Stack.tsx`：`direction`（row/col）+ `gap` + 响应式 + `align/justify`。
- `Grid.tsx`：`cols`（1-12 或 responsive 对象）+ `gap`。
- 三者 thin wrapper over Tailwind，mobile-first；不抽象掉 Tailwind 语义，只固化默认值。

### Step 6 — 迁移裸 `<img>` 与 avatar 重复到新组件
11 处 `<img>` + 5 处 avatar 重复：
| 文件 | 行 | 迁移到 |
|------|----|--------|
| `components/video/VideoThumbnail.tsx` | 72 | `Image`（保留 placeholder/fallback 等价逻辑） |
| `components/ui/VideoCard.tsx` | 63 | `Image` |
| `components/layout/TopBar.tsx` | 308 | `Avatar` |
| `components/profile/ProfileTab.tsx` | 54 | `Avatar` |
| `components/community/CommunityFeedWidget.tsx` | 99 | `Avatar` |
| `app/(main)/community/page.tsx` | 283, 353 | `Image` / `Avatar` |
| `app/(main)/history/page.tsx` | 179 | `Image` |
| `app/(main)/my-videos/page.tsx` | 193 | `Image` |
| `components/dashboard/RecentActivityTimeline.tsx` | 41 | `Image`/`Avatar` |
| `app/(admin)/admin/(shell)/videos/VideoManager.tsx` | 323 | `Image` |

迁移前对每个被改组件跑 `gitnexus_impact({target, direction:"upstream"})` 确认 blast radius（多为叶子组件，应 LOW）；HIGH/CRITICAL 先停下报告。

### Step 7 — 组件 demo 页
- 新建 `frontend/src/app/(admin)/admin/(shell)/_design/page.tsx`：admin-gated，展示所有 `ui/*` 原语 + `Avatar/Image/Container/Stack/Grid` 各 variant。
- `AdminSidebar` 加「设计系统」入口。
- 作 Phase 4-5 页面重写的活参考。

### Step 8 — 验证 + 收尾
- `cd frontend && npx tsc --noEmit`
- `pre-commit run prettier --files <改动文件>` + `pre-commit run --all-files`
- `npm run build`
- `gitnexus_detect_changes()` 确认范围（仅前端组件流，无后端/管线流受影响）
- 更新 `docs/plans/REDESIGN-2026-07.md` Phase 3 勾选项 + 偏差记录
- commit

## 关键决策

1. **不删 legacy color 别名** — 40+ 调用点，Phase 4 重写时自然清除；DESIGN-TOKENS.md 标注 preferred vs legacy。
2. **demo 页放 admin shell** — 已 admin-gated，不暴露用户；作 Phase 4-5 活参考。Storybook 配置成本高、项目无现有 storybook，走页面级 demo。
3. **`Image` 用 `next/image`** — `src` 全走 `mediaUrl`（已代理 CDN），`remotePatterns` 放行 API host + CDN fallback。`VideoThumbnail` 计时器 fallback 收敛进 `Image`。
4. **迁移全部 11 处 `<img>`** — ADR-0005 图像修复要「随组件库统一落地」，属 Phase 3（组件采纳，非页面重设计）。
5. **布局原语 thin wrapper** — 不抽象 Tailwind 语义，只固化 mobile-first 默认值 + 一致 spacing。

## 风险

- **next/image remotePatterns 漏配 → 图片 500**。缓解：dev/prod 各验证；`mediaUrl` 代理已覆盖主路径。
- **`VideoThumbnail` 迁移改动其状态机 → 加载行为回归**。缓解：保留等价逻辑，单独肉眼验证。
- **demo 页增加 admin 路由** → 需 `AdminSidebar` 入口；不影响用户端。
- **legacy 别名保留** → 新代码可能误用。缓解：DESIGN-TOKENS.md 标注 + Phase 4 重写时清。
