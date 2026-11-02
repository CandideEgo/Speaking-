# SeeWord 前端 UI 与交互提升方案

日期：2026-11-01
状态：待评审、待实施。本文只是选型与实施计划，不是已交付能力。
代码基线：`master af66755c`。文中调用点数量按该基线实测，改代码后会漂移，实施时以 `grep` 为准。
范围：**仅前端组件层与交互层**。不改后端契约、不改路由、不改设计 token 的数值与品牌色。

配套材料：[视觉、布局与交互评审](ui-review-2026-10-21.md)、[设计系统用法](../frontend/DESIGN.md)、[设计依据](../DESIGN.md)。

## 1. 结论

| 问题 | 决定 |
| --- | --- |
| 要不要换整套 UI 库（Ant Design / MUI / Mantine） | **不要**。它会与 `.user-ui` 双层主题、语义 token、9 条设计门禁正面冲突，包体与改造成本都不可回收 |
| 要不要引入无样式原语层 | **要**。只补交互型组件（Select/Dialog/Menu/Popover/Drawer/Tooltip），UI 视觉继续由现有 token 决定 |
| 选哪家原语 | **Base UI 1.9.x**，经 shadcn/ui 以 copy-paste 方式落到仓库内 |
| 交互提升靠什么 | **平台能力优先**：CSS `transition` + `linear()` 缓动、View Transitions API、WAAPI。不新增动画运行时；现有 GSAP 只保留在编排型动画处 |
| 现有门禁 | 9 条规则**一条不改**，也不新增白名单。这是本次实施的验收条件，不是可选项 |

一句话：缺的不是"好看的组件"，是**交互原语**——键盘状态机、焦点管理、ARIA 语义、移动端手势。这些自己写成本高、回归多。

## 2. 现状（代码事实）

### 2.1 组件缺口

| 现有组件 | 调用点 | 现状 | 缺口 |
| --- | --- | --- | --- |
| [`components/ui/Select.tsx`](../frontend/src/components/ui/Select.tsx) | 11 个文件 / 18 处 | 原生 `<select>` 的样式包装 | 不可搜索、无分组、无多选、无键盘高亮、选项无法自定义渲染 |
| [`components/common/Modal.tsx`](../frontend/src/components/common/Modal.tsx) + [`hooks/useModalFocus.ts`](../frontend/src/hooks/useModalFocus.ts) | 7 个文件 / 8 处 | 自写 focus trap、Escape 关闭、焦点归还 | 无背景 `inert`/滚动锁定、无嵌套对话框、无关闭动画、无移动端 sheet 形态 |
| [`components/ui/TabPills.tsx`](../frontend/src/components/ui/TabPills.tsx) | 11 个文件 / 14 处 | 视觉组件，`default/ghost/chips` 三变体 | 无 `tablist` 键盘语义；但多数用法是**筛选 chip**，不是真 Tab——不应一律套 Tab 语义，见 §4.2 |
| [`components/admin/ui/AdminDropdown.tsx`](../frontend/src/components/admin/ui/AdminDropdown.tsx) | 2 个文件 | 自定义下拉 | 缺 APG 菜单键盘语义（方向键、typeahead、子菜单、外点关闭的焦点归还） |
| [`components/admin/ui/AdminTabs.tsx`](../frontend/src/components/admin/ui/AdminTabs.tsx) | 1 个文件 | 自定义 Tab | 同上 |
| 无 | — | 没有 Popover / HoverCard / Tooltip / Command / Drawer 原语 | 观看页点词、后台 ⌘K 搜索都没有可用底座 |

其它现状：`role="tab"` 全仓 2 处、`aria-live` 4 处、原生 `<dialog>` 2 处、`prefers-reduced-motion` 4 处、原生 `<select>` 12 处。无障碍目前是"局部做了"，不是系统性的。

### 2.2 依赖现状

已装：`sonner`（toast）、`lucide-react`（图标）、`gsap`（仅 1 个文件使用）、`recharts`、`tailwind-merge`、`clsx`、`zustand`。

**`package-lock.json` 中没有任何 `@radix-ui/*` 或 `@base-ui*`，仓库也没有 `components.json`。** 这意味着原语层是全新引入，**不存在迁移旧组件的包袱**——比多数项目起点更好。

`tsconfig.json` 的 `@/*` → `./src/*`，与 shadcn 默认别名一致，无需改动。

另有一半的别名已经在了：[`globals.css`](../frontend/src/app/globals.css) 的 `@theme` 里已有 `--color-background`、`--color-border`（→ `hairline`）、`--color-surface`（→ `surface-soft`），`@theme` 也已定义 `--radius-sm/md/lg/pill`。所以 `rounded-md`/`rounded-lg` 会直接套用本仓库的圆角刻度，**不需要**再覆盖半径变量。缺的只是下面 §4.1 表里剩下的几个名字。

## 3. 选型

### 3.1 2026 年的实际格局

| 方案 | 现状 | 判断 |
| --- | --- | --- |
| **Base UI** | v1.9.0（2026-10-09），35 个无样式组件，使用原生 Popover API + CSS Anchor Positioning，无 Floating UI 运行时 | **选它** |
| **shadcn/ui** | 2026-07 起新项目**默认 Base UI**；Radix 全量支持、不弃用；React Aria 为第三底座（`init --base aria`）。CLI 4.x | **作为分发方式**，不当作库依赖 |
| **Radix Primitives** | 被 WorkOS 收购，部分组件更新放缓；`asChild` 组合模型依然好用 | 不新引入；若日后某个组件 Base UI 缺，可作为备选 |
| **React Aria**（Adobe） | a11y 最严谨（WCAG 2.2 AAA、i18n、触屏适配），API 最重，`render` prop 而非 `asChild` | 仅在需要硬性合规时局部引入 |
| Ant Design / MUI / Mantine | 自带完整样式体系 | 排除：与语义 token、`.user-ui` 暗色变量、门禁规则 2/3/5/6 冲突 |

### 3.2 为什么是 Base UI + copy-paste

1. **底座不会被弃用**：shadcn 已把 Base UI 设为默认，Radix 与其并行维护，任一方向都有退路。
2. **代码归仓库所有**：shadcn 把组件源码写进 `src/components/ui/`，正好落在 `check-design-system.mjs` 的扫描范围里，能被门禁约束；如果换成 npm 包的样式组件，门禁就管不到。
3. **无 JS 定位运行时**：原生 Popover API + Anchor Positioning 已可用，包体明显小于 Floating UI 方案（约 2.4 kB/组件量级）。
4. **Tailwind v4 一等支持**：shadcn 现已按 v4 的 `@theme inline` 生成，不需要 `tailwind.config`——本仓库本来也没有。

不选 React Aria 的理由不是它不好，而是它的 API 体积与本项目的组件数量不匹配：站内是移动优先的学习站，不是企业表单系统，Base UI 已满足 APG 键盘规范。

## 4. 实施计划

### 4.1 Phase 0 · 基础设施（约 0.5–1 天）

**目标**：让原语层能进仓库而不触发任何门禁。

