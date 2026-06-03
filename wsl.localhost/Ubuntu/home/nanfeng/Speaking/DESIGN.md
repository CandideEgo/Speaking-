---
colors:
  primary: "#2563eb"
  primary_light: "#3b82f6"
  primary_dark: "#1d4ed8"
  secondary: "#64748b"
  background: "#ffffff"
  surface: "#f8fafc"
  text_primary: "#0f172a"
  text_secondary: "#475569"
  text_muted: "#94a3b8"
  border: "#e2e8f0"
  success: "#10b981"
  warning: "#f59e0b"
  error: "#ef4444"
  dark_bg: "#0f172a"
  dark_surface: "#1e293b"
typography:
  font_family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
  heading_font: "inherit"
  base_size: "16px"
  line_height: "1.5"
  scale:
    xs: "0.75rem"
    sm: "0.875rem"
    base: "1rem"
    lg: "1.125rem"
    xl: "1.25rem"
    "2xl": "1.5rem"
    "3xl": "1.875rem"
    "4xl": "2.25rem"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "0.875rem"
  "2xl": "1rem"
  full: "9999px"
spacing:
  unit: "0.25rem"
  scale:
    "0": "0"
    "1": "0.25rem"
    "2": "0.5rem"
    "3": "0.75rem"
    "4": "1rem"
    "5": "1.25rem"
    "6": "1.5rem"
    "8": "2rem"
    "10": "2.5rem"
    "12": "3rem"
    "16": "4rem"
    "20": "5rem"
---

# Speaking — 设计系统规范

## Overview

Speaking 是一个 AI 驱动的英语口语练习应用。用户粘贴 YouTube 视频链接，AI 自动生成双语字幕、口语练习题和词汇卡片，帮助用户通过真实视频内容开口说英语。

设计哲学：**清晰、专注、温暖**。界面应当像一位耐心的语言教练——不喧宾夺主，让视频内容和练习体验成为绝对焦点。大量留白、柔和的品牌蓝色、克制的动效，营造出安静而有信心的学习氛围。

---

## Colors

### Primary Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-brand-50` | `#eff6ff` | 极浅背景、选中态高亮 |
| `--color-brand-100` | `#dbeafe` | hover 高亮、轻量背景 |
| `--color-brand-200` | `#bfdbfe` | 单词选中背景 |
| `--color-brand-300` | `#93c5fd` | 轻量描边 |
| `--color-brand-500` | `#3b82f6` | 次要按钮、链接 |
| `--color-brand-600` | `#2563eb` | **主按钮、品牌标识、激活态** |
| `--color-brand-700` | `#1d4ed8` | hover 态按钮 |

### Neutral Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-slate-50` | `#f8fafc` | 页面背景、卡片 hover |
| `--color-slate-100` | `#f1f5f9` | 输入框背景、标签背景 |
| `--color-slate-200` | `#e2e8f0` | **默认边框**、分割线 |
| `--color-slate-300` | `#cbd5e1` | 禁用态边框 |
| `--color-slate-400` | `#94a3b8` | 占位符文字、图标 |
| `--color-slate-500` | `#64748b` | 次要文字、描述 |
| `--color-slate-600` | `#475569` | 正文次要 |
| `--color-slate-700` | `#334155` | 正文 |
| `--color-slate-900` | `#0f172a` | **标题、主文字** |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-success` | `#10b981` | 成功状态、准确率指标 |
| `--color-warning` | `#f59e0b` | 处理中、提醒 |
| `--color-error` | `#ef4444` | 错误、录音停止按钮 |
| `--color-info` | `#3b82f6` | 信息提示 |

### Dark Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `--color-dark-bg` | `#0f172a` | 视频播放器区域背景 |
| `--color-dark-surface` | `#1e293b` | 视频控制面板、字幕条 |
| `--color-dark-border` | `#334155` | 暗色区域分割线 |

---

## Typography

### Font Stack

```
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
```

使用系统字体栈以确保最佳渲染性能和跨平台一致性。中文内容依赖系统默认中文字体（苹方、思源黑体等）。

### Type Scale

| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-xs` | 0.75rem | 1rem | 400/500 | 标签、时间戳、徽章文字 |
| `text-sm` | 0.875rem | 1.25rem | 400/500 | 正文、按钮文字、输入框 |
| `text-base` | 1rem | 1.5rem | 400 | 默认段落 |
| `text-lg` | 1.125rem | 1.75rem | 600 | 小节标题 |
| `text-xl` | 1.25rem | 1.75rem | 700 | 卡片标题 |
| `text-2xl` | 1.5rem | 2rem | 700 | 页面标题 |

### Special Typography

- **字幕文字**：`text-lg`, `text-white`, `leading-relaxed`，确保在视频上清晰可读
- **单词查词面板**：`text-lg font-bold` 展示单词本身
- **评分数字**：`text-2xl font-bold` 配合环形进度条
- **输入框**：`text-center text-lg tracking-widest font-mono`（兑换码输入）

---

## Spacing

### Base Unit

基础单位为 `0.25rem` (4px)，所有间距遵循 4px 网格系统。

### Common Patterns

| Context | Value |
|---------|-------|
| 页面水平内边距 | `px-4 sm:px-6 lg:px-8` |
| 卡片内边距 | `p-3` / `p-4` / `p-6` |
| 卡片间距 | `gap-4` / `gap-5` |
| 元素内部间距 | `gap-2` / `gap-3` |
| 区块间距 | `mt-6` / `mt-8` / `mt-10` |
| 头部高度 | `h-16` (64px) |

### Container

```
.container-page:
  max-width: 80rem (1280px)
  margin: auto
  padding-x: 1rem (mobile) / 1.5rem (tablet) / 2rem (desktop)
```

---

## Layout

### Grid System

- 视频卡片网格：`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- 仪表盘统计：`grid grid-cols-2 sm:grid-cols-4 gap-4`
- 管理后台表单：`grid gap-4 sm:grid-cols-3`

### Z-Index Hierarchy

| Layer | Z-Index | Element |
|-------|---------|---------|
| 背景 | 0 | 页面内容 |
| 悬浮提示 | 10 | 字幕覆盖层 |
| 头部 | 50 | 固定导航栏 |
| 模态/下拉 | 20-30 | 快捷键提示、底部面板 |
| Toast | 9999 | sonner toaster |

### Breakpoints

沿用 Tailwind 默认断点：
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

---

## Surfaces

### Card

```
bg: white
border: 1px solid slate-200
border-radius: 0.75rem (rounded-xl)
shadow: none (默认) / shadow-lg (hover)
overflow: hidden
```

**Hover 态**：`hover:border-brand-300 hover:shadow-lg transition-all`

### Empty State

```
border: 2px dashed slate-200
border-radius: 1rem (rounded-2xl)
padding: 4rem 0 (py-16)
icon: slate-300, 32px
```

### Input

```
border: 1px solid slate-300
border-radius: 0.75rem (rounded-lg)
padding: 0.625rem 1rem (py-2.5 px-4)
focus: border-brand-500, ring-1 ring-brand-500
```

### Badge / Tag

```
背景: slate-100
文字: slate-500, text-xs, font-mono
圆角: 0.25rem (rounded)
内边距: px-1.5 py-0.5
```

### Status Badge

| Status | Background | Text |
|--------|-----------|------|
| Ready | `bg-green-50` | `text-green-700` |
| Ready Subtitles | `bg-blue-50` | `text-blue-700` |
| Processing | `bg-yellow-50` | `text-yellow-700` |
| Error | `bg-red-50` | `text-red-700` |

---

## Components

### Header

```
position: sticky, top-0
height: 64px
background: white/80
backdrop-blur: md
border-bottom: 1px solid slate-200
z-index: 50
```

- 左侧：品牌名 `Speaking`，`text-xl font-bold tracking-tight`
- 右侧：导航链接 + CTA 按钮（`bg-brand-600 text-white rounded-lg px-4 py-2`）

### Button

**Primary Button**
```
background: brand-600
color: white
border-radius: 0.75rem (rounded-lg)
padding: py-2 px-4 (small) / py-2.5 px-5 (medium) / py-3 px-6 (large)
font-weight: 600
hover: bg-brand-700
disabled: opacity-50
shadow: sm
```

