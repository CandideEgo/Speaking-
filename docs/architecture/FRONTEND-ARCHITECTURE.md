# 前端架构文档

> Speaking 项目前端基于 Next.js 14 App Router + React 18 + Tailwind CSS + Zustand 构建。
> 本文档描述页面结构、状态管理、组件契约、API 模式及样式约定。

---

## 1. 页面结构与路由

### App Router 层级

```
src/app/
├── layout.tsx                    # 根布局：ThemeProvider + SidebarProvider + ThemedToaster
├── globals.css                   # 全局样式、CSS 变量、组件类
├── (main)/                       # 路由组：带侧边栏 + 顶栏的主布局
│   ├── layout.tsx                # Sidebar + TopBar + <main> 容器
│   ├── page.tsx                  # 首页 (/)
│   ├── browse/page.tsx           # YouTube 频道发现 (/browse)
│   ├── community/page.tsx        # 社区精选 (/community)
│   ├── dashboard/page.tsx        # 学习面板 (/dashboard)
│   ├── vocabulary/page.tsx       # 词汇本 (/vocabulary)
│   ├── redeem/page.tsx           # 兑换邀请码 (/redeem)
│   ├── admin/page.tsx            # 管理后台 (/admin)
│   └── watch/[id]/page.tsx       # 观看页 (/watch/:id) — 核心页面
├── login/page.tsx                # 登录页（无侧边栏）
└── register/page.tsx             # 注册页（无侧边栏）
```

### 认证 vs 公开路由

- **公开路由**：`/login`、`/register` — 不在 `(main)` 路由组内，无 Sidebar/TopBar 包裹
- **主站路由**：`(main)` 路由组下所有页面 — 统一由 `MainLayout` 提供侧边栏 + 顶栏
- **认证守卫**：前端通过 `getToken()` 检查 JWT 是否存在，在需要登录的操作（口语练习、词汇保存、测验提交）时调用 `requireAuth()` 跳转 `/login`；无全局路由守卫中间件

### 布局嵌套

```
RootLayout (ThemeProvider + SidebarProvider)
  └─ (main)/MainLayout (Sidebar + TopBar)
       └─ 各页面内容
  └─ login/register 页面（直接渲染，无侧边栏）
```

Watch 页面 (`/watch/[id]`) 虽在 `(main)` 路由组内，但自身渲染为全屏深色沉浸式布局，视觉上覆盖了 Sidebar/TopBar。

---

## 2. Watch 页面架构

Watch 页面是整个应用的核心。经过 Phase 8 重构，已从 454 行单文件组件精简为 <150 行的 hooks 驱动编排器。

### 当前架构（Phase 8 重构后）

原 14 个 useState 已提取至自定义 hooks：

| Hook | 封装的状态/逻辑 |
|------|----------------|
| `useVideoPlayer` | video、playbackMode、progress、播放控制 |
| `useSubtitleSync` | currentSubtitleIndex、自动滚动、字幕导航 |
| `useWordLookup` | selectedWord、wordMeaning、单词查询 |
| `useSpeech` | activeSubtitleId、口语练习状态 |
| `useSentenceNavigation` | 句子导航、键盘快捷键 |
| `useQuiz` | quizQuestions、quizAnswers、quizSubmitted、quizScore |

Zustand store (`useWatchStore`) 仅管理 1 个状态：

| 状态 | 类型 | 用途 |
|------|------|------|
| `subtitleMode` | `SubtitleMode` | 当前学习模式（8 种） |

### 数据流

```
URL params (id)
  │
  ├─→ api<VideoWithSubtitles> ──→ video state
  │                                ├─→ playbackMode (根据 video.status 决定)
  │                                └─→ subtitles 传给各子组件
  │
  ├─→ api<QuizResponse> ──→ quizQuestions state
  │
  ├─→ useWatchStore ──→ subtitleMode ──→ 决定右侧面板渲染哪个模式组件
  │
  └─→ 播放器 onTimeUpdate ──→ currentSubtitleIndex ──→ 字幕高亮 + 自动滚动
```

### 组件树