1. **手工创建 `frontend/components.json`**，不要让 CLI 自动 `init`。原因：`shadcn init` 会往 `globals.css` 追加自己的 `:root` 变量块与 base 样式，与本仓库 `@theme` + `:root/.dark` 的双主题结构冲突。手写配置后再 `add` 单个组件，可控。

   ```json
   {
     "style": "new-york",
     "rsc": true,
     "tsx": true,
     "tailwind": { "config": "", "css": "src/app/globals.css", "baseColor": "neutral", "cssVariables": true },
     "aliases": { "components": "@/components", "ui": "@/components/ui", "lib": "@/lib", "utils": "@/lib/utils" }
   }
   ```

   `style` 与 `baseColor` 取 CLI 当时的默认值即可，本项目的视觉全由 token 决定，这两个字段只在生成源码时影响预置 class。

2. **在 `globals.css` 增加一层 token 别名**（追加到现有 `@theme` 块内，与既有 token 同构；不改品牌刻度，也不另起 `@theme inline`）。shadcn 组件用的是 `background/foreground/border/ring/primary/muted/popover` 这套名字，需要映射到现有语义 token：

   | shadcn 变量 | 映射到 | 现状 |
   | --- | --- | --- |
   | `--background` | `var(--canvas)` | 已存在 `--color-background` |
   | `--border` / `--input` | `var(--hairline)` | `--color-border` 已有，补 `--color-input` |
   | `--foreground` | `var(--ink)` | 待补 |
   | `--card` / `--popover` | `var(--surface-card)` | 待补 |
   | `--ring` | `var(--focus-ring)` | 待补 |
   | `--primary` | `#c2410c`（即 `--color-action-primary`） | 待补 |
   | `--destructive` | `var(--error)` | 待补 |

   **关键**：`--primary` 必须指向 `action-primary` 而不是 `brand-500`。shadcn 按钮默认白字，用 `#ff5a1f` 会成为设计门禁第 7/9 条要拦的那类对比度问题。

   **已知命名冲突**：仓库已有 `--color-muted: var(--muted-c)`，语义是**文字灰**；而 shadcn 的 `muted` 是**面**（`bg-muted` 当浅底）。同名不同义，直接照搬会出现"浅底变成中灰"。两种处理，二选一：
   - 在落库的组件里把 `bg-muted` 手工换成 `bg-surface-soft`、`text-muted-foreground` 换成 `text-muted`（推荐，改动小且可被门禁扫到）；
   - 或给 shadcn 侧用别名 `--color-sh-muted` 之类另起名字。不要覆盖现有 `--color-muted`。

3. **`npm run check` 跑通空转**：此时还没有新组件，门禁应保持全绿。

4. 装依赖：`npx shadcn@latest add <component>` 会自动装 `@base-ui/react`（或对应 primitives）与 `class-variance-authority`。**锁定确切版本**写入 `package.json`，不用 `^`——Base UI 1.x 仍在修 breaking 行为。

### 4.2 Phase 1 · 交互原语补齐（约 3–4 天）

按"用户能感知到"的顺序做，每个组件单独可交付、可回退。

| 顺序 | 组件 | 替换/新增点 | 验收 |
| --- | --- | --- | --- |
| 1 | **Dialog / AlertDialog** | 替换 `common/Modal` 的实现，保持现有 props 形状（`open/onClose/title/footer/maxWidth`），7 个文件 8 处调用不改写法 | 键盘走查：Tab 循环、Escape、关闭后焦点回触发按钮；背景不可聚焦；嵌套对话框正常 |
| 2 | **Select / Combobox** | 新增可搜索版本，先给后台筛选与观看页设置用；`ui/Select` 保留原生版给"选项极少、移动端更好用"的场景 | 方向键、typeahead、Escape、外点关闭、`aria-expanded` |
| 3 | **Popover / HoverCard / Tooltip** | 观看页点词与悬浮提示；后台信息提示 | 触屏下 HoverCard 不参与（改为点按打开）；焦点可见 |
| 4 | **DropdownMenu** | 替换 `AdminDropdown`，2 个调用点 | 方向键、Home/End、子菜单、Esc 逐层关闭 |
| 5 | **Drawer** | 移动端底部面板：`WatchMoreSheet`、词卡容器 | 下拉关闭 + Escape + 虚拟键盘不遮挡输入；见 ui-review F8 |
| 6 | **ToggleGroup** | 筛选 chip 行（`TabPills variant="chips"` 的调用方），**不是** Tabs | 多选/单选状态、`aria-pressed` |
| 7 | **Tabs** | 仅给真正的分栏切换（`AdminTabs`、设置页） | 左右方向键切换、`aria-selected`、面板关联 |

`TabPills` 的多数调用（11 个文件中大部分）是筛选控件，**保持现状**，只把确实表达"多个互斥视图"的地方换成 Tabs。不做语义上的"一刀切"。

### 4.3 Phase 2 · 动效与过渡（约 2–3 天）

原则：**只动 `transform` 与 `opacity`**，不触发布局；不新增动画库。

| 交互 | 做法 | 落点 |
| --- | --- | --- |
| 词卡展开 / 收起 | Popover + `transform-origin` + 150ms 位移淡入 | 观看页点词 |
| 句子切换 | 50ms 交叉淡入 + 4px 纵向位移 | 字幕轨 |
| 列表骨架 → 内容 | 内容淡入 + 60ms 错位延迟（stagger） | 首页、词汇页、后台列表 |
| 按钮 / 卡片按压 | `active:scale-[0.98]` + `transition-transform` | `ui/Button`、卡片 |
| 路由过渡 | View Transitions API（同文档）；不支持时无动画降级 | 首页 → 观看页、列表 → 详情 |
| Toast | 已有 sonner，只调位置与时长 | `common/ThemedToaster` |

**降低动效**：所有新增动画必须放在 `@media (prefers-reduced-motion: reduce)` 的关闭分支内，或直接用 Tailwind 的 `motion-reduce:`。仓库现有 4 处同类处理，一致即可。

**GSAP 的边界**：仓库只有 1 个文件用 GSAP，保留。新交互优先 CSS/WAAPI——它们跑在合成线程，不占 INP。不要为了"统一"把 CSS 过渡重写成 GSAP 时间线。

### 4.4 Phase 3 · 可选增强（按需求触发，不排期）

- **Command（⌘K / Ctrl+K）**：全站搜词、搜视频、跳转。收益直观，但需要后端搜索接口支持，属于独立需求。
- **DataTable（TanStack Table + Base UI）**：只有当后台列表真的要排序、筛选、虚拟滚动时才引入；现在 `admin/DataTable.tsx` 够用。
- **`@shadcn/lint`**：agent-first 的 Tailwind v4 设计系统 linter，可补现有 9 条规则的盲区（乱写 padding、自造 variant）。**单独评审**，因为它会新增一条门禁；按仓库规则，"不为让检查变绿而放宽检查器"，新增检查器同样要走评审。

## 5. 与现有门禁的对接

这是本方案最容易翻车的地方，逐条对齐：

