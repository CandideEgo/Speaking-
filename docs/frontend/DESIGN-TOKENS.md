# 设计 Token — Speaking 前端

> 单一事实来源：`frontend/tailwind.config.ts`（color/spacing/radius/typography/shadow）+ `frontend/src/app/globals.css`（CSS 变量）。本文档是导航地图，不是配置本身——改 token 改 Tailwind 配置，不是改本文档。
>
> 色系：**coral / cream / brand**（ADR-0005 不换色系）。watch 页为风格锚点。

## 使用原则

- **新代码用 preferred token**（下表「preferred」列）。legacy alias 仅作向后兼容保留，Phase 4-5 页面重写时自然清除，**勿在新代码使用**。
- 颜色通过 Tailwind 类引用（`bg-brand-500`、`text-ink`、`border-hairline`），不要硬编码十六进制。
- 间距/圆角/阴影走 Tailwind 内置 + 项目扩展（`rounded-lg`、`shadow-lift`），不要写裸像素。

---

## Color

### Brand（主色 — vivid orange）

| Token | 值 | 用途 |
|-------|----|------|
| `brand-500` | `#ff5a1f` | 主操作、强调、active |
| `brand-600` | `#e84a10` | hover/active 态 |
| `brand-50` / `brand-100` | `#fff1eb` / `#ffe0d3` | soft 背景、selected 行 |
| `brand-400` / `brand-700` | `#ff7a45` / `#c33c0c` | 暗底强调 / 深色文字 |

**legacy 别名**（保留向后兼容，新代码用 `brand-*`）：`coral` = `brand-500`、`coral-active` = `brand-600`、`coral-soft` = `brand-50`、`terracotta` = `brand-500`、`primary` = `brand-500`、`accent-teal` / `accent-amber`（旧强调色，新代码勿用）。

### Surface（表面层）

| preferred | 值 | legacy 别名 | 用途 |
|-----------|----|------------|------|
| `bg-canvas` | `#ffffff` | — | 页面底色、卡片底 |
| `bg-surface-soft` | `#fafafa` | `cream-soft` / `parchment` / `ivory` | 次级表面、hover 底 |
| `bg-surface-card` | `#f4f4f5` | `cream-card` / `cream` | 输入框底、placeholder 底 |
| `bg-surface-cream-strong` | `#ededed` | `cream-strong` | 分隔、强对比表面 |
| `bg-surface-dark` | `#0a0a0a` | `navy` | 暗模式主表面 |
| `bg-surface-dark-elevated` | `#161616` | `navy-elevated` | 暗模式抬升表面 |
| `bg-surface-dark-soft` | `#1c1c1c` | — | 暗模式 hover 底 |

### Text

| preferred | 值 | legacy 别名 | 用途 |
|-----------|----|------------|------|
| `text-ink` | `#0a0a0a` | — | 标题、主文字 |
| `text-body` | `#27272a` | — | 正文 |
| `text-body-strong` | `#18181b` | — | 强调正文 |
| `text-muted` | `#71717a` | `olive` | 次级文字、meta |
| `text-muted-soft` | `#a1a1aa` | `olive-soft` | 三级文字、placeholder |
| `text-muted-foreground` | `#71717a` | — | 同 muted（语义别名） |

### Border

| preferred | 值 | legacy 别名 | 用途 |
|-----------|----|------------|------|
| `border-hairline` | `#ededed` | `hairline-cream` | 卡片、分隔线 |
| `border-hairline-soft` | `#f4f4f5` | — | 弱分隔 |

### On-colors

| Token | 值 | 用途 |
|-------|----|------|
| `text-on-primary` | `#ffffff` | brand 底上的文字 |
| `text-on-dark` | `#fafafa` | 暗底文字 |
| `text-on-dark-soft` | `#a1a1aa` | 暗底次级文字 |

### Semantic

