# ADR-0016: 可访问性（D12）— 浅层落地：3 项小修 + 全局聚焦环默认值

- **Status**: Accepted - 2026-08-30

## Context

产品设计规划-2026-08 §4-D12 要求：

- 播放器快捷键统一（空格/←→/↑↓/F/S/M）
- 考试词高亮加形状区分（下划线/圆点），不依赖颜色
- 所有图标按钮 aria-label
- focus ring 统一审查
- Lighthouse a11y ≥ 90

工作量为 M（2 天），不引入 axe-core / jest-axe / 完整 a11y 框架等重型基础设施。

## Decision

### 考试词高亮形状区分（已落 e1b2e5c）

- 7 个 `WORD_COLOR_CLASSES`（slate/green/blue/purple/orange/red/rose）各加 `decoration-{color}-400 decoration-dotted underline-offset-2`。
- 颜色不变（避免打乱视觉设计），形状加 dotted underline——色盲用户仍能识别"这是考试词"。
- `DOT_COLOR_CLASSES`（点号版本）不动。

### 快捷键统一

- 已在 D1 阶段于 `useVideoPlayer.ts:499-557` 实施：D1 决策把 ↑↓ 改音量（原字幕导航由点列表承担）。
- D12 复审确认覆盖：空格 / ← → / ↑ ↓ / M / F / C / S。
- 跳过条件：focus 在 input/textarea/button/select/anchor 时不响应；修饰键 (ctrl/meta/alt) 不响应。

### aria-label 扫描与修复

- 自写 Node 脚本 `audit-aria.mjs` 扫描 82 个含 `lucide-react` 的 .tsx 文件，启发式：`<button>` 内含已知 lucide 图标名但无 `aria-label`/文本 → 报告。
- **结果：仅 1 个真问题**（admin 后台 placeholder 通知铃铛 `AdminTopbar.tsx:167`）——全局已有较完整的 a11y 意识。
- 修复：加 `aria-label="通知"`、`aria-hidden` on icon、`type="button"`、显式 `focus-visible:ring-2 focus-visible:ring-brand-500`。

### focus ring 统一审查

- 不强制每按钮写 `focus-visible:ring-*`：全局 `globals.css:320-323` 已有 `*:focus-visible { outline: 2px solid #ff5a1f; outline-offset: 2px; }`，所有可聚焦元素自动获得 brand 描边。
- `:focus:not(:focus-visible) { outline: none; }` 避免鼠标点击时残留描边。
- 审计结果：116 个 `<button>` 中只有 1 个显式声明 focus-visible（AdminTopbar 修复时加上以与其它图标按钮保持视觉一致），其余依赖全局默认值。

### Lighthouse a11y 跑分

- 跑 `/login`、`/`、`/watch/[id]` 三个核心页面（mobile 仿真）。
- 全部 **96/100**，超过 ≥ 90 达标线。
- 唯一失败项：`color-contrast`。3 处都是 `text-brand-500` (#ff5a1f) 或 `text-muted-soft` (#a1a1za) 在 9-12pt 小字号上对比度 < 4.5:1。
- **未修复**：品牌色 token 调整牵动全站视觉，超出 D12 工作量；作为 polish 项留给后续。

## Consequences

- 验证：Lighthouse mobile 3 页都 96/100（达标线 90），a11y 排名"良好"。
- D12 范围内 5 项全部完成：1/2/3/4/5。
- 不引入新依赖：未加 axe-core / jest-axe，理由是当前手工审计已能满足 ≥ 90 达标线；CI 集成 axe 是 P2 后续（建议下个 Phase）。
- 全局 focus ring 设计：D12 借此机会确立"globals.css 统一定义 + 特殊情况显式覆盖"模式，后续组件设计复用。

## 关联

- D1（播放器控制条）：D12 复审并确认其快捷键统一已满足 D12 验收。
- 规划文档：§4-D12
- 已知 polish：品牌色 token 对比度（可选后续）