| 门禁规则 | 影响 | 处理 |
| --- | --- | --- |
| 1 · `src/app` 不得写容器类 | 无影响 | 新组件不进 `app/` |
| 2 · 禁原始调色板工具类 | shadcn 用语义变量，不违规 | 若个别组件出现 `bg-zinc-*` 默认值，换成映射后的 token |
| 3 · `rounded-*` 白名单 | shadcn 用 `rounded-md/lg/full` | **兼容**，无需改动 |
| 4 · `page.tsx` 不得自写 `<h1>` | 无影响 | — |
| 5 · 禁任意 hex | shadcn 不含 hex | 别名块在 CSS 里，`.tsx` 里不出现 |
| 6 · `bg-white/black` 不当"面"用 | 少数组件的 `bg-popover` 已映射；遮罩 `bg-black/50` 是允许的透明叠加 | 逐组件检查一次 |
| 7 / 9 · `bg-brand-500` + 白字 | `--primary` 映射到 `action-primary`，天然合规 | 见 §4.1 第 2 步 |
| 8 · `(main)` 内自写 `<main>` | 无影响 | — |
| 会话写入门 | 新组件不碰 `localStorage` | 无影响 |

**验收条件**：`npm run check` 全绿，且 `check-design-system.mjs` 的白名单**没有新增条目**。若确实需要新增，先停手讨论——那通常说明 token 映射没做对。

## 6. 风险与退路

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| Base UI 仍在演进 | 1.5–1.9 之间持续修 focus/animation/键盘行为，偶有行为调整 | 锁确切版本；升级单独 PR，跑完整键盘走查 |
| RSC 边界 | 原语全部需要 `"use client"` | 只在交互边界引入，不往服务端组件里塞；现有页面本就多为 client |
| 包体 | 每个原语按需引入 | shadcn 的组件是独立文件，未使用的不会进包 |
| e2e 回归 | Modal 涉及 7 个文件 8 处，抽屉涉及观看页 | 替换后跑相关 spec，尤其是 `watch-*.spec.ts`、`mobile-*.spec.ts` |
| 视觉漂移 | 原语默认样式与本仓库设计的密度不同 | 每个组件落库后按 [DESIGN.md](../frontend/DESIGN.md) 调一次，不照搬默认尺寸 |

**退路**：所有组件都是仓库内源码，删除文件即可回退，没有全局 Provider 依赖，也不改 `package.json` 之外的运行时契约。

## 7. 验收

1. `cd frontend && npm run check` 全绿，白名单零新增。
2. 键盘走查清单（手测，不看截图）：Tab 顺序、Shift+Tab、Escape、方向键、Home/End、关闭后焦点归还。
3. `npx playwright test --project=chromium` 通过；涉及观看页改动的部分补跑 mobile project。
4. 390×844 与 1440×900 两档用 ego-browser 实际打开走查（不是截图比对）。
5. 手机端：底部 Drawer 在软键盘弹起时输入框不被遮挡。

## 8. 明确不做的事

- 不改 `globals.css` 的品牌刻度与 `user-ui.css` 的视觉变量。
- 不引入 Ant Design / MUI / Mantine / Chakra。
- 不一次性全量替换组件——原语与新组件并存，逐个替换。
- 不为了"高级感"整体换肤；[ui-review-2026-10-21](ui-review-2026-10-21.md) 的结论仍成立。
- 不碰后端、接口契约、退役功能。
- 不把 ui-review 里的布局问题（F1 词卡高度预算、F2 短屏首屏、F3 片段任务上下文）混进本方案——那是版式与信息架构问题，需要单独决策。本方案只解决其中的**键盘可达性**（F8）。

## 9. 待确认事项

1. Phase 1 的替换顺序是否认同"Dialog → Select → Popover → Menu → Drawer"。
2. 是否接受 Base UI 作为唯一原语层（即日后 React Aria 只在个别组件上局部引入）。
3. `@shadcn/lint` 是否进入门禁——这会新增一条检查，与"九条规则"的说法冲突，需要明确表述。

## 10. Phase 0 实施记录（2026-11-01）

已落地：

- `frontend/components.json`，`style: base-nova`。依据有两条：`npx shadcn@latest init --help` 显示 `-d, --defaults` 即 `--preset=base-nova`；官方 `schema.json` 的 `style` 枚举是 `base-*` / `radix-*` / `aria-*` 三系，**底座由 style 前缀决定**，没有独立的「base 库」字段。`-b/--base` 的取值是 `base|radix|aria`。
- `globals.css` 的 `@theme` 末尾追加兼容别名（foreground / card / popover / primary / secondary / accent / destructive / input / ring / muted-foreground），未新增 `--color-muted`（见 §4.1 的命名冲突说明）。
- 未执行 `shadcn init`：它会改写 `globals.css`，与 `@theme` + `:root/.dark` 的双主题结构冲突。

验证结果：

- `npm run check` 全绿，`check-design-system.mjs` 白名单**零新增**。
- `npm run build` 通过。
- 临时探针（已删除，未入库）确认 Tailwind v4 的变量 tree-shaking **会跟着 `var()` 链保留**：页面用到 `bg-primary` 时，产物里同时出现 `--color-primary:var(--color-action-primary)` 与 `--color-action-primary:#c2410c`。所以别名可以继续用「引用现有 token」而不是复制字面值。
- 同一探针确认 `.user-ui` 作用域把 `--color-action-primary` 覆盖成 `#0071e3`/`#06c`，即 `bg-primary` 在用户端自动是蓝色、管理端是橙色——不需要为两套主题各建一套别名。

未做：未安装任何依赖。`@base-ui/react`、`class-variance-authority` 等会在第一次 `shadcn add` 时带入，届时按 §4.1 第 4 步锁确切版本。

## 11. Phase 1 实施记录：Dialog（2026-11-01）

交付：

- 新增 [`frontend/src/components/ui/Dialog.tsx`](../frontend/src/components/ui/Dialog.tsx)：Base UI Dialog 的薄封装（Root / Trigger / Portal / Backdrop / Popup / Title / Description / Close），只映射语义 token。
- 重写 [`frontend/src/components/common/Modal.tsx`](../frontend/src/components/common/Modal.tsx)：对外 props（`open / onClose / title / children / footer / closeOnBackdrop / maxWidth / returnFocusRef`）保持不变，7 个文件 8 处调用点未改。
- 依赖：`@base-ui/react` **1.9.0（精确版本，不用 `^`）**。
- `useModalFocus` 保留：`AdminDialog` 与 `WatchMoreSheet` 仍在使用，等这两个也换掉后再删。

三个实测发现（都已写进代码注释）：

1. **`<Dialog.Portal>` 必需。** 不加它，静态页预渲染直接抛 `Dialog.Portal is missing`，生产构建里只显示 `error #26`——所以第一版 `next build` 挂在 `/dialog-probe` 上。
2. **不要给 Popup / Backdrop 加 `data-ending-style:` 过渡。** Base UI 会等 `transitionend` 才卸载；本仓这套类名实测等不到事件，弹层关闭后仍然可见约 2.5 秒（`data-closed` + `data-ending-style` 已挂上，`opacity` 仍是 1）。去掉过渡后 50ms 内即卸载，与旧 Modal 的瞬时卸载一致。动效留到 Phase 2 用 WAAPI / View Transitions 重做。
3. **挂载点必须是 `.user-ui`，不能是 `document.body`。** 用户端把品牌变量收在该作用域里（蓝），管理端才是橙；portal 到 body 会让用户端弹层里的 `bg-action-primary` 按钮变橙。`Modal` 在 effect 里查 `.user-ui`，查不到（管理端）回落 body。