| Token | 值 | soft | 用途 |
|-------|----|------|------|
| `success` | `#16a34a` | `success-soft` `#ecfdf5` | 成功、通过 |
| `warning` | `#d97706` | `warning-soft` `#fffbeb` | 警告、pending |
| `error` / `danger` | `#dc2626` | `red-soft` `#fef2f2` | 错误、删除 |

### Secondary accent — Indigo

`indigo-500` `#6366f1`（+ `indigo.soft` `#eef2ff`）。用于次要强调（练习模式 chip、链接 hover），不与 brand 抢主导。

### Learning highlights（练习模式专用）

`learn-correct` `#22c55e`、`learn-wrong` `#ef4444`、`learn-highlight` `#4ade80`、`learn-phrase` `#facc15`、`learn-grammar` `#f97316`。仅练习区着色，勿用于通用 UI。

---

## Radius

| Token | 值 | 用途 |
|-------|----|------|
| `rounded-xs` | 4px | 极小元素（badge 内嵌） |
| `rounded-sm` | 8px | 输入框、按钮、badge |
| `rounded-md` | 10px | 中等元素 |
| `rounded` (DEFAULT) | 12px | 通用卡片 |
| `rounded-lg` | 16px | 卡片、面板（watch 锚点） |
| `rounded-xl` | 22px | 视频播放器、大卡 |
| `rounded-2xl` | 24px | 营销大块 |
| `rounded-pill` | 9999px | 药丸、头像 |

---

## Spacing（项目扩展）

Tailwind 默认间距刻度之上：

| Token | 值 | 用途 |
|-------|----|------|
| `p-18` / `gap-18` | 4.5rem | 大块留白 |
| `p-section` / `gap-section` | 96px | 区段间垂直留白 |
| `max-w-page` | 1320px | 页面最大宽度（`Container` 用） |

---

## Typography

- **font-display** / **font-sans**：`Inter`（标题与正文同一字族，display 用于 `h1-h4` via `globals.css` base layer）。
- **font-mono**：`JetBrains Mono`（标签、计数、代码）。
- **letter-spacing**：`tracking-display-xl/lg/md/sm`（标题负字距）、`tracking-caption-wide`（caption 大字距）。
- 标题尺寸由 `globals.css` base layer 设定：`h1` `text-5xl`、`h2` `text-3xl`、`h3` `text-xl`。

---

## Shadow

| Token | 值 | 用途 |
|-------|----|------|
| `shadow-soft` | 微弱 | 卡片静态态 |
| `shadow-card` | 轻 | 卡片抬升 |
| `shadow-lift` | 中 | hover 抬升、视频播放器 |
| `shadow-brand` / `shadow-coral` | brand 色 | 主按钮、录音 active |

---

## CSS 变量（runtime 主题，`globals.css`）

`:root` 暴露 RGB 三元组供 Tailwind `<alpha-value>` 引用：`--background` `--foreground` `--muted` `--muted-foreground` `--border` `--surface` `--accent` `--sidebar-bg` `--topbar-bg`。暗模式接入时（optimization roadmap 后续项）通过覆盖这些变量切换主题，无需改组件。

---

## 组件库覆盖

`components/ui/` 原语已对齐上述 token：

| 组件 | 关键 token |
|------|-----------|
| `Button` | `brand-500/600`、`on-primary`、`shadow-brand`、`rounded-sm` |
| `Card` | `bg-canvas`、`border-hairline`、`rounded-lg`、`shadow-lift`（hover） |
| `Input`/`Textarea`/`Select` | `bg-surface-card`、`border-hairline`、`text-ink`、focus `ring-[rgba(10,10,10,0.06)]` |
| `Badge` | `brand-50`/`amber-50`/`green-50` 等 soft 底 |
| `Avatar` | `rounded-full`、`text-on-primary` + `avatarColor()` 渐变 |
| `Image` | `bg-surface-card` pulse placeholder |

新原语（Container/Stack/Grid）只做布局，不带颜色。