```
WatchPage
├── Header (内联)
│   ├── 返回按钮
│   ├── 视频标题
│   ├── 双语/英文切换
│   └── 快捷键按钮 + 弹窗
├── Video Player Area
│   ├── <video> (本地播放，HTML5)
│   └── 占位符 (loading)
├── Current Subtitle Display (内联)
│   └── 逐词可点击 + 中文翻译
├── PlaybackControls
├── Speaking 流程 (内联：activeSubtitle 时录音/评分)
├── Right Panel (可折叠)
│   ├── SubtitleModeTabs (Zustand 驱动：双语/英文/中文 三模式)
│   ├── Panel Tabs (字幕 / 测验)
│   └── SubtitleList + QuizPanel
├── Bottom Progress Bar (fixed)
└── WordTooltip (条件渲染：selectedWord 存在时)
```

> **架构变更 (2026-06)：** Watch 页已精简。`YouTubePlayer` 与 YouTube IFrame 嵌入已移除（统一本地 `<video>` 播放）；`SpeakingPanel` 拆为内联 speaking 流程；5 个练习模式组件（DictationMode/FillBlankMode/ReadingMode/TranslateMode/FlashcardMode）已下线，`subtitleMode` 收窄为 `bilingual | english | chinese` 三种字幕显示模式。收藏与笔记从 `localStorage` 迁至服务端（`/videos/{id}/favorite`、`/videos/{id}/note`）。

### 关键副作用 (useEffect)

| 触发条件 | 行为 |
|---------|------|
| `[id]` | 加载视频数据 + 测验数据 |
| `[currentSubtitleIndex]` | 自动滚动字幕到视口中心 |
| `[video?.status, id]` | 处理中视频轮询（3 秒间隔） |
| `[playbackMode, video]` | 播放进度追踪（1 秒间隔） |
| 全局键盘事件 | Space/方向键控制播放和字幕导航 |

---

## 3. 学习模式组件契约

### 模式总览

> 仅保留三种字幕显示模式（M-01~M-03）。阅读/听写/填空/闪卡/翻译模式（M-04~M-08）已于 2026-06 下线，组件移除。

| 模式 | 组件 | 接收数据 | 自管理状态 | 交互方式 |
|------|------|---------|-----------|---------|
| 双语 | SubtitleList | `subtitles[]` + 回调 | copiedId, favorited | 点击字幕跳转、单词查询、口语练习 |
| 英文 | SubtitleList | 同上（showEnglishOnly=true） | 同上 | 同上 |
| 中文 | SubtitleList | 同上 | 同上 | 同上 |

### 组件契约规则

1. **数据来源**：SubtitleList 从 WatchPage 接收 `subtitles` 数据，不自行请求 API
2. **状态自治**：组件管理自己的交互状态，不向父组件回传
3. **单词查询**：SubtitleList 接收 `selectedWord` + `onWordClick` 回调，由 WatchPage 统一处理查词和 TTS
4. **TTS 播放**：组件自行调用 `SpeechSynthesisUtterance`，不依赖全局状态
5. **样式约束**：与 Watch 页面沉浸式风格一致

### 如何添加新学习模式

1. 在 `stores/watchStore.ts` 的 `SubtitleMode` 类型中添加新模式 key
2. 在 `components/SubtitleModeTabs.tsx` 的 `modes` 数组中添加 `{ key, label, icon }` 条目
3. 创建新组件文件 `components/NewMode.tsx`，遵循以下接口模式：

```typescript
// 单条字幕模式（如听写、填空）
interface NewModeProps {
  subtitle: Subtitle;  // 当前字幕
}

// 多条字幕模式（如阅读、闪卡、翻译）
interface NewModeProps {
  subtitles: Subtitle[];
  selectedWord?: string | null;      // 可选：需要单词查询时
  onWordClick?: (word: string) => void;  // 可选：单词点击回调
}
```

4. 在 `watch/[id]/page.tsx` 的右侧面板区域添加条件渲染：

```tsx
{subtitleMode === 'newmode' && (
  <NewMode subtitles={video.subtitles} />
)}
```

5. 组件内部使用 `bg-navy-*` / `text-white/*` 深色样式，保持视觉一致

---