验证（生产构建 + `ego-browser` 实测）：

| 检查 | 结果 |
| --- | --- |
| 打开后焦点进入弹层 | ✓ 焦点落在弹层内首个可聚焦元素 |
| 打开后滚动锁 | ✓ `body` overflow 变为 hidden，关闭后还原 |
| Tab 循环 | ✓ 依次经过框内元素并与端部守卫回环；**必须按人手节奏（约 150ms/次）测**——脚本连打会跑在 Base UI 的 rAF 重定向之前，看起来像逃逸 |
| Escape 关闭 + 焦点归还 | ✓ 关闭后焦点回到触发按钮 |
| `closeOnBackdrop=false` | ✓ Escape 与遮罩点击都不关闭，关闭按钮仍有效 |
| 门禁 | ✓ `npm run check` 全绿，白名单零新增；`npm run build` 通过 |

未执行（当时）：真实页面走查与全量 e2e。原因：本机 `:3000` 的 dev 进程当时已处于 Turbopack 报错状态（所有路由 500），无法在不重启它的情况下跑 dev 站点；本次改用独立端口的生产构建 + 临时探针页验证，探针页已删除。dev 服务重启后已补做真实页面走查，见 11.1。

### 11.1 真实页面走查（同日补做，dev 站点重启后）

路径：`/profile` → 个人资料 → 「更换」→ 更换手机号弹窗。用本机 dev 固定验证码 `1234` 登录。

| 检查 | 结果 |
| --- | --- |
| 桌面渲染（1080×595） | ✓ 标题、关闭按钮、表单、页脚按钮排版正常 |
| 品牌色作用域 | ✓ 「确认更换」是**蓝色**（`.user-ui`），不是管理端的橙——portal 容器选择生效 |
| Tab 顺序 | ✓ 三个输入框 → 取消 → 确认更换 → 守卫 → 关闭 → 回到第一个输入框 |
| Escape | ✓ 200ms 内关闭，`body` 滚动锁还原，焦点回到「更换」按钮 |
| 移动端（390×844） | ✗ → 已修，见下 |

**走查发现的回归**：移动端弹窗宽度是 390px（左右贴边、没有留白）。旧 `Modal` 在遮罩层上带 `p-4`，新实现把外边距丢了。已把 Popup 的基础宽度从 `w-full` 改成 `w-[calc(100%-2rem)]`（`max-w-md` 仍负责封顶），复测 390 视口下宽 358px、左边距 16px、不裁切。

未覆盖：管理端弹窗（需要 admin 账号）、`ConfirmDialog` 的其他调用点、真实手机与读屏。

## 12. Phase 1 实施记录：Select（2026-11-01）

交付：

- 新增 [`frontend/src/components/ui/SelectMenu.tsx`](../frontend/src/components/ui/SelectMenu.tsx)：Base UI Select 的薄封装（Trigger / Value / Icon / Portal / Positioner / Popup / List / Item）。
- 新增 [`frontend/src/hooks/useOverlayContainer.ts`](../frontend/src/hooks/useOverlayContainer.ts)：弹层挂载点收敛成一处，`Modal` 与 `SelectMenu` 共用（用户端挂 `.user-ui`，管理端回落 `body`）。
- 落点：[`HomeFeed`](../frontend/src/components/home/HomeFeed.tsx) 的「难度」「排序」两个下拉，替换掉原生 `<select>` + 手写 Chevron；`user-ui.css` 里随之失效的 `.discover-select` 规则已删除。
- **保留** [`ui/Select.tsx`](../frontend/src/components/ui/Select.tsx)（原生 `<select>` 包装）：选项少、需要在手机上唤起系统选择器的场景继续用它。其余 16 处调用点本次不动。

验证（dev 站点，`ego-browser`，登录态）：

| 检查 | 结果 |
| --- | --- |
| 语义 | ✓ 触发器 `<button role="combobox" aria-expanded>`，面板 `role="listbox"`，选项 `role="option"` + `aria-selected` |
| 方向键 | ✓ ArrowDown 两次，高亮从「全部档位」移到「A2 · ≈高考」 |
| Enter | ✓ 触发器文案更新，URL 变为 `?level=A2`，面板关闭 |
| Escape | ✓ 关闭且值不变 |
| typeahead | ✓ 键入 `C2` 直接高亮并选中，URL 变为 `?level=C2` |
| 外部点击 | ✓ 关闭，焦点回到触发器 |
| 高亮样式 | ✓ `data-highlighted` 生效，背景取 `surface-soft` |
| 作用域 | ✓ 弹层圆角 18px、边框 `#d2d2d7` —— 来自 `.user-ui` 对 `--radius-lg` / `--hairline` 的覆盖，说明挂载点选对了 |

未做/未覆盖：

- **Combobox（可搜索）**：目前只有 Select。等出现长列表（如院校/词书选择）再加。
- 其余 16 处原生 `Select` 未替换——按 §4.2 的分工，"选项少、手机上要系统选择器"的继续用原生。
- 截图未取到：本轮 `Page.captureScreenshot` 连续 CDP 超时（同一环境下弹窗那轮成功过），视觉结论来自计算样式与 DOM，不是看图。

## 13. Phase 1 实施记录：Popover（2026-11-01）

交付：

- 新增 [`frontend/src/components/ui/Popover.tsx`](../frontend/src/components/ui/Popover.tsx)：Base UI Popover 的薄封装（Root / Trigger / Portal / Positioner / Popup / Title / Close），默认非模态。
- 落点：顶部栏的通知铃。[`TopBar`](../frontend/src/components/layout/TopBar.tsx) 把原来的「`relative` 容器 + 手动 toggle」换成 `Popover.Root / Trigger / Portal / Positioner / Popup`，触发器用 `render` 组合现有 `Button`。
- [`NotificationDropdown`](../frontend/src/components/notifications/NotificationDropdown.tsx) 删掉手写的 document 级 `mousedown` / `keydown` 监听、绝对定位与 `role="dialog"`；只保留「打开后把焦点移进面板」这一条，其余交给原语。

验证（dev 站点，`ego-browser`，登录态）：

| 检查 | 结果 |
| --- | --- |
| 触发器语义 | ✓ `aria-expanded` 随开关变化，`aria-haspopup="dialog"` 由原语补上 |
| 面板语义 | ✓ `role="dialog"` + `aria-label="通知"`，内容正常渲染（「通知 / 查看全部 / 暂无通知」） |
| 定位 | ✓ 面板 384px 宽，出现在铃铛下方、右对齐（x=634, y=58） |
| 初始焦点 | ✓ 打开后焦点落在面板内的链接上 |
| Escape | ✓ 100ms 内 `aria-expanded=false`，约 400ms 卸载，焦点回到铃铛 |
| 外部点击 | ✓ 关闭并卸载，焦点回到铃铛 |