**Secondary Button**
```
background: white
border: 1px solid slate-200
color: slate-600
hover: bg-slate-50
```

**Ghost Button**
```
background: transparent
color: slate-400
hover: bg-slate-100 hover:text-slate-600
```

### Video Card

```
width: 100%
border: 1px solid slate-200
border-radius: 0.75rem
overflow: hidden
cursor: pointer
```

- 缩略图区域：`aspect-video`，相对定位，底部右侧显示时长标签
- 时长标签：`absolute bottom-2 right-2`，`bg-black/80 text-white text-xs rounded px-1.5 py-0.5`
- 内容区：`p-3`
- 标题：`text-sm font-medium`，最多两行 (`line-clamp-2`)
- 标签区：flex 布局，难度标签 + 主题标签

### Video Player

- 播放区域：`flex-1 bg-black`，居中显示视频
- YouTube 播放器：`w-full aspect-video`
- 本地视频：`max-h-full max-w-full`
- 字幕覆盖层：`absolute bottom-16 left-0 right-0`，`bg-black/70 rounded-lg px-6 py-3`

### Subtitle Panel

- 右侧边栏：`w-full lg:w-2/5`，`bg-white border-l border-slate-200`
- 移动端：底部抽屉，`fixed bottom-0 left-0 right-0 z-20 max-h-[45vh] rounded-t-xl shadow-xl`
- 字幕条目：左边框高亮激活态 (`border-l-2 border-l-brand-500 bg-brand-50`)
- 单词可点击：`cursor-pointer hover:bg-brand-100 rounded`

### Speaking Practice Panel

- 底部控制栏：`bg-slate-900 border-t border-slate-700 px-4 py-4`
- 录音按钮：`bg-red-600`，录音中 pulse 动画
- 评分圆环：SVG circle，`stroke-dashoffset` 动画，直径 56px
- 再练/下一句：flex 布局，两个按钮各占 50%

### Quiz Panel

- 选择题选项：`flex items-center gap-2 rounded-md border px-3 py-2`
- 选中态：`border-brand-500 bg-brand-50 text-brand-700`
- 单选圆圈：`h-4 w-4 rounded-full border`
- 填空输入：`w-full rounded-md border border-slate-200 px-3 py-2`

### Word Lookup Popup

```
position: fixed, bottom-4 right-4
width: 320px
background: white
border: 1px solid slate-200
border-radius: 0.75rem (rounded-xl)
padding: 1rem (p-4)
shadow: xl
z-index: 30
```

### Stats Card

```
border: 1px solid slate-200
border-radius: 0.75rem (rounded-xl)
background: white
padding: 1rem (p-4)
```

- 图标 + 标签：`text-xs text-slate-500`
- 数值：`text-2xl font-bold text-slate-900`

### AI Summary Card

```
border: 1px solid brand-100
border-radius: 0.75rem (rounded-xl)
background: gradient-to-br from-brand-50 to-white
padding: 1.25rem (p-5)
```

---

## Motion

### Philosophy

动效应当**功能性优先**，避免装饰性动画。所有动画使用 `ease` 缓动函数，时长控制在 150ms-300ms 之间。

### Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 150ms | hover 颜色、边框变化 |
| `--duration-normal` | 200ms | 阴影、背景变化 |
| `--duration-slow` | 300ms | 尺寸变化、页面过渡 |
| `--ease-default` | ease | 默认 |
| `--ease-smooth` | cubic-bezier(0.4, 0, 0.2, 1) | 细腻过渡 |

### Loading

- 全局加载：`animate-spin`，`border-2 border-brand-600 border-t-transparent`
- 按钮加载：图标旋转 + 文字变化

### Score Ring Animation

```css
transition: stroke-dashoffset 0.6s ease;
```

### Recording Pulse

```
animate-pulse (Tailwind)
```

### Hover Effects

- 视频卡片：`hover:border-brand-300 hover:shadow-lg transition-all`
- 按钮：`hover:bg-brand-700`
- 导航链接：`hover:text-slate-900`

### Page Transitions

- 客户端路由使用 Next.js 默认过渡，不添加额外动画
- Toast 通知使用 sonner 默认滑入滑出动画

