---
kind: frontend_style
name: 前端样式系统：Tailwind v4 + CSS 变量主题化
category: frontend_style
scope:
    - '**'
source_files:
    - frontend/src/app/globals.css
    - frontend/postcss.config.js
    - frontend/package.json
    - docs/frontend/DESIGN-TOKENS.md
    - frontend/src/hooks/useTheme.ts
    - frontend/src/components/common/ThemeProvider.tsx
    - frontend/src/app/layout.tsx
    - frontend/src/components/ui/Button.tsx
    - frontend/src/components/ui/Card.tsx
---

## 1. 体系概览
SeeWord 前端采用 **Next.js App Router + Tailwind CSS v4（CSS-first 配置）+ CSS 自定义属性** 的样式方案，通过 `globals.css` 中的 `@theme` 块集中定义设计令牌（design tokens），配合 `:root` / `.dark` 两套 CSS 变量实现亮/暗双主题。组件层使用 React 原语（Button、Card 等）封装 Tailwind 类组合，统一视觉风格。

## 2. 核心文件与包
- `frontend/src/app/globals.css` — 全局样式入口，包含 `@theme` 令牌定义、`:root`/`.dark` 变量、`@layer base/components/utilities` 分层样式、动画 keyframes
- `frontend/postcss.config.js` — 仅启用 `@tailwindcss/postcss`，无 `tailwind.config.ts`
- `frontend/package.json` — 依赖 `tailwindcss@^4.3.2`、`@tailwindcss/postcss@^4.3.2`、`clsx`、`tailwind-merge`、`lucide-react`、`sonner`、`zustand`、`gsap`、`recharts`
- `docs/frontend/DESIGN-TOKENS.md` — 设计令牌文档，颜色/间距/圆角/阴影/字体的单一事实来源说明
- `frontend/src/hooks/useTheme.ts` — 主题切换 hook，管理 `html.dark` 类名与 localStorage
- `frontend/src/components/common/ThemeProvider.tsx` — React Context 暴露 theme/setTheme/toggleTheme
- `frontend/src/app/layout.tsx` — 首屏内联脚本避免 FOUC，包裹 ThemeProvider/SidebarProvider/AuthInitializer

## 3. 架构与约定
### 3.1 设计令牌体系（Design Tokens）
所有颜色、字体、圆角、阴影、间距均通过 CSS 变量在 `globals.css` 中声明，Tailwind 通过 `--color-*` 映射引用：
- **品牌色**：`brand-50~950`（vivid orange `#ff5a1f`），CTA 主色；`indigo` 为次要强调
- **表面层**：`canvas`/`surface-soft`/`surface-card`/`surface-strong` 四阶中性色（zinc 系）
- **文本**：`ink`/`body`/`body-strong`/`muted`/`muted-soft` 语义化前景色
- **语义色**：`success`/`warning`/`error` 及其 `-soft` 变体
- **学习高亮**：`learn-correct`/`learn-wrong`/`learn-highlight`/`learn-phrase`/`learn-grammar`（练习区专用）
- **静态 token**：`on-primary`/`on-dark`/`shadow-brand`/`surface-dark*` 两主题通用值

### 3.2 暗色模式机制
- 通过 `:root` 与 `.dark` 选择器覆盖 CSS 变量实现翻转，组件类名不变即自动适配
- 首屏由 `layout.tsx` 内联脚本根据 `localStorage` 或系统偏好设置 `html.dark`，避免闪烁
- 运行时通过 `useTheme()` hook 切换并持久化到 localStorage
- 功能性多色 chip（examLevels、SubtitleList）超出语义体系，使用 `@custom-variant dark` 手动配对 `dark:` 变体

### 3.3 组件库约定
`components/ui/` 下的原语组件将 Tailwind 类组合封装为 props：
- `Button`：`variant`（primary/dark/outline/ghost/text/destructive/secondary/secondaryDark）+ `size`（xs/sm/compact/md/nav/lg/icon）
- `Card`：`variant`（outline/soft/dark）+ `padding`（3/4/5/6）+ 多态 `as` prop
- 所有组件使用 `cn()`（clsx + tailwind-merge）合并 className

### 3.4 样式分层策略
- `@layer base`：全局重置、字体、标题尺寸、focus 样式、`prefers-reduced-motion` 无障碍支持
- `@layer components`：页面级复用样式（container-page、bento grid、filter-bar、now-subtitle 等）
- `@layer utilities`：滚动条隐藏、骨架屏 shimmer、stagger 动画、hover-lift 等工具类
- 动画 keyframes 放在 `@layer` 外以保证全局作用域

### 3.5 响应式与布局
- 最大页面宽度 `max-w-page: 1320px`，通过 `container-page` 组件应用
- Bento 网格布局在 `≤1024px` 降级为 2 列栅格
- 字体字距 `tracking-display-xl/lg/md/sm` 用于标题层级

## 4. 开发者规范
- **禁止硬编码颜色/像素**：必须使用 Tailwind 类引用 token（如 `bg-brand-500`、`text-ink`、`border-hairline`）
- **新代码用 preferred token**：legacy alias（coral/cream/navy 等）仅向后兼容，Phase 4-5 重写时清理
- **最暗表面用静态色**：播放器容器等场景用 `bg-surface-dark`，勿用 `bg-ink`（会随主题翻转）
- **组件样式走 props**：Button/Card 等原语通过 variant/size/padding 控制外观，不在组件内写死类名
- **动画遵循无障碍**：`prefers-reduced-motion: reduce` 下所有动画/过渡降至 0.01ms
- **主题切换零侵入**：新增 UI 元素只需引用语义 token，无需额外 dark: 变体