未做：

- **Tooltip / HoverCard** 没有引入。全仓目前没有任何 DOM `title` 提示，也没有 hover 浮层，先建原语会是没有消费者的死代码；等出现真实场景（图标按钮提示、词卡悬浮）再接。
- **观看页词卡**（`WordTooltipInline` / `WordCardSheet`）仍是自己的定位实现。它是 588 行、有高度预算约束、且被 4 个 mobile/watch e2e 覆盖的组件，换 Popover 属于独立改动，需要连同 e2e 一起做。

## 14. Phase 1 实施记录：DropdownMenu（2026-11-01）

交付：

- 新增 [`frontend/src/components/ui/DropdownMenu.tsx`](../frontend/src/components/ui/DropdownMenu.tsx)：Base UI Menu 的薄封装（Root / Trigger / Portal / Positioner / Popup / Item）。只落地当前有消费者的部分，Separator / Group / Submenu 等按需再加。
- 重写 [`frontend/src/components/admin/ui/AdminDropdown.tsx`](../frontend/src/components/admin/ui/AdminDropdown.tsx)：对外 props（`items / trigger / align / className / label`）不变，`className` 的落点从包裹 div 改到触发按钮。§4.2 写的「2 个调用点」实测是 **1 个调用点**（[`(admin)/admin/users/page.tsx`](../frontend/src/app/(admin)/admin/(shell)/users/page.tsx)）+ `components/admin/ui/index.ts` 的一处 re-export，后者无需改动。

**顺带修掉的共性缺陷（Popover 与 Select 一并受益）**

1. **关闭后弹层仍在屏上 200–500ms。** 本轮实测：Escape 后 300ms 内面板 `opacity` 仍是 1、`display` 仍是 block（只是 `pointer-events: none`）。原因不在我们的类名，而在本机命中了 [`globals.css`](../frontend/src/app/globals.css) 第 416 行的 `@media (prefers-reduced-motion: reduce) { transition-duration: 0.01ms !important }`：Base UI 关闭时给面板加 `data-ending-style`，只要有任何属性变化就会生成一个 0.01ms 的 CSSTransition，而这个 transition 实测**一直停在 `currentTime: 0`**（`playState: running`，永不 `finished`），Base UI 等它结束才卸载，于是退化成一次超时。
   **修法**：三个弹层（Menu / Popover / Select）统一加 `transition-none` + `data-ending-style:hidden`——关闭瞬间从画面与无障碍树里消失，原语随后何时卸载都不影响观感。`window.BASE_UI_ANIMATIONS_DISABLED = true` 也能消掉延迟（实测 18ms 卸载），但那是全站开关，会一并关掉 Base UI 的所有动效，不采用。
2. **条目打开确认对话框后焦点落到 body。** 菜单卸载延迟 → 原语的回焦发生在对话框已经聚焦之后，此时触发器处在对话框的 `aria-hidden` 区里，`focus()` 失败、焦点掉到 `document.body`。更麻烦的是 `AdminDialog` 用的还是手写 `useModalFocus`，它把「打开前有焦点的元素」记成**菜单条目**（原语在条目被激活后会把焦点拉回菜单，手写 focus 抢不过），条目随后被移除，关闭时同样只能落到 body。
   修法：`useModalFocus` 本来就支持第五个参数 `returnFocusRef`，本轮把它一路暴露出来——`AdminDialog` / `AdminConfirmDialog` 新增 `returnFocusRef`，`AdminDropdown` 新增同名 prop 并在**菜单打开时**把触发按钮写进这个 ref；`/admin/users` 用同一个 ref 连接两者。对话框关闭后焦点回触发按钮，不再落到 body。`AdminDropdown` 里原先「先 focus 触发器再执行动作」的权宜写法随之删掉（它本来就会被原语的焦点回拉覆盖）。

**与旧实现的差异（都是有意的）**

- 鼠标点开时焦点留在触发按钮上、条目靠 hover 高亮；键盘打开才移动高亮与焦点（APG 允许两种，原语的取法更常见）。
- 禁用条目是**可聚焦**的 `aria-disabled` 条目：读屏能发现「有这个动作但现在不可用」，点击与回车都不触发 `onClick`（旧实现直接 `disabled`）。
- Tab 不再被拦截，焦点按正常顺序离开菜单并关闭。
- 外部点击关闭后焦点回到触发器（旧实现不回焦）。
- 不再「页面一滚动就关闭」：原语跟随锚点重新定位。

验证（dev 站点 + `ego-browser`，临时探针页，验证后已删除）：

| 检查 | 结果 |
| --- | --- |
| 触发与面板语义 | ✓ `aria-haspopup="menu"`、`aria-expanded` 随开关变化、`role="menu"`、`aria-labelledby` 指向触发器 |
| 键盘打开与导航 | ✓ Enter 打开并高亮首项；↓/↑/Home/End 正常；末项再按 ↓ 回环 |
| Escape | ✓ 面板立即不可见，焦点回触发器 |
| Tab | ✓ 菜单关闭，焦点按正常顺序到下一个触发按钮 |
| 外部点击 | ✓ 关闭并把焦点还给触发器 |
| 禁用条目 | ✓ `aria-disabled="true"`、可聚焦、脚本派发 click 也不执行 `onClick` |
| 危险条目配色 | ✓ `text-error`（rgb(220,38,38)），高亮底为 `error/10` |
| 裁切（A-22） | ✓ 在被 `overflow-hidden` 包住的容器里打开，面板仍完整显示（portal 到 body，面板下边界超出容器 40px） |
| 碰撞翻转 | ✓ 视口底部打开时 `data-side="top"`，面板不越界，`max-h` 取 `--available-height` |
| 移动端 390×844 | ✓ 面板 160×154，x=198…358，完整在视口内 |
| 条目打开对话框 | ✓ 焦点落在对话框内；框内 Escape 后焦点回菜单触发器 |
| 门禁 | ✓ `npm run check` 全绿，白名单零新增 |

未覆盖：

- 子菜单、checkbox/radio 条目、超长菜单的内部滚动：当前没有消费者，未验证。

### 14.1 真实后台页走查（同日补做）

本机只有 `15580607003` 一个管理员账号，仓库不存凭据。经用户同意，把测试账号 `18800001111` **临时提权**为管理员、把它的用户 token 镜像到 `seeword_admin_token`（admin 与用户端本是同一套 JWT/role 系统），走查完**已还原为 `user` 并清掉 admin token**；走查期间只打开菜单与确认框、全部取消，不落任何数据变更（复核：`17207719806` 仍是 `user` / `pro`）。

| 检查 | 结果 |
| --- | --- |
| 真实表格里的定位 | ✓ 三条动作完整显示；该行下方空间不足时自动向上翻转（`data-side="top"`），不出表格容器也不出视口 |
| 语义 | ✓ `role="menu"`、`aria-labelledby` 指向触发按钮 |
| 危险条目配色 | ✓ `封禁用户` / `撤销 Pro` 为 `rgb(220,38,38)`，`提升为管理员` 为正文色 |
| 键盘 | ✓ Enter 打开并高亮首项，↓ 移到「提升为管理员」 |
| 条目打开确认框 | ✓ 框内首焦点正确，文案正确；Escape 取消后焦点回到该行触发按钮 |
| 行本身 | ✓ 点菜单不会连带展开那一行 |
| 截图 | ✓ `ego-browser` 实拍（管理员橙色主题下弹层、图标、危险色都对） |

