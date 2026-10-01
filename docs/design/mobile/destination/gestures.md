# 手势集：做哪几条，哪些在 iOS Safari 上做不成

> 来源票：[GitHub #29](https://github.com/CandideEgo/Speaking-/issues/29)（父图 [#20](https://github.com/CandideEgo/Speaking-/issues/20)）
> 日期：2026-10-01 ｜ 状态：**待用户打勾**（本文件不写 app 代码；决策由 Lead 收口回写 #20/#29）
> 尊重已拍板口径：#26（把手下拉 >64px 关抽屉）、#27（点词不引入新手势）、#28（控制条点出 + 3px 细进度 + 3s 自收）
> 浏览器事实全部来自一手来源，逐条给 URL 与查证日期，见 §6；**不凭记忆**。

---

## 0. 打勾栏（只有这一节需要读；5 个方框）

| # | 手势（票面候选） | 一行结论 | 打勾栏 |
|---|---|---|---|
| 1 | **双击画面左/右：快退/快进** | **可做**。iOS Safari 上唯一的拦路虎是双击缩放；`touch-action: manipulation` 在 2026-07-18 之前**并不**关它（WebKit 刚改），所以要按「先探针、后收窄」的方式做，且必须只画在**画面区** | ☐ **做**（画面区、左半 −10s / 右半 +10s）<br>☐ 不做<br>☐ 只做（左半 = 回上一句） |
| 2 | **水平擦洗进度** | **建议不做**。画面上直接擦要 `touch-action: pan-y`（可行），但左边缘那条归 Safari 返回手势、且收益与「点出控制条后拖原生进度条」重叠；「只在进度条附近生效」= 现状（range 本身可拖） | ☐ **不做**（现状：点出控制条拖进度条）<br>☐ 只做（控制条浮起时画面可擦）<br>☐ 做（常时全画面可擦） |
| 3 | **长按倍速** | **建议不做**。它是唯一需要「长按状态机」的一条，还要关掉长按选择/菜单；收益（临时 2×）已被「更多 → 倍速」覆盖。参照稿那套「下滑松手锁定」不在本仓口径内 | ☐ **不做**<br>☐ 只做（长按画面 = 2×，松手复原）<br>☐ 做（含下滑锁定，抄抖音） |
| 4 | **下拉关闭（词卡 / 跟读抽屉 / 迷你窗）** | **只做把手（现状）**。把手版已经落地且是零冲突的；扩到卡体会与卡内滚动打架；迷你窗的形态与关闭入口归 #30 / touch-targets.md，本票只判「不接下拉」 | ☐ **只做把手**（词卡 + 抽屉，现状 >64px）<br>☐ 再扩到卡体<br>☐ 迷你窗也做下拉关闭 |
| 5 | **可发现性（手势提示）** | **只给看得见代价的那一条**：双击快进。每次会话首次点出控制条时随控制条浮一行提示，**3s 自收**（与 #28 的 3s 同节拍）；把手是标准形态、不需要提示 | ☐ **只给双击一条 / 3s 一次性**<br>☐ 都不给<br>☐ 都给（含常驻提示） |

> 打勾栏读法：每条手势**只勾一个方框**（第 4 条勾「只做把手」即维持现状）。勾完就结束，§1 之后是给实现方与验收方的依据。

**最快路径 —— 同意推荐组合的话，只勾这一行的 5 个方框就结束：**

> ☐① 双击快进＝做 ｜ ☐② 水平擦洗＝不做 ｜ ☐③ 长按倍速＝不做 ｜ ☐④ 下拉关闭＝只做把手（维持现状） ｜ ☐⑤ 提示＝只给双击一条、3s 一次性
>
> 要改哪一条，再回上表对应那一行勾它的备选（每行 3 个选项互斥）。

---

## 1. 推荐组合（一段）

**勾 1=做、2=不做、3=不做、4=只做把手、5=只给双击一条。**
理由：这四个候选里，只有双击快进同时满足「不与文稿争手势、不遮挡文本、不需要长按状态机、不必关掉任何正文能力（选择 / 缩放 / 滚页）」——它画出的是画框顶部那块 129px 画面，而文稿、词卡、抽屉一个都不碰；反过来，擦洗与长按都要从画框的 `touch-action` 里拿走一块（今天在所有 iOS 版本上**只有 `none` 关得住双击缩放**，代价是那块区域不能再拖动滚页），而它们的收益已被「点出控制条 + 原生进度条 / 文稿点行跳句 / 更多里的倍速档」覆盖；下拉关闭保留已有的把手版（`#26` 毕业物）是因为它是零冲突的，而扩到卡体立刻与「卡高随内容、卡内可滚」（`#27`）打架；提示只给看不见的那一条，并且与 `#28` 的 3s 自收同一节拍，不需要新机制。

---

## 2. 候选手势逐条评估

### 2.1 双击画面左/右：快退/快进

**能不能做（iOS Safari）**：能。双击本身用 pointer/touch 时间窗就能识别（全仓今天零手势码基，无冲突）。拦路的是 Safari 自己的双击缩放（DTTZ）。

**要关掉哪些浏览器默认行为才能存在**

| 手段 | 效果 | iOS 上的真实性 |
|---|---|---|
| `touch-action: manipulation` | 规范语义＝保留 pan + pinch，**关掉双击缩放** | ⚠️ **2026-07-18 之前 iOS 上不成立**：WebKit 的 `WKTouchActionGestureRecognizer` 只有 `none` 才阻止 DTTZ；该 commit 的测试断言原文从「manipulation **allows** double tap to zoom」改成「**prevents**」，落 trunk `317443@main`，2026-07-20 回合 `safari-7625-branch`。哪些已发布的 Safari 含这条未在一手来源中写死 → §7 探针 |
| `touch-action: none` | **所有 iOS 版本**都关得住 DTTZ | 代价：该元素（及其后代，MDN 交集规则）不能拖动滚页、不能捏合缩放 |
| `touchstart` 上 `preventDefault()`（`passive:false`） | 可能等效于 `none` | 未获一手确认 → §7 探针（若成立，则不必牺牲滚页） |
| `user-scalable=no` / `maximum-scale=1` | **完全没用** | WebKit 自 iOS 10 起「ignore the `user-scalable`, `min-scale` and `max-scale` settings」 |
| 靠 300ms 点击延迟错开单击与双击 | **不需要** | 本页已满足 fast-tap 两个前提（viewport 有 `width=device-width` + scale 1），iOS 10+ 点击即时派发；延迟是**我们自己**为区分单击/双击引入的，不是浏览器给的 |

**代价（伤不伤正文）**：只画在画框上的话，**不伤正文**——画框内没有可复制正文、文稿区在这一区域内也不可见。两点要守住：① `touch-action` **只加在画框元素上**，绝不下放到 `main#main-scroll` 或文稿列表；② 若最终只剩 `none` 一条路，代价是「从画面上开始往下拖不再滚页」（今天画框是出血贴壳顶的，这是很常用的滚动起点，见 §7 探针 P2 的取舍）。缩放：本仓 viewport 从未设 `user-scalable=no`（`layout.tsx:14-18` 只有 `width/initialScale/viewportFit`），页面在 iOS 上永远可捏合缩放——这条不要因为手势而放弃（MDN 在 `touch-action` 页专门警告 `none` 会挡住低视力用户放大）。

**冲突裁决**：
- 与**单击点词 / 点出控制条**：见 §3（分区 + 第一次点立即生效，不给单击加延迟）。
- 与 Safari **双击缩放**：见上表，是本条唯一真冲突。
- 与 Safari **长按菜单 / 边缘返回 / 下拉刷新**：不冲突（双击不是长按、不是横向拖、不是下拉）。
- 与**水平擦洗**：互斥——若第 2 条也做，画面上「横向位移 >阈值」判擦洗、「原地点两下」判双击，同一元素上两套手势要靠位移阈值分开，这是第 2 条建议不做的原因之一。

### 2.2 水平擦洗进度

**能不能做（iOS Safari）**：能，但需要断言画框上的横向手势归页面，否则页面纵向滚动识别器会把这次触摸判成滚动并给页面 `pointercancel`（擦洗会在半路断掉）。

**要关掉哪些浏览器默认行为才能存在**：`touch-action: pan-y`（画框上）。语义＝纵向拖动仍然滚页、横向不再交给浏览器；与 `user-select` / `-webkit-touch-callout` / viewport 元信息**无关**。

**代价（伤不伤正文）**：不伤正文，也不伤缩放（`pan-y` 不禁 pinch，也不动 DTTZ——DTTZ 只由 `none`/`manipulation` 关）。真实代价是**与系统手势抢左边缘**：Safari 的返回手势是屏幕左边缘的屏幕边缘平移（LTR），识别器「接收所有触摸」，页面拿不回来。画框出血到 x=0，擦洗起手落在边缘条里就会直接退出这一页。边缘条宽度 Apple 未公开 → §7 探针 P5。

**冲突裁决**：与双击（位移阈值分开，可共存但实现复杂度翻倍）、与「点画面出控制条」（点击 vs 拖动，天然分开）、与 Safari 边缘返回（**真冲突，且我们输**）、与下拉刷新（横向拖不触发）。

### 2.3 长按倍速

**能不能做（iOS Safari）**：能，但要同时压掉两个系统行为，且要自建长按状态机（全仓今天没有任何长按/手势判定逻辑，只有 `VideoControls` 的 3s 自收计时器可复用节拍）。
- `user-select: none`：关掉长按选中文本。
- `-webkit-touch-callout: none`：关掉长按弹出的 **callout**——MDN 原文是「controls the display of the default callout shown when you touch and hold a touch target… allows disabling that behavior」，**它关的是菜单/信息浮层，不是选择**；关选择要另用 `user-select`。非标准属性，不进任何规范。
- 若做「下滑锁定」（参照稿/抖音那套），还要再加：长按后位移的状态机 + 锁定态的可取消入口 + 一条提示文案；参照稿的那句提示语本身就是照抄抖音的（`competitor-patterns.md` §1）。

**代价（伤不伤正文）**：放在**画框内**几乎零新增代价——画框里的入画字幕今天已经不可选（`VideoControls.tsx:194` 根节点 `select-none`，字幕块是它的子节点），文稿区不在画框内；真正的新代价是「长按 = 选择/菜单」这套系统行为在画框上是否真的静默，需要真机确认（§7 探针 P4）。**一旦把长按放到文稿区**，就必须关掉整块文稿的文本选择——那是正文阅读能力，不做。

**冲突裁决**：与点词（单击 vs 长按，天然分开）、与滚动（长按不动手指，不触发滚动）、与 Safari 长按菜单（真冲突，靠上面两条 CSS 压）、与「点画面出控制条」（长按结束若被当成点击，会顺手切换控制条 → 需要 `pointerup` 抑制，这是状态机成本的一部分）。

### 2.4 下拉关闭（词卡 / 跟读抽屉 / 迷你窗）

**现状（本仓已落地）**：`SheetHandle.tsx` 只接把手上的指针，位移 > `SHEET_CLOSE_DRAG_PX = 64` 才关；把手 `touch-none`，内容区完全不接手势。词卡（`WordCardSheet.tsx:76-83`）与跟读抽屉（`ShadowingDrawer.tsx:140-147`）共用它。

**能不能做（iOS Safari）**：能，而且这是四条里**唯一已经跑通并过了 e2e** 的一条（`frontend/e2e/mobile-wordcard-drawer.spec.ts:245-250`：把手下拉 140px → 抽屉消失）。

**要关掉哪些浏览器默认行为才能存在**：只有把手上的 `touch-action: none`（`SheetHandle.tsx:64`）——它是浮层里的非滚动条，`none` 落在这里不会波及任何滚动路径。内容区**不要**加 `touch-action`：抽屉内容区靠 `overflow-y-auto` 自己滚（`ShadowingDrawer.tsx:168`）。

**代价（伤不伤正文）**：零。不关选择、不关缩放、不动文稿。

**冲突裁决**：
- 与 Safari **下拉刷新**：把手在屏幕中部（375×812 实测：词卡 top 358.9 / 抽屉 top 367.0），且拉的是 `fixed` 浮层，不落在页面滚动路径上；`overscroll-behavior` 在这件事上**帮不上忙**（它挡不住 iOS 的下拉刷新，见 §6 F4），所以「把手专用」本身就是防冲突设计 → 这也是不建议扩到卡体的原因。
- 与**卡内滚动**（若扩到卡体）：卡内滚到顶后继续下拉，浏览器无法区分「滚到头了」与「想关掉」，必然误关。
- 与**迷你窗**：迷你窗是 `fixed bottom-4 right-4` 的 160px 小盒（`page.tsx:946`），它的形态（贴顶常驻 / 缩成条）与关闭入口归 **#30**；本票只判「不接下拉关闭」，理由是它太小（>44px 拖拽行程放不进 90px 高的盒子）且关闭入口的 44px 归 touch-targets.md。

---

## 3. 票面第 2 问的裁决：同一块区域的单击（点词 / 点出控制条）与双击怎么分

**裁决：按「块」分，不按时间猜；单击永不延迟。**

| 区域（375×812 实测几何） | 归属 | 单击 | 双击 |
|---|---|---|---|
| 画框内、入画字幕块**以上**的画面区（≈375×129，见 #28「可见画面地板 129px」） | 播放器表面 | 点出 / 收起控制条（`#28` 现状，`VideoControls.tsx:153-168`） | 左半 −10s / 右半 +10s，控制条保持浮起 |
| 入画字幕块（贴画框最下沿，≈82px，含 `.burn-sub-word` 词热区） | **单词选区**（`#27` 唯一锚点） | 点词（现状：词自己 `stopPropagation`，`page.tsx:796-800`） | **不接双击**；连点两下就是查两次词（可按 word 去重，不做 seek） |
| 控制条本身（浮起时覆盖画框底部，`data-testid="controls-bar"`） | 控件 | 原有各按钮（`onClick` 停冒泡） | 无特殊语义 |

三条实现约束：
1. **第一下点立即生效**（控制条当场浮起），第二下落在 300ms 窗口内才升级为双击 → 双击的可见结果是「控制条浮起 + 跳 10 秒」，不是「控制条闪一下」。这样单击不需要 300ms 延迟，点词也不受双击影响（这也符合 YouTube 的行为：第一下出控件，第二下才 ±10s）。
2. 双击窗口取 **300ms**（≤ iOS 自身的双击判定窗口；本仓常量，与 `HIDE_DELAY_MS = 3000` 一样是真机可调参数）。
3. 双击**不进字幕块**：字幕块是 22px 行距的词热区（外扩 4px，`globals.css:624-628`），塞两套手势会同时毁掉点词与快进。

---

## 4. 票面第 3 问的裁决：文稿区的竖向滚动与点词怎么共存

**裁决：文稿区不接任何新手势；点词根本不在文稿区发生（`#27` 口径），所以「滚动 vs 点词」在这块不存在——存在的是「滚动 vs 行点击」，而这两者的分工由浏览器原生的位移阈值给出，零代码。**

- 文稿列表（移动端常驻在画框下方，`page.tsx:1429-1469`）每行是一个 `<button>`：点行 = 把这句跳进画面并 seek；行内单词只有等级着色 class，**没有 `onClick`**。原生规则：位移超过阈值判滚动（不派发 click），原地点一下判 click。所以「拖不动 / 误跳句」这类问题今天不存在，也不需要 `touch-action` 干预。
- 因此**不要**为了「在文稿里点词」去动热区：`#27` 已判「行内 44px 热区做不到（22px 行距是天花板，实测 21–29px）」，扩热区只会与相邻行重叠。
- **反例不要抄**：`WordTooltipInline.tsx:384`（桌面浮动卡）的整卡 `touch-none`。按 MDN 的交集规则，祖先的 `none` 会收窄后代，所以它连卡内 `overflow-y-auto` 的滚动一起挡掉——机制成立，但**仓内没有实测读数**（`docs/design/mobile/baseline/README.md:40` 自陈：那次词条内容没超出高度，「卡内能不能滚」没验到）。移动端词卡（`WordCardSheet.tsx`）没抄这条：只有把手 `touch-none`，内容区 `overflow-y-auto` 保持默认。
- 入画字幕块同样**不要**加 `touch-none`：它在画框内、是页面滚动路径的一部分，纵向拖它必须能滚页。
- 卡内滚动区保留/补齐 `overscroll-behavior: contain`（抽屉已有 `ShadowingDrawer.tsx:168`）——它只挡滚动链，**不要**当成「挡住 Safari 下拉刷新」的手段（§6 F4）。

---

## 5. 票面第 4 问的裁决：可发现性

**裁决：只给双击快进一条提示，每次会话首次点出控制条时出现，3s 自收，不做常驻、不做动画演示、不落 localStorage。**

- 给谁：**只给「看不见」的那条**。把手（下拉关闭）本身就是标准形态，横在浮层顶上就是它的提示；第 2、3 条建议不做，因此没有提示对象。
- 怎么给：与 `#28` 的控制条同一节拍——用户第一次点出控制条时，控制条上沿浮一行「双击两侧快退 / 快进 10 秒」，随控制条一起在 3s 后收起（复用既有 `HIDE_DELAY_MS = 3000`，不引入第二个计时器）。
- 频次：**每次会话一次**（内存态）。理由：学习类产品里用户会隔天回来，落 localStorage 的「永久不再提示」会让第二次会话重新变成不可发现；每次会话一次的骚扰上限是 3 秒 ×1 次。
- 文案成本：提示占的是控制条上沿的画面（浮起态本来就已经盖住入画字幕 82.1px，见 `.agent/state.md` 的读数），**静息态一像素不占**。

---

## 6. 浏览器事实（结论 + 支持版本 + 查证日期 + 一手来源）

| # | 事实 | 结论 | 支持版本 | 一手来源（查证日 2026-10-01） |
|---|---|---|---|---|
| F1 | `user-scalable=no` / `maximum-scale=1` | **无效**。Safari 在 iOS 10 起忽略 `user-scalable`、`min-scale`、`max-scale`（原文：「Safari on iOS 10 allows the user to pinch zoom on every page… Now, we ignore the `user-scalable`, `min-scale` and `max-scale` settings」）。MDN 也记「Browser settings can ignore this rule, and iOS10+ ignores it by default」 | iOS 10+ | WebKit 博客 [New Interaction Behaviors in iOS 10](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/)（2017-02-02，作者 Dean Jackson）· [MDN `<meta name=viewport>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport) |
| F2 | `touch-action: manipulation` 的语义 | 规范语义＝**保留 panning 与 pinch-zoom，关掉 double-tap-to-zoom**（是 `pan-x pan-y pinch-zoom` 的别名）。MDN 同时警告 `touch-action: none` 会挡住低视力用户的放大能力 | `touch-action` 在 iOS Safari：9.3–12.5 部分支持、**13+ 完整支持**（桌面 Safari 标记不支持） | [MDN `touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) · [caniuse css-touch-action](https://caniuse.com/css-touch-action) · 规范 [W3C Pointer Events REC](https://www.w3.org/TR/pointerevents/#the-touch-action-css-property) |
| **F2b** | **`manipulation` 在 iOS 上到底关不关双击缩放** | **2026-07-18 之前不关**。WebKit 原文：「On iOS, WKTouchActionGestureRecognizer only prevented DTTZ when `touch-action: none` was specified… In this patch, we prevent DTTZ recognizers when the touched element has a `touch-action: manipulation` value」；该 patch 把测试断言从「manipulation **allows** double tap to zoom」翻成「**prevents**」。落 trunk `317443@main`（2026-07-18），2026-07-20 回合维护分支 `316606.91@safari-7625-branch` | 修复在 WebKit trunk 2026-07-18 起；**含此修复的已发布 Safari 版本号未在一手来源中给出** → 见 §7 P1/P2 | WebKit 源码 commit [504edb5「[iOS] `touch-action: manipulation` does not prevent double-tap-to-zoom」](https://github.com/WebKit/WebKit/commit/504edb5c563f9ad8d0436f60b5a608f0ec384f42) · Bugzilla [319730](https://bugs.webkit.org/show_bug.cgi?id=319730)（RESOLVED FIXED，2026-07-17 报）· [319664](https://bugs.webkit.org/show_bug.cgi?id=319664) |
| F3 | `-webkit-touch-callout: none` 关的是什么 | **关长按弹出的 callout（链接信息/菜单浮层），不关文本选择**。MDN 原文：「controls the display of the default callout shown when you touch and hold a touch target… This property allows disabling that behavior」。关选择要用 `user-select`；该属性**非标准**，无规范 | 非标准（Safari / iOS WebKit 系） | [MDN `-webkit-touch-callout`](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout) · Apple 归档 [Safari CSS Reference](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariCSSRef/Articles/StandardCSSProperties.html) |
| F4 | `overscroll-behavior` | **Safari 16.0 起支持**（Apple 发布说明原文：「Added support for Overscroll Behavior.」）。但**它挡不住 iOS 的下拉刷新**：WebKit bug「overscroll-behavior:none or overscroll-behavior:contain doesn't disable pull to refresh」，2024-06-27 报，WebKit 工程师 2024-06-28 在 iOS 18 beta 复现，查证日状态仍为 **NEW** | Safari / iOS 16.0+（14.5–15.8 默认关闭） | [Safari 16 Release Notes](https://developer.apple.com/documentation/safari-release-notes/safari-16-release-notes)（2022-09-12）· [WebKit Bug 275947](https://bugs.webkit.org/show_bug.cgi?id=275947) · [caniuse css-overscroll-behavior](https://caniuse.com/css-overscroll-behavior) |
| F5 | Safari 的返回手势占用哪块区域 | **LTR 下＝屏幕左边缘的「屏幕边缘平移」**：WebKit 的返回/前进滑动实现（`ViewGestureController`，Safari 与 WKWebView 共用）里 Back 方向 `setEdges: isLTR ? UIRectEdgeLeft : UIRectEdgeRight`（本项目 `<html lang="zh-CN">` 是 LTR ⇒ 左边缘）；识别器是 `UIScreenEdgePanGestureRecognizer` / `_UIParallaxTransitionPanGestureRecognizer`，Apple 文档定义为「panning gestures that **start near an edge of the screen**」，且 `shouldReceiveTouch` 恒返回 YES——**页面无法用 JS/CSS 拒绝这次触摸**。**边缘条的具体宽度 Apple 未公开** → §7 P5 | iOS 7+（`UIScreenEdgePanGestureRecognizer` 可用性）；具体 Safari 版本无关 | WebKit 源码 [ViewGestureControllerIOS.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/ViewGestureControllerIOS.mm)（`gestureRecognizerForInteractiveTransition:`）· [Apple: UIScreenEdgePanGestureRecognizer](https://developer.apple.com/documentation/uikit/uiscreenedgepangesturerecognizer) |
| F6 | 点击延迟（顺带核） | 本页**不需要**为手势去关 300ms 延迟：iOS 10+ 的 fast tap 前提是「有 viewport meta + `width=device-width` + scale 1」，本仓 `layout.tsx:14-18` 已满足 | iOS 10+ | 同 F1（同一篇 WebKit 博客 「Fast Tapping」节） |

> 与竞争产品的口径无关：本表只回答「浏览器能不能」，产品参照（YouTube 双击 ±10s、每日英语听力长按倍速、抖音下滑锁定）见 `docs/design/mobile/reference/competitor-patterns.md` §3.6。

---

## 7. → 真机验证点（转交 §3，别自己写那个文件）

> 这一节只列**只有真机能定**的项；每条给「怎么做 / 看什么 / 通过标准」。建议一次性做成一张探针页（`#22` 已有 `docs/design/mobile/baseline/dev-probe.html` 的可复用套路：拷进 `frontend/public/`，手机开局域网地址）。**不要**把这些写成 Chromium e2e——桌面模拟量不出浏览器手势。
>
> **与 §3 已建探针页的对账（2026-10-01，读同目录 `probe-device-check.html`，本稿不改它）**：它的 **D1**（双击是否缩放：`manipulation` vs 默认两块）已覆盖本节的 **P1 + P2**；它的 **D2**（长按：`select-none` vs `-webkit-touch-callout:none`）已覆盖 **P4**；它的 **D3**（单词单击延迟）是本节 F6 的实证补强，不计入必须项。**尚未仪表化的五项**：**P3**（`touchstart` preventDefault）、**P5**（边缘返回占用多宽）、**P6**（iOS 26 中部起滑是否也返回）、**P7**（把手下拉与 Safari 下拉行为）、**P8**（画框上纵向拖是否滚页）——请 §3 决定是并进那张页还是单开。
> 注：P1 的判据用 `visualViewport.scale`，**不要**用「`dblclick` 有没有到」当判据（双击事件在任何情况下都会到，缩放与否只看 scale）。

| 编号 | 探针 | 怎么做 | 通过标准 |
|---|---|---|---|
| **P1** | 双击到底会不会缩放 | 画框上双击；双击前后读 `visualViewport.scale`（并目视画面是否放大） | 记录读数。**scale 不变 = 该机型/该 iOS 版本双击不缩放**；scale 变大 = 双击会缩放，第 1 条必须走 P2 的收窄方案 |
| **P2** | `touch-action: manipulation` 是否已挡住双击缩放（F2b 的落地版） | 同页放三块 100px 高的色块，分别 `auto` / `manipulation` / `none`；在每块上双击，记录 `visualViewport.scale` | manipulation 块 scale 不变 → 直接用 manipulation（保留滚页 + 捏合）；若 manipulation 块仍放大 → 只能对该区域用 `none`，并在报告里写明「代价：从画面起手不能滚页」 |
| **P3** | `touchstart` 上 `preventDefault()`（`passive:false`）能否替代 `touch-action` | 第四块：`touchstart` 里 `preventDefault()`，双击看 scale；同时上下拖动看页面是否还能滚 | 若「不缩放 + 还能滚页」同时成立 → 优选这条（既保住滚页又关掉缩放）；否则回到 P2 |
| **P4** | 长按画面真的不出系统 UI 吗 | 在画框画面区、入画字幕词上各长按 1s，观察：文本选择高亮 / callout 菜单 / 视频自身菜单（分享、画中画）/ 无反应 | 记录四种结果。**只有「无反应」才能把长按当手势用**；出 callout 则需要补 `-webkit-touch-callout: none`（并确认补了之后选择是否仍在） |
| **P5** | 边缘返回占用多宽 | 在 x = 0 / 8 / 16 / 24 / 32 / 48 处各做一次向右的 60px 水平短拖，记录从哪个 x 起会触发返回（页面 pop） | 得到「安全起始 x」。**水平擦洗（若勾「做」）必须避开它**；同时给 #30 的迷你窗拖拽一个参考值 |
| **P6** | iOS 26 的返回手势是否扩到了中部 | 若用户机已升级 iOS 26+：从屏幕中部（x≈中点）向右短拖，看是否返回 | 若中部起滑也会返回 → 画面上任何横向手势都不可行（第 2 条只能不做）；**注意：本条的一手依据没取到**（只有二手报道称 iOS 26 扩大了返回手势起点，Apple 论坛帖正文需人机校验未取到），所以必须实机验，不能引用我这份稿的措辞当结论 |
| **P7** | 下拉与 Safari 自带行为是否打架 | ① 词卡把手（375×812 实测 y≈359）向下拖 80px；② 抽屉把手（y≈367）同样；③ 页面滚到最顶后于画框区域向下拖 | **不刷新、地址栏不跳、页面不露白**＝把手方案安全。任一条触发刷新 → 把手也要加 `overscroll-behavior: contain` 并重测（注意 F4：这条 CSS 不保证有用，需以实机为准） |
| **P8** | 画框上「拖一下滚页」今天到底通不通 | 在画面区（含入画字幕块）纵向拖 100px，看页面是否滚动 | 记录读数。这是第 1/2 条选 `manipulation` 还是 `none` 的决策输入：若纵向拖动本来就不滚页（今天就有别的东西挡着），`none` 的代价为零 |
| **P9** | 下滑关闭与卡内滚动是否互斥（若第 4 条勾「扩到卡体」才需要） | 词卡/抽屉内滚动区滚到顶后继续下拉 80px | 期望「不关」。出现误关＝该选项不可行，回退到「只做把手」 |
| **P10** | 词卡把手下拉缺一条 e2e（`#29` 顺带交付给 §3 的补测点） | 现仓只有抽屉那条（`mobile-wordcard-drawer.spec.ts:245-250`）；`word-card-grab` 这个 testId 没有任何用例引用它 | 补一条同款断言（下拉 >64px → 词卡消失；<64px → 不消失），归「真机验收清单与 e2e 补测点」那一节 |

---

## 8. 代码现状（本稿的事实底座，行号为 2026-10-01 的仓库状态）

| 事实 | 位置 |
|---|---|
| 全仓**零手势**：除下面两处外没有任何 `touch-action`；没有任何 `dblclick` / 长按 / `contextmenu` 处理器；无手势计时器 | 全仓 grep：`touch-action|touch-none` 仅 `WordTooltipInline.tsx:384`、`SheetHandle.tsx:64` |
| 画框（375 档出血满宽，贴壳顶） | `page.tsx:928-937`（`w-screen` + `-mx-4` + `-mt-6`） |
| 播放器表面：`onClick` → 移动端点出/收起控制条；`isMobile` 时初始不可见；闲置 3s 自收（`HIDE_DELAY_MS = 3000`） | `VideoControls.tsx:135-137, 153-168, 194-197, 221-235` |
| 入画字幕块（贴画框最下沿）+ 3px 细进度（纯展示，`pointer-events-none`） | `VideoControls.tsx:200-218`；字幕块是控制条根节点（`select-none`）的子节点 |
| 点词：词 span 自己吞掉点击再查词（所以点词不会顺手切控制条） | `page.tsx:788-805`（`e.stopPropagation()` + `handleWordClick`） |
| 词热区：行内 22px 行距 + `::after` 外扩 4px，44px 做不到 | `globals.css:618-628`；实测口径见 #27/#22 |
| 文稿列表：每行 `<button>` → 跳句；行内词**无** `onClick` | `page.tsx:1436-1467` |
| 页面滚动主体是 `main#main-scroll`（壳 `h-dvh overflow-hidden`，`window.scrollY` 恒 0） | `MainLayoutInner.tsx:64, 71-76` |
| viewport：`width=device-width, initial-scale=1, viewportFit=cover`（**没有** `user-scalable` / `maximum-scale`） | `layout.tsx:14-18` |
| 下拉开关系数：把手专用、>64px 关闭 | `SheetHandle.tsx:6, 28-50, 64`；词卡 `WordCardSheet.tsx:76-83`；抽屉 `ShadowingDrawer.tsx:140-147` |
| 抽屉内容区自带滚动 + `overscroll-contain` | `ShadowingDrawer.tsx:168` |
| 词卡：顶边 = 画框下沿、高度随内容、底边不越底栏 | `WordCardSheet.tsx:59-75`；读数 `mobile-wordcard-drawer.spec.ts:121-146`（375 档：画框底 358.9 = 词卡 top，底栏顶 767.0） |
| 迷你窗：`fixed bottom-4 right-4` 160px 小盒 + 24px 关闭按钮（低于 44px 基线） | `page.tsx:946, 1049-1056`；基线读数 `baseline/README.md:33` |
| 迷你窗在 375×812 上可能就是进场态（e2e 里要主动点 X 退出小窗才量内联播放器） | `mobile-wordcard-drawer.spec.ts:106-112`（形态与触发条件归 #30） |

---

## 9. 与本线已拍板口径的关系

- **#26**：把手下拉关闭已落地（抽屉），本票**认可并保留**，只补「不扩到卡体」这条边界。→ 勾第 4 条 = 维持现状，不新增开发量。
- **#27**：点词只在画面内那句可用、不引入新手势——本票的第 1 条**也不碰点词**（分区见 §3），第 3 条若做则属于「第二个新手势」，这正是建议它不做的原因之一。
- **#28**：控制条点出 + 3s 自收——本票的单击/双击裁决建立在它之上（第一下点立即生效），提示也复用它那 3s。
- **#30**：迷你窗形态与收缩轨迹归它；本票只判「迷你窗不接下拉关闭」，以及把 P5（边缘安全起始 x）与 P6 的读数作为它的输入。
- **touch-targets.md / device-acceptance.md**：本票不写这两个文件，只交 §7 的探针与 P10 的 e2e 缺口。

## 10. 不做与暂不做（防止实现期默认掉）

- 不做：抖音式「长按 + 下滑松手锁定 2×」（要状态机 + 与滚动/选择抢同一块屏幕，参照稿那句提示语本身就是二手文案）。
- 不做：竖向音量 / 亮度手势（`competitor-patterns.md` §3.6 只记了 B 站有，本仓音量在移动端本来就不显示）。
- 不做：双击缩放区域的任何「关掉整页缩放」写法（`user-scalable=no` 在 iOS 上无效，`touch-action: none` 上到壳会挡住低视力用户放大——MDN 明确警告）。
- 暂不做（等真机读数）：页面级换句手势（左右滑换上一句/下一句——与边缘返回、与文稿滚动抢同一块屏）、迷你窗拖拽贴边（归 #30）。