---

## Interaction

### Focus States

- 输入框：`focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500`
- 按钮：`focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2`
- 链接：`focus:underline`

### Keyboard Shortcuts

视频播放页支持以下快捷键：

| 按键 | 功能 |
|------|------|
| `Space` | 播放/暂停 |
| `← / →` | 后退/前进 5 秒 |
| `↑ / ↓` | 上/下一句字幕 |

快捷键提示面板：点击 ⚡ 图标展开，显示在头部下方右侧。

### Touch Targets

- 按钮最小尺寸：44px × 44px
- 字幕条目：`w-full`，整行可点击
- 单词点击：每个单词为独立可点击区域

### Feedback

- 操作成功：sonner toast，`position: top-center`
- 操作失败：红色 toast 或行内错误文字
- 加载中：旋转图标或骨架屏（空状态）

### Disabled States

- 按钮：`opacity-50 cursor-not-allowed`
- 视频卡片（未就绪）：`disabled:cursor-default disabled:hover:border-slate-200`

---

## Voice

### Tone

- **专业但不冷漠**：像一位经验丰富的语言教练
- **鼓励性**：用积极语言反馈学习进度（"Great job!" / "Keep practicing!"）
- **简洁直接**：避免冗长说明，学习路径自解释

### Microcopy Examples

| Context | Copy |
|---------|------|
| 空状态标题 | "暂无视频" / "还没有视频" |
| 空状态说明 | "视频正在准备中，请稍后再来" / "粘贴一个链接，开启第一课。" |
| 按钮 | "开始学习"、"跟读这句"、"再练一次" |
| 加载 | "AI 思考中..."、"Preparing subtitles, about 5-10 seconds..." |
| 成功 | `"{word}" saved to vocabulary` |
| 错误 | "无法访问麦克风，请检查权限" |

---

## Anti-patterns (Don'ts)

1. **不要使用纯黑色背景**：视频区域使用 `bg-black` 是允许的，但 UI 面板始终使用 `slate-900` 或白色，避免 #000 的刺眼感。

2. **不要用过重的阴影**：卡片默认无阴影，hover 时才出现 `shadow-lg`。禁止在静态卡片上使用 `shadow-xl` 或 `shadow-2xl`。

3. **不要破坏视频沉浸感**：播放页除了顶部工具栏和底部练习面板，不要在视频上方叠加任何常驻 UI。

4. **不要使用超过两种字体**：始终使用系统字体栈，不要引入 Google Fonts 或自定义字体文件。

5. **不要过度使用品牌色**：brand-600 仅用于主按钮、激活态和链接。禁止用于大背景色块。

6. **不要忽略移动端体验**：视频播放页在移动端必须可正常使用，字幕面板转为底部抽屉，不能出现横向滚动。

7. **不要使用模糊的占位图**：视频缩略图加载失败时显示播放图标，不要用灰色占位块。

8. **不要在 toast 中使用按钮**：toast 仅用于纯信息提示，不承载操作按钮。

9. **不要混合圆角风格**：所有圆角使用 Tailwind 标准值（0.375rem / 0.5rem / 0.75rem / 1rem），禁止出现 2px 或 20px 等非标准圆角。

10. **不要使用过细的边框**：分割线至少 1px，禁止使用 hairline (0.5px) 边框。

---

## System Prompt

你是一个专业的前端开发工程师，正在使用 Next.js 14 + Tailwind CSS 开发 Speaking 英语口语练习应用。请严格遵循以下设计系统规范：

- 使用 Tailwind CSS 工具类编写所有样式，不使用 CSS-in-JS
- 品牌主色为蓝色系（brand-50 到 brand-950，核心为 brand-600 #2563eb）
- 界面风格：大量留白、圆角卡片、柔和阴影、清晰的信息层级
- 图标使用 lucide-react，不使用 emoji 或其他图标库
- 所有文字使用系统字体栈
- 组件必须考虑响应式，移动端体验不低于桌面端
- 交互反馈使用 sonner toast，位置 top-center
- 动画克制，仅使用 Tailwind 内置 transition 和 animate 类