走查中同时确认了一个**遗留问题**（不属于本次改动、也未修）：`useModalFocus` 在 `AdminDialog` 打开时偶尔会把焦点放在对话框根节点而不是首个按钮上（`getClientRects()` 在挂载瞬间还不稳定）。`AdminDialog` 迁到 `ui/Dialog` 时会一并解决。

## 15. Phase 1 实施记录：Drawer（2026-11-02）

交付：

- 新增 [`frontend/src/components/ui/Drawer.tsx`](../frontend/src/components/ui/Drawer.tsx)：Base UI Drawer 的薄封装（Root / Portal / Backdrop / Viewport / Popup / Content / Title / Close，外加 `VirtualKeyboardProvider`）。焦点陷阱、滚动锁、背景 aria-hidden、Escape、外点关闭与下拉手势都由原语负责。
- [`components/watch/WatchMoreSheet.tsx`](../frontend/src/components/watch/WatchMoreSheet.tsx) 换成 `ui/Drawer`：不再用 `useModalFocus` 手写焦点与 Esc，遮罩/滚动区改由 Backdrop 与 Content 承担；`extra` 里的笔记输入框接了 `VirtualKeyboardProvider`。
- [`components/watch/WordCardSheet.tsx`](../frontend/src/components/watch/WordCardSheet.tsx) 的模态壳换成 `ui/Dialog`。**没有用 Drawer**：词卡顶边由 `useSheetGeometry` 贴着画框算出来、底边不越过播放栏，而 Drawer 的视口模型是「贴视口底 + snap points + 整卡 swipe」，两者会互相拉扯。几何、把手手势与 `data-testid` 全部保持原样。
- [`components/watch/SheetHandle.tsx`](../frontend/src/components/watch/SheetHandle.tsx) 增加 `handleRef`（给 `initialFocus` 用）与 `dragEnabled`（下拉交给原语时关掉自己的指针拖动，避免抢同一个手势）。
- [`components/ui/Dialog.tsx`](../frontend/src/components/ui/Dialog.tsx) 的 `DialogPopup` 只保留「fixed + z-50 + outline-none」，居中/贴边交给调用方：`common/Modal` 补回原来的居中类，`WordCardSheet` 用自己的几何。

**行为差异（都是有意的）**

- **下拉覆盖整张卡片，不再只认把手**；关闭阈值改用原语规则：慢拖超过弹层高度的一半，或速度 ≥ 0.5px/ms 的快速甩动。把手上的指针拖动已关掉（键盘 Enter/Space 仍关闭），否则两套手势会互相拉扯。词卡仍走自己的 64px 把手规则（`SHEET_CLOSE_DRAG_PX`）。
- **背景从「只拦焦点」变成真 modal**：背景元素 `aria-hidden` + body 滚动锁，焦点按原语规则循环。
- **内容区不能起下拉**：从滚动区里拖是滚动，从标题栏/把手拖才是关闭（原语按「可滚动祖先」判断，实测符合预期）。
- 进场/退场仍无动画（`transition-none` + `data-ending-style:hidden`，理由同 §14），动效留到 Phase 2。

验证（`ego-browser`，390×844 移动视口 + 本机 dev 站点）：

| 检查 | 结果 |
| --- | --- |
| 抽屉语义 | ✓ `role="dialog"`、`aria-modal="true"`、`aria-label="更多设置"`；弹层 390×675 贴视口底 |
| 打开后首焦点 | ✓ 落在把手上（鼠标点开与键盘 Enter 都一致） |
| Escape / 关闭按钮 | ✓ 关闭并把焦点还给 ⋯ 按钮 |
| 键盘关闭 | ✓ 把手 Enter 关闭，焦点回 ⋯ 按钮 |
| 外点关闭 | ✓ 点遮罩关闭 |
| 下拉关闭（鼠标） | ✓ 从标题栏拖 600px，`--drawer-swipe-movement-y` 跟手，松手关闭并回焦 |
| 下拉关闭（触摸） | ✓ CDP 原生 touch 事件：拖动跟手（`data-swiping`、位移变量同步），松手后关闭 |
| 内容滚动 | ✓ 内容区可滚动，滚动区内的拖动不触发关闭 |
| 笔记输入区 | ✓ 打开「笔记」后 textarea 在视口内（574–681），抽屉高度不变 |
| 词卡（换壳后） | ✓ 位置仍在 `max(8, min(句卡下沿, 底栏顶-240))`；短拉回弹（`transform: none`）、长拉关闭；关闭后焦点回被点的词 |
| 词卡换词 | ✓ 卡片开着时直接点另一个词仍能切换（没有被 modal 挡掉） |
| Modal 回归 | ✓ 词单删除确认（`design-rollout` 用例）仍居中可用 |
| 门禁 | ✓ `npm run check` 全绿，白名单零新增 |

相关 e2e（本机 Playwright + 已跑的 dev 服务）：

| 用例 | 结果 |
| --- | --- |
| `ui-review-fixes-mobile.spec.ts` › 更多设置模态焦点进入、约束、Escape 与把手键盘关闭 | ✓ |
| `mobile-wordcard-drawer.spec.ts`（6 条，含 375×480/600/812 定位、短拉回弹、长拉关闭） | ✓ |
| `watch-end-screen.spec.ts`（2 条，手机档经由 ⋯ 抽屉点「继续播放」） | ✓ |
| `design-rollout.spec.ts` › 观看页保留全站导航…句子收藏在抽屉 | ✓ |
| `design-rollout.spec.ts` 其余几条 | 首轮 4 条失败，逐条重跑 3 条通过；「每日推荐换组…」单独重跑仍失败，它依赖每日推荐数据状态、且页面不引用本轮任何组件（与本次改动无关） |

未覆盖：

- **软键盘**：桌面浏览器没有软键盘，`VirtualKeyboardProvider` 接上了但没在真机上验证「键盘弹出后输入框不被遮挡」。
- iOS Safari 的视口/安全区行为、真实触屏设备（触摸手势用 CDP 模拟，不是真手指）。
- 下拉关闭的松手动画：现在关闭是瞬时的（`data-ending-style:hidden`），Phase 2 做动效时要重新检查一次。

## 16. Phase 1 实施记录：ToggleGroup（2026-11-02）

交付：