## 4. 状态管理策略

### 本地状态 (useState) — 默认选择

适用于：
- **组件私有 UI 状态**：弹窗开关、输入值、选中索引
- **短暂状态**：表单输入、hover/focus 状态
- **不跨组件共享的数据**：测验答案、播放状态

当前 Watch 页面的 14 个 useState 均属此类，但部分状态（如 `currentSubtitleIndex`、`selectedWord`）被多个子组件消费，是拆分时需要提升的候选。

### Zustand Store — 跨组件共享状态

当前仅 `useWatchStore` 管理 `subtitleMode`，因为：
- `SubtitleModeTabs` 写入该状态
- Watch 页面右侧面板读取该状态决定渲染哪个模式组件
- 两者无直接父子关系（通过 layout 间接嵌套）

**何时使用 Zustand**：
- 状态需要被非父子关系的组件共享
- 状态需要在页面切换后持久（当前未配置 persist middleware）
- 多个独立组件需要读写同一状态

**何时不用 Zustand**：
- 父子组件间可通过 props 传递的状态
- 仅在单个组件内使用的 UI 状态
- 页面级数据（如 `video`）— 通过 props 传递更清晰

### 未来状态提升建议

| 状态 | 当前位置 | 建议去向 | 原因 |
|------|---------|---------|------|
| `subtitleMode` | Zustand | 保持 | 已跨组件共享 |
| `currentSubtitleIndex` | WatchPage useState | Zustand 或 Context | 被 SubtitleList、PlaybackControls、各模式组件消费 |
| `selectedWord` + `wordMeaning` | WatchPage useState | Context | 被 SubtitleList、ReadingMode、WordTooltip 消费 |
| `video` | WatchPage useState | Context | 被几乎所有子组件消费 |
| `playbackMode` | WatchPage useState | Context | 被播放器、PlaybackControls 消费 |

---

## 5. API 客户端模式

### api.ts 封装

`lib/api.ts` 提供统一的 HTTP 客户端：

```typescript
api<T>(path: string, options?: RequestInit): Promise<T>
```

**核心机制**：

1. **基础 URL**：`NEXT_PUBLIC_API_URL` 环境变量，默认 `http://localhost:8000`
2. **Token 管理**：
   - 内存变量 `authToken` + `localStorage` 双层缓存
   - `setToken(token)` — 登录时写入内存 + localStorage
   - `setToken(null)` — 登出时清除
   - `getToken()` — 优先读内存，fallback 到 localStorage
3. **请求头自动注入**：
   - 非 FormData 请求自动加 `Content-Type: application/json`
   - Token 存在时自动加 `Authorization: Bearer <token>`
4. **错误处理**：
   - 网络异常 → `Error('网络连接失败，请检查网络或稍后重试')`
   - HTTP 错误 → 解析 `response.json().detail`，fallback 到 `'请求失败'`
5. **媒体 URL**：`mediaUrl(path)` 将相对路径转为完整 URL

### 调用模式

```typescript
// GET 请求
const video = await api<VideoWithSubtitles>(`/api/v1/videos/${id}`);

// POST JSON
await api('/api/v1/vocabulary', { method: 'POST', body: JSON.stringify(data) });

// POST FormData（文件上传）
const form = new FormData();
form.append('audio', blob, 'recording.webm');
await api('/api/v1/speaking/practice', {
  method: 'POST',
  body: form,
  headers: {} as Record<string, string>,  // 跳过 Content-Type 自动设置
});
```

### 已知问题

- ~~**无 Token 过期处理**~~：✅ 已解决 — jwt.ts + api.ts 过期检查 + 401 自动登出
- ~~**无请求取消**~~：✅ 已解决 — AbortController 支持
- ~~**无重试机制**~~：✅ 已解决 — 5xx 自动重试 2 次（1s、2s 退避），401 不重试
- **headers 类型断言**：FormData 场景使用 `{} as Record<string, string>` 绕过类型检查（低优先级）

---

## 6. 样式约定

### Tailwind 配色体系

项目定义了两组配色：