- 新增 [`frontend/src/components/ui/ToggleGroup.tsx`](../frontend/src/components/ui/ToggleGroup.tsx)：Base UI Toggle Group 的薄封装（`ToggleGroup` / `ToggleGroupItem`），沿用原 `.chip` 的视觉：移动端 44px 触控基线、桌面 32px、pill 描边、选中为墨色底。
- 替换全部 6 处 `TabPills variant="chips"`：[`HomeFeed`](../frontend/src/components/home/HomeFeed.tsx) 分类、[`channels`](../frontend/src/app/(main)/channels/page.tsx) 学习方向、[`contact`](../frontend/src/app/(main)/contact/page.tsx) 反馈类型、[`practice/exams/result/[id]`](../frontend/src/app/(main)/practice/exams/result/[id]/page.tsx) 错题筛选、[`vocabulary/sets`](../frontend/src/app/(main)/vocabulary/sets/page.tsx) 状态筛选、[`vocabulary/sets/[id]`](../frontend/src/app/(main)/vocabulary/sets/[id]/page.tsx) 词表范围。
- [`ui/TabPills`](../frontend/src/components/ui/TabPills.tsx) 删除 `variant="chips"`：筛选 chip 只保留一个实现。分段控件（`default`）与 ghost 版本不变。

实现细节（都写进了组件注释）：

1. **单选但不可为空。** Base UI `multiple={false}` 允许「再点一次已选项 → 全部取消」；筛选 chip 必须始终有值，所以封装忽略空数组的变化，点已选项不再回调。
2. **键盘与语义交给原语。** 组根是 `role="group"`（配 `aria-label`），按钮是原生 `<button>` + `aria-pressed`，方向键 / Home / End 移动焦点，Space / Enter 激活。HomeFeed 的分类外观仍由 `user-ui.css` 的 `[aria-pressed="true"]` 覆盖，没有改品牌色。
3. **不改公共 API 的落点。** 每处调用仍是「值 + onChange + 选项列表」，没有引入受控数组。

验证（本机 dev 站点 + `ego-browser`，登录态）：

| 检查 | 结果 |
| --- | --- |
| 语义 | ✓ `group "视频分类"`、9 个按钮带 `aria-pressed`，选中项 `tabIndex=0`、其余 `-1` |
| 点击切换 | ✓ 点「TED」后 URL 变 `?category=ted`，`aria-pressed` 同步 |
| 点已选中项 | ✓ 仍保持选中，不产生空筛选 |
| 键盘 | ✓ ArrowRight 移动焦点；Space / Enter 激活未选中项并更新 URL |
| 移动端 390×844 | ✓ chip 高 44px、圆角 pill、`brand-50` 选中底；分类行换行后无横向溢出 |
| 其他落点 | ✓ `/contact` 反馈类型、`/channels` 学习方向均为 `role=group` + `aria-pressed` |

未覆盖：

- `/vocabulary/sets` 当前账号没有词单，页面走空态，筛选行不渲染；组件本身与其它 5 处共用同一实现。
- 真题结果页需要已提交的考试会话，本轮未单独走查。
- **截图未取到**：`Page.captureScreenshot` 连续 CDP 超时（与 §12 同因），视觉结论来自计算样式与 DOM，不是看图。

## 17. Phase 1 实施记录：Tabs（2026-11-02）

交付：

- 新增 [`frontend/src/components/ui/Tabs.tsx`](../frontend/src/components/ui/Tabs.tsx)：Base UI Tabs 的薄封装（`Tabs` / `TabsList` / `TabsTab` / `TabsPanel`）。`TabsList` 默认 `activateOnFocus`，保持原手写实现「方向键即切换」的行为。
- 迁移两处真正的分栏切换：
  - [`profile`](../frontend/src/app/(main)/profile/page.tsx)：5 个分组（内容 / 资料 / 进度 / 账号 / 设置），删除手写的 `onTabKeyDown`、`aria-selected`、`tabIndex` 与面板条件渲染。
  - [`login`](../frontend/src/app/login/page.tsx)：验证码 / 密码两种登录方式，删除 `tabRefs`、`handleTabKeyDown` 与 `switchMode` 的 `moveFocus` 分支。
- **保留既有 id**：`profile-tab-*` / `profile-panel-*`、`tab-code` / `panel-code` 都原样传给原语，`e2e` 里 `#profile-panel-content` 等选择器不用改。

行为差异（有意）：

- 方向键 / Home / End 现在**移动焦点并立即切换**，与原手写实现一致；`aria-selected` 与 roving `tabIndex` 由原语维护。
- 非激活面板卸载（`keepMounted` 默认 false）。切换瞬间上一个面板会短暂保留在 DOM 里且 `hidden`，随后卸载；对视觉与无障碍树无影响。
- 登录页切换方式仍会清空错误与字段错误（`onValueChange` 里调 `switchMode`）。

**`AdminTabs` 没有迁移**：全仓只有 `components/admin/ui/index.ts` 的一处 re-export，0 个调用点；它的 props 只描述「标签条」，没有面板契约，硬套 `Tabs` 会生成指向不存在面板的 `aria-controls`。等后台真正出现分栏页面时，按 `Tabs` 的面板契约接入。

验证（本机 dev 站点 + `ego-browser`，登录态）：

| 检查 | 结果 |
| --- | --- |
| 个人页语义 | ✓ `tablist "账户与学习设置分组"`、5 个 `role=tab`、选中项 `aria-selected=true` 且 `tabIndex=0`；面板 `#profile-panel-*` 保留 |
| 个人页键盘 | ✓ ArrowRight 两次依次切到「资料」「进度」并改 URL；End / Home 切到「设置」「内容」；面板与 URL 同步 |
| 个人页视觉 | ✓ 选中 tab 下边框 `rgb(0,113,227)`、文字为品牌蓝；未选中为灰色透明边框 |
| 移动端 390×844 | ✓ tablist 宽 358px、不横向溢出；短标签换行正常 |
| 登录页语义 | ✓ `tablist "登录方式"`、`tabpanel` 的 `id` / `aria-labelledby`（`panel-code` ↔ `tab-code`）保留 |
| 登录页键盘 | ✓ ArrowRight 从「验证码登录」切到「密码登录」，焦点随 tab，面板同步切换 |
| 登录闭环 | ✓ 退出登录 → 固定验证码 `1234` 重新登录成功，回到 `/` |
| e2e | ✓ `auth.spec.ts`（13 条）+ `avatar.spec.ts`（1 条）全绿 |
| 门禁 | ✓ `npm run check` 全绿，白名单零新增 |
| 单测 | ✓ 38 个文件 / 375 条全绿 |

未覆盖：

- `npm run build` 未执行：当时 `:3000` 的 dev 进程正在使用 `.next`，避免构建打断走查。Tabs / ToggleGroup 都不使用 Portal，静态预渲染风险低，但仍应在下次独立构建里复核一次。
- 面板切换的退场时序（上一面板短暂保留在 DOM）没有做动画验收，Phase 2 接动效时一并检查。

### 17.1 顺带修复：Select 落地后遗留的 e2e 漂移

§12 把 `#feed-level` / `#feed-sort` 从原生 `<select>` 换成 Base UI Select，但 e2e 仍在用 `selectOption()` 与 `toHaveValue()`；本轮跑 `home-feed` 时暴露出来，属真实回归，不是放宽检查。

- [`e2e/helpers.ts`](../frontend/e2e/helpers.ts) 新增 `chooseSelectMenu(page, trigger, option)`：点开触发器，再点弹层里的同名选项；选项标签带等级提示时传 RegExp（如 `/^B2 · /`）。
- 更新 `home-feed.spec.ts`、`discover-layout.spec.ts`、`user-information.spec.ts`、`watch-return.spec.ts`：`selectOption` → `chooseSelectMenu`，`toHaveValue` → 断言触发器文案；`option:checked` / `selectedOptions` 与「标签是否放得下」的检查改为对触发器做 `scrollWidth <= clientWidth + 1`。
- `home-feed` 的「空结果可清除筛选」用例同时修掉 strict mode 冲突：工具条与空态各有一个「清除筛选」按钮，改用 `.first()`。

验证：

| 用例 | 结果 |
| --- | --- |
| `discover-layout.spec.ts`（8 档视口） | ✓ 9/9 |
| `home-feed.spec.ts` | ✓ 6/7；剩余 1 条 `.home-editorial-lead` 依赖首页有可展示的精选视频，dev 库当时没有 `show_on_homepage` 视频；播种后 7/7（见 §18） |
| `user-information.spec.ts` › 我的默认展示 / 筛选写入请求（1440/390） | ✓ 3/3 |
| `watch-return.spec.ts` | ✓ 1/1 |

## 18. Phase 1 收尾验证（2026-11-02）

承 §15–§17 的「未覆盖」项。本轮不改产品代码，只做验证与 dev 数据播种。

### 18.1 home-feed 的真实数据用例

- `.home-editorial-lead` 是 [`FeaturedVideoCard`](../frontend/src/components/home/FeaturedVideoCard.tsx) 的类名，编辑主推与「精选」兜底共用。空库时 `/browse/featured` 为空，整卡不渲染——它**不依赖**已发布的首页编排，§17.1 原先的判读已更正。
- 按 e2e 播种口径跑 `PYTHONUTF8=1 .venv/Scripts/python.exe scripts/seed_e2e.py`：新建 demo 视频 `d8c0300c-…`（4 句双语字幕、`show_on_homepage`）、频道 `e2e-channel`、听力视频 `668c6d4b-…`、演示试卷 `1af4e628-…`。脚本幂等。
- `npx playwright test e2e/home-feed.spec.ts --project=chromium`：**7/7 通过**（1.5 分钟）。

注意：该用例会重写 `docs/evidence/home-design-refresh/live-desktop.png` / `live-mobile.png`，内容变成演示视频；本轮已还原这两张图，不把播种数据当「真实首页」证据提交。

### 18.2 生产构建

`:3000` 的 `next dev` 占着 `.next`，本轮无法停（停止进程被权限策略拒绝）。改为把 `src/ public/ package*.json tsconfig.json next.config.js postcss.config.js` 复制到临时目录、junction 复用同一份 `node_modules`，在那里构建：

| 检查 | 结果 |
| --- | --- |
| `npx next build --webpack` | ✓ 通过，输出完整路由表（含 `/watch/[id]`、`/vocabulary/sets/[id]` 等动态路由） |
| 类型检查 | ✓ 构建内建类型检查通过；`npm run check` 的 `tsc --noEmit` 仍是独立门（本轮无代码改动，未重跑） |

**偏差（如实记录）**：这不是项目原命令。Next 16 默认 Turbopack，而临时目录里 Turbopack 拒绝解析工作区外的 `node_modules`（junction），只能退回 webpack。跑原样的 `npm run build` 需要先停 dev 进程，留给下一次服务空窗期。

### 18.3 Drawer 复检（ego-browser，Chromium 移动模拟 390×844）

| 检查 | 结果 |
| --- | --- |
| 语义 | ✓ `role="dialog"`、`aria-modal="true"`、`aria-label="更多设置"`；遮罩 390×844，弹层底边 844 |
| 打开后焦点 | ✓ 落在把手（`role=button`、`aria-label=下拉关闭`、`tabindex=0`） |
| 焦点陷阱 | ✓ 连续 Tab 8 次全部停在弹层内（关闭 → 语言 → 字号 → …） |
| Escape | ✓ 关闭并把焦点还给 ⋯ 按钮 |
| 外点关闭 | ✓ 点弹层上方的遮罩关闭 |
| 笔记输入区 | ✓ 打开「笔记」后 textarea 聚焦、落在 579–673px 视口内、可输入；`--drawer-keyboard-inset` 为 `0px`（无软键盘） |
| 横向溢出 | ✓ 0 |

仍未覆盖（同 §15）：真实软键盘、iOS Safari 视口/安全区、真实触摸设备。本机没有 iOS 设备，Chromium 模拟替代不了这三项。

### 18.4 ToggleGroup 真实数据走查

为让两处筛选行有数据，本轮往 dev 库写了：测试账号 `18800001111` 的一次已提交真题作答 `363845aa-ea26-4948-a1a2-01e1d6941886`（4 题、错 2），以及一个视频词单 `f8d4ea6e-8039-4902-bca4-e5d1bc19eae8`（159 词）。两者都是 dev 数据，需要时按 id 删除即可。

| 页面 | 检查 | 结果 |
| --- | --- | --- |
| 真题结果 `/practice/exams/result/363845aa-…` | 语义与尺寸 | ✓ `group "题目筛选"`；390 下 chip 44px，1440 下 32px |
| 同上 | 点击 / 键盘 | ✓ 点「全部」、Space、Enter 都切换 `aria-pressed` |
| 同上 | 真的过滤 | ✓ 「只看错题」2 条，「全部」4 条 |
| 词单列表 `/vocabulary/sets` | 语义、尺寸、计数 | ✓ 44/32px；选「已完成」后计数变「已完成 0 个（共 1 个）」 |
| 词单详情 `/vocabulary/sets/f8d4ea6e-…` | 语义、点击、Space | ✓ 「全部 / 未掌握 / 已掌握」互斥切换，无横向溢出 |

### 18.5 AdminTabs

维持 §17 结论：全仓 0 调用点，等后台出现真正分栏页面时按 `ui/Tabs` 的面板契约接入。

## Sources

- [July 2026 · Base UI as the Default · shadcn/ui](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)：默认切 Base UI、Radix 继续支持、迁移不强制；读取于 2026-11-01。
- [shadcn/ui Changelog（2026-10）](https://ui.shadcn.com/docs/changelog)：组件矩阵与 AI Elements；读取于 2026-11-01。
- [Base UI Releases](https://base-ui.com/react/overview/releases)：v1.9.0（2026-10-09）、v1.6.0 起 OTPField 稳定、Drawer 与虚拟键盘修复；读取于 2026-11-01。
- [Headless UI alternatives: Radix vs React Aria vs Ark UI vs Base UI · LogRocket（2026-03）](https://blog.logrocket.com/headless-ui-alternatives/)
- [Base UI vs. Radix vs. React Aria · BuiltUX（2026-10-02）](https://builtux.com/base-ui-vs-radix-primitives-react-aria-headless-components-2026/)：包体与原生 Popover / Anchor Positioning 的对比。
- [Motion Implementation - Web（2026-05）](https://github.com/adamforrester/knowledge-base/blob/main/19-motion-implementation-web.md)：`linear()`、View Transitions、WAAPI 的平台化与 INP 关系。