| 语义名 | 浅色值 | 深色值 | 用途 |
|--------|--------|--------|------|
| `ink` | `#141413` | — | 主文本 |
| `canvas` | `#faf9f5` | — | 页面背景 |
| `coral` | `#cc785c` | — | 品牌强调色、CTA |
| `cream-soft` | `#f5f0e8` | — | 浅色卡片背景 |
| `cream-card` | `#efe9de` | — | 浅色卡片背景（深一层） |
| `navy` | `#181715` | — | 深色背景（Watch 页面） |
| `navy-elevated` | `#252320` | — | 深色浮起层 |
| `navy-soft` | `#1f1e1b` | — | 深色柔和层 |
| `hairline` | `#e6dfd8` | — | 边框线 |

### 双主题现状

**浅色主题**（主站页面）：
- 背景：`bg-canvas`（暖白 `#faf9f5`）
- 文本：`text-ink`（深黑 `#141413`）
- 卡片：`bg-cream-card` / `bg-cream-soft`
- 边框：`border-hairline`
- 侧边栏/顶栏：`bg-canvas` + `border-hairline`

**深色主题**（Watch 页面）：
- 背景：`bg-navy`（深棕黑 `#181715`）
- 文本：`text-white` + 透明度变体（`text-white/80`、`text-white/40`）
- 浮起层：`bg-navy-elevated`
- 边框：`border-white/10`
- 强调：`text-coral` / `bg-coral/15`

### 主题切换机制

- `useTheme` hook 管理 `light` / `dark` 状态
- `ThemeProvider` 通过 Context 向下传递
- 切换时在 `<html>` 上添加/移除 `dark` class
- CSS 变量在 `:root` 和 `.dark` 中分别定义
- 初始加载时添加 `no-transitions` class 防止闪烁

### 主题冲突与调和

Watch 页面**硬编码**深色样式（`bg-navy`、`text-white/*`），不依赖 `dark` class 切换。这意味着：

1. Watch 页面始终深色，不受全局主题切换影响
2. 主站页面使用 CSS 变量（`bg-canvas`、`text-ink`），受 `dark` class 控制
3. 两套样式体系独立运行，Watch 页面的组件类（如 `btn-secondary-dark`、`card-dark`）专用于深色场景

**建议**：未来统一为 CSS 变量方案，Watch 页面通过 `dark` class 自动切换，避免硬编码 `text-white/*`。

### 组件样式类

`globals.css` 中定义了可复用的组件类：

| 类名 | 用途 |
|------|------|
| `container-page` | 页面容器（max-w-7xl 居中） |

> **Note:** btn-\*, card-\*, input-field, badge-pill/badge-coral 等 CSS 类已迁移至 React 组件（Button/LinkButton, Card, Input/Textarea/Select），不再出现在 globals.css 中。

### 字体

| 用途 | 字体族 | CSS 变量 |
|------|--------|---------|
| 标题 | Cormorant Garamond | `font-display` |
| 正文 | Inter | `font-sans` |
| 代码 | JetBrains Mono | `font-mono` |

---

## 7. Watch 页面拆分（已完成）

Phase 8 重构已完成 Watch 页面拆分，从 454 行单文件精简为 <150 行 hooks 驱动编排器。

### 当前结构

```
watch/[id]/
├── page.tsx                    # < 150 行，组合编排
├── hooks/
│   ├── useVideoPlayer.ts       # 视频加载 + 播放控制 + 状态轮询
│   ├── useSubtitleSync.ts      # currentSubtitleIndex + 自动滚动
│   ├── useWordLookup.ts        # selectedWord + wordMeaning + 词汇保存
│   ├── useSpeech.ts            # 口语练习状态
│   ├── useSentenceNavigation.ts # 句子导航 + 键盘快捷键
│   └── useQuiz.ts              # 测验逻辑
└── (组件复用自 components/ 目录)
```

### 重构要点

1. **Hook 提取**：14 个 useState → 6 个自定义 Hook，组件只管渲染
2. **authStore**：Zustand authStore 统一管理 token/user/isAuthenticated
3. **Safe JWT**：jwt.ts 纯函数解码，base64url 处理，异常安全
4. **API 增强**：过期检查 + 401 自动登出 + AbortController + 5xx 重试
