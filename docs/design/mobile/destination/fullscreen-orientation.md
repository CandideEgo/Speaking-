# 全屏与方向策略（wayfinder #25）

2026-10-01 · 决策稿（本票只出结论与证据，不改 `frontend/src/**`）
上游：wayfinder 地图 [#20](https://github.com/CandideEgo/Speaking-/issues/20) · 本票 [#25](https://github.com/CandideEgo/Speaking-/issues/25)
相关已拍板： #23（竖屏优先、看+点词为主）· #26 乙（跟读底部抽屉）· #27 乙（词卡贴画面下沿）· #28 乙（控制条点出）· **DEC-069（移动端播放页 = 壳的两个栏；画面内零文字，当前句在画面正下方的当前句卡里）**
相关不变量：INV-019（底栏常规流）· INV-020（`dvh`）· INV-021（当前句只渲染一次）· INV-022（词卡/抽屉几何）· INV-024（首屏即画面、出血满宽）

> **形态更新（读本文前先看这条）**：DEC-069 之后移动端播放页走壳层两栏 —— 44px 观看页顶栏 + 常规流观看页底栏，
> **画面内零文字零覆盖物**，当前句卡在画面正下方；`VideoControls`（含「更多设置 → 全屏」那条路）**只在 ≥1024px 渲染**。
> 所以本文里凡提「入画字幕」「移动端控制条」「伴侣条」的句子，说的都是那个已经换掉的形态；结论没变，
> 但**理由与读数都按新形态改写了**（§1.3 / §1.5 / §1.6 / §3 / §4.2 与文末 P2–P5）。

## 0. 结论

**推荐 丙 · 不做全屏**，并且这不是「省事」，是三件要做的事：

1. **iPhone 上撤掉全屏入口**（能力门控：只在真的能做元素全屏的浏览器上渲染，见 §4.4）。**移动端今天连入口都没有**（控制条不渲染、⋯ 面板里也没有全屏），所以这一步在手机上落地成了「确认没有、保持没有」；真要给 iPad 一个入口，得记住按下去就是把整块播放器交出去——当前句卡、点词、文稿列表、壳的两个栏一起消失（§1.5、§2-F2/F3）。
2. **替代路径 = 横屏自适应**（用户手动旋转，不做方向锁定）：iPhone 上没有 `screen.orientation.lock()`（§2-F4），但旋转本身不需要它。竖屏已经把画面宽度用满（画框 375 宽 = 视口宽），全屏给不了任何额外像素；能变大的只有横屏，而横屏是旋转白送的（§4.2）。
3. **「全屏」不再作为设计变量**：任何自绘伪全屏都要跟地址栏、`dvh` 口径、滚动锁、退出发现性和 #29 的手势集重新对账，而它换来的画面增量是 **0**（§3-甲）。

一句话理由：**竖屏全屏买不到一个像素；原生全屏要拿整个学习层去换横屏那块面积——那块面积旋转手机就有。**

---

## 1. 现状核准（代码事实；行号基于 2026-10-01 工作树）

票面说「现在的全屏按钮在 iPhone 上很可能按下去就是学习功能全没」，先回答「这个按钮到底存不存在、在哪」。

### 1.1 按钮存在，有两个，移动端那个藏在「更多」里

| 入口 | 位置 | 行号 | 可发现性 |
|---|---|---|---|
| 桌面内联 | `VideoControls` 控制条右侧、`<Maximize size={16}/>` | `VideoControls.tsx:446-458`（`aria-label="全屏（F）"` 在 `:453`） | 一次点击；有 aria-label |
| **移动端**（≤1023px 走这条） | **「更多设置」弹层里的第三项**：`<Maximize size={12} /> 全屏` | `VideoControls.tsx:429-438`（按钮）、`:362-369`（「更多设置」按钮，32×32）、`:370-441`（弹层） | **三次点击**：① 点画面 → 控制条浮起 ② 点「更多设置」 ③ 点「全屏」；**该按钮没有 `aria-label`**，可用名来自文本「全屏」；高度照类名估 ≈26px（`w-full py-1 text-[12px]`，< 44px，**未在 app 内实测**，探针 P2 量真值） |

> **这一节说的是那个入口为什么设计得深。现在它在手机上已经**不可达**了**：移动端播放页换成壳层两栏之后，`VideoControls` **只在 ≥1024px 渲染**，
> 「点画面 → 控制条浮起」这条路不存在；而移动端唯一的抽屉是 ⋯ 面板（`watch-more-sheet`），里面是语言 / 字号 / 倍速 / 来源版权 / 动作行，**没有全屏**。
> 所以「手机上有没有全屏入口」现在是**要现场确认的一项**（真机步骤见文末 P2），不是既定事实。

> 更正 `docs/design/mobile/baseline/README.md:73`（#22 基线）里那句话的读法：「移动端控制条上按 `aria-label` 找不到全屏按钮」字面成立（移动端那个确实没写 `aria-label`），**当时也不能读成「移动端没有全屏按钮」**——它在，只是藏在「更多」里；按 `getByRole('button', { name: '全屏' })` 找得到。同时注意 #28 落地后移动端控制条静息是收起的（`VideoControls.tsx:135-137`、`:221-233`），所以「找按钮」这件事当初就多了一层前置条件。**现在这一整条路径已经不可达（见上一段的方框）**：那句更正保留下来是为了说明当时那个按钮的位置，不代表今天在手机上还找得到它。

### 1.2 哪条路径会触发 `requestFullscreen()`

```
点「全屏」（VideoControls.tsx:431-433，移动端 / :449-452，桌面）
  └─► toggleFullscreen()                      useVideoPlayer.ts:580-599
        ├─ 已在全屏 → document.exitFullscreen()          :583-586
        ├─ el.requestFullscreen 是函数 → el.requestFullscreen().catch(enterIosFullscreen)   :594-596
        │      el = fullscreenElRef.current
        └─ 否则 → enterIosFullscreen()                    :598
               └─ videoRef.current?.webkitEnterFullscreen?.()   :589-592
F 键同款（桌面快捷键）                          useVideoPlayer.ts:643-646
```

`fullscreenElRef` 绑的不是 `<video>`、也不是出血的画框外层，而是**画框内层那个 `absolute inset-0` 的 div**（`page.tsx:938-948`，赋值在 `:939-942`）。

### 1.3 全屏元素里今天有什么（这是票面最过时的一处）

那个 div 的子节点是：`<video>` + 一层 `absolute inset-0` 的播放器外壳，**里面没有覆盖物**——
移动端标题 overlay / 返回键 / 退出 X / 级别药丸 / 入画字幕**全部删掉了**（标题与返回进壳顶栏、级别进壳顶栏、当前句进画面正下方的当前句卡），
`VideoControls` 只在 ≥1024px 渲染。所以 ≤1023px 的全屏元素里**只有视频本体**。

而当前句与点词今天住在**画面正下方的当前句卡**里（`components/watch/CurrentSentenceCard.tsx`，
移动端与桌面端都是唯一的一份，`data-testid="current-sentence-card"`；见 INV-021 的现文）——
**它在全屏元素之外**，`<video>` 是它的兄弟，不是祖先。

**所以票面那句话要按当前形态再读一遍**：「字幕与点词住在播放器外面的卡片里」——**现在确实又成立了**（当前句卡在画框下方、不是覆盖层）。
但这不改变票面的结论，只是换了个原因：iPhone 上根本不走元素全屏，而走原生播放器（§2-F2/F3），
**页面的 DOM（包括那张当前句卡）不参与原生全屏的合成**。也就是说，无论当前句画在画面里、还是画在画面外，
**iPhone 上用全屏看片都只剩一块不能点词、没有字的视频**——因为原生播放器不看页面。

### 1.4 失败/回退链与退出路径

- **入口**：≤1023px **没有可见入口**（移动端控制条不渲染，⋯ 面板里也没有全屏），所以下面这条链在手机上今天**走不到**；它在桌面（≥1024）与 iPad 上仍然是活路径。
- **回退**：`requestFullscreen` 不是函数 → 直接 `webkitEnterFullscreen()`；是函数但 reject → `.catch()` 里同一个函数（`useVideoPlayer.ts:594-598`）。两者都不存在时**静默无任何反馈**（没有 toast、没有状态变化）。
- **退出**：只有 `document.exitFullscreen()`（`:583-586`），判据是 `document.fullscreenElement`。**iPhone 原生全屏下 `document.fullscreenElement` 恒为 `null`**（该属性只在**元素**全屏时置位，系统播放器全屏不是元素全屏）→ **App 自己没有任何退出路径**，只能靠系统播放器自己的「完成/Done」。代码里也没有 `video.webkitExitFullscreen()` 的调用。
- **`webkitEnterFullscreen()` 可能抛异常**：WebKit 源码里它要求「用户手势 + 播放器支持全屏 + 不在切换中」，否则 `throw InvalidStateError`；本仓调用点没有 `try/catch`（`useVideoPlayer.ts:592`）。

### 1.5 按下去，三类设备各看到什么

| 设备/浏览器 | 走哪条分支 | 结果 |
|---|---|---|
| **iPhone Safari** | `requestFullscreen` 不存在或 reject → `webkitEnterFullscreen()` | **交给 iOS 原生播放器**（整屏视频 + 系统控制）。当前句卡 / 点词 / 壳顶栏 / 壳底栏 / 文稿列表全部消失；App 无退出路径。**票面结论成立**（不过手机上现在也没有按钮可按，见 §1.1） |
| iPad（768–1023 走移动版式）、Android、桌面 Chromium/Safari 16.4+ | `div.requestFullscreen()` 成功 | **元素全屏**：全屏元素里**只有视频本体**（MOV 移动端的覆盖物全删了），而当前句卡在**元素之外** → 全屏后**画面在、字不在、点词也不在**（Chromium 上实测见 1.6；iPad 待 P9）；同样被挡在外面的还有文稿列表、词卡浮层、壳的两个栏 |
| 桌面 ≥1024 | 同上 | 元素全屏只包住画面，`VideoControls` 跟着进去（所以桌面控制条还在）；当前句卡在画框下方、在元素之外 → 全屏后字幕确实消失。**桌面不在本图范围** |

> 三种情况**共同的一点**：当前句与点词都在全屏元素之外，所以**任何**设备上元素全屏都会把它们关在门外——这是 DEC-069 把当前句搬出画面之后新增的一条结构性事实，比「iPhone 走原生播放器」更普遍。

### 1.6 顺手量到的事实（Chromium，375×812，`isMobile/hasTouch`）

拿本仓 `frontend/node_modules/playwright` 跑的一次性探针（结构照抄本页：`overflow-y-auto` 的滚动容器 + `position:relative;aspect-ratio:16/9` 画框 + `absolute inset-0` 内层 + 贴底的入画字幕 + 65px 控制条），点一次 `requestFullscreen()` 后的读数：

| | 进全屏前 | 进全屏后 |
|---|---|---|
| `document.fullscreenElement` | `null` | `inner`（那个 `absolute inset-0` 的 div）✅ |
| 内层 div `getBoundingClientRect` | 375×210.9 @ (0,0) | **375×812 @ (0,0)**（铺满了视口；作者的 `position:absolute` 没有阻止它填满）|
| 入画字幕带 | y147.2 h60.8 | y748.2 h60.8（**仍在屏内**）|
| 控制条 | y145.9 h65 | y747 h65 |

根据当前 DOM，那张读数表还要**再减掉两块**：画面里画着的那两样（贴底的入画字幕 + 65px 控制条）今天都不在移动端画面里了 —— 当前句卡在**全屏元素之外**，控制条在 ≤1023px 根本不渲染。所以竖屏全屏下移动端能得到的只剩视频本体：**375×210.9** —— `object-contain` 只能按宽度贴满，多出来的 601px 是黑边。**竖屏全屏对「画面变大」的贡献是 0。**

### 1.7 附近还确认了三件事

- **全仓没有 `<track>` / WebVTT 字幕轨**（`frontend/` 全量 grep 无命中）→ 就算走原生全屏，系统播放器也没有任何字幕可渲染。
- **全仓没有任何方向处理**：`frontend/src/` 里 `orientation` 0 命中 → 旋转手机今天只会得到「一个 812 宽、456.75 高的画框卡在 375 高的视口里」。
- **没有任何全屏相关的 e2e 断言**（`frontend/e2e/` 里 `fullscreen`/`全屏` 0 命中）→ 撤入口不会打脸现有回归。

---

## 2. 平台事实（逐条给一手来源 + 支持版本 + 查证日期：均 2026-10-01）

| # | 事实 | 支持版本（含 iPhone / iPad 分叉） | 来源 |
|---|---|---|---|
| F1 | `Element.requestFullscreen()` 在 iOS Safari **仍然只有 iPad 有** | `ios_saf`：3.2–11.4 不支持；**12.0 起 partial，一直到 27.2 仍是 partial**；caniuse 的 partial 注解原文：「supporting only **iPad, not iPhone**」。桌面 Safari：**16.4 起**才是完整支持 | [caniuse-db `fullscreen.json`](https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/fullscreen.json)（note #5）· [caniuse.com/fullscreen](https://caniuse.com/fullscreen) · [caniuse.com/mdn-api_element_requestfullscreen](https://caniuse.com/mdn-api_element_requestfullscreen)（`Safari on iOS 27.1-27.2: Partial`）|
| F2 | `HTMLVideoElement.webkitEnterFullscreen()` = **交给播放器自己的全屏**，不是元素全屏 | WebKit 源码：入口要求「用户手势 + `supportsFullscreen()` + 不在切换中」，否则 `throw InvalidStateError`；`defaultVideoFullscreenRequiresElementFullscreen()` 在 iPhone/iPad 上返回 **false**（只有 visionOS 例外），配套注释是 `// Fullscreen implemented by player.` | [WebKit `HTMLVideoElement.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/HTMLVideoElement.cpp)（`webkitEnterFullscreen()`、`supportsFullscreen()`）· [WebKit `WebPreferencesDefaultValues.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebKit/Shared/WebPreferencesDefaultValues.cpp) |
| F3 | 原生全屏接管后，**页面 overlay 不在**（字幕、点词热区、伴侣条一并消失） | Apple 存档文档原文：「Safari optimizes video presentation for the smaller screen on iPhone … playing video using the full screen … **Video is not presented within the webpage**」「Controls are always supplied during fullscreen playback on iPhone」；WKWebView 侧同一件事写作「use the **native full-screen controller**」（默认 iPhone `false` / iPad `true`）；caniuse 的 iOS partial 注解还附带一句「Shows an **overlay button which can not be disabled**」（即这套 partial 支持自带的浮层按钮，站点关不掉） | [Safari HTML5 Audio and Video Guide · iOS-Specific Considerations](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html)（Apple，2012-12-13 更新，早于 `playsinline`，但「原生全屏 = 系统播放器、页面不参与合成」这条结构事实未变）· [WKWebViewConfiguration.allowsInlineMediaPlayback](https://developer.apple.com/documentation/webkit/wkwebviewconfiguration/allowsinlinemediaplayback)（Apple，现网文档）|
| F4 | `screen.orientation.lock()` 在 iOS Safari **从未实现** —— 票面断言成立，但要说清范围 | MDN BCD：`ScreenOrientation.lock` → `safari: {version_added: false}`、`safari_ios: mirror`（即永不支持）；caniuse 逐条页：Safari 3.1–27.2 全部 Not supported、Safari on iOS 3.2–27.2 全部 Not supported。**但**：`screen.orientation` 这个**读**接口（`type`/`angle`/`change`）自 Safari 16.4 起存在（caniuse 聚合页记 16.4+ Supported）——「从未实现」的是 `lock()`，不是整个 API | [MDN BCD `api/ScreenOrientation.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ScreenOrientation.json) · [caniuse.com/mdn-api_screenorientation_lock](https://caniuse.com/mdn-api_screenorientation_lock) · [caniuse.com/screen-orientation](https://caniuse.com/screen-orientation) |
| F5 | 票面「iOS Safari 记 partial support」的读法 | 仍准确，且**到今天（ios_saf 27.2）没变**：caniuse 的 partial 就是 F1 那条注解——**iPad 有、iPhone 没有**。换句话说：不是「部分功能」，是「部分设备」| 同 F1 |

**结论（不再依赖真机猜测的那一半）**：票面写「这条结论没出来之前，甲乙之争取决于原生全屏到底丢不丢交互，属于猜测」。现在有 WebKit 源码 + Apple 文档两条一手证据：**iPhone 的原生全屏 = 系统播放器，页面 DOM 不参与**，而本仓的当前句/点词全是 DOM、且在**全屏元素之外**（且没有 `<track>` 可退而求其次）→ **丢**。真机那一条（文末 P3/P4）现在的作用是**复验**，不是**裁决**。

---

## 3. 三条路逐条

参考机型 **375×812**，画框 375×210.9（INV-024）、**画面内零文字零覆盖物**（当前句卡在画面正下方，高约 90–108px）、观看页底栏 101px 常规流（44 进度热区 + 56 键行 + 1px 边；INV-019），Safari 地址栏收放差 40px（`100vh`/`100lvh` 790 vs 可视区 750；真机实测在 414×896，见基线 README）。

### 甲 · 自绘伪全屏（不调 Fullscreen API，`fixed` 铺满 + 自锁滚动 + 自建退出）

**375×812 上的实际效果**：画面本体**仍然是 375×210.9**（竖屏宽度就是上限，`object-contain` 再多也只会加黑边，§1.6 实测 + 推算）。也就是说伪全屏在竖屏下唯一能改变的是「画面占多大一块」——而画面里今天一个字都没有、也没有任何覆盖物（INV-021），所以**收益上限 = 0 像素**。

**代价**：
- **拿不到 Safari 工具条让位**：真正能藏掉 Safari 上下工具条的只有原生全屏或「加到主屏」（standalone）；本项目没有 manifest。地址栏的收起靠滚动，而伪全屏第一件事就是锁滚动 → 地址栏留在原地。**「全屏」最直观的那个收益在甲这条路上兑不了。**
- **`fixed` 在 iOS Safari 锚 layout viewport（= `100lvh`）**：真机实测 `100vh`/`100lvh` 恒 790 而可视区 750（INV-019/020）→ `fixed inset-0` 的自绘全屏底边会落在可视区下方 40px，正好是退出按钮要放的位置。要驯服它就得重走一遍 INV-019 的老路：不用 `fixed`，改成壳内 `h-dvh` 的常规流层，或读 `visualViewport` 现算——**这两样都是新的机制，不是一个 class**。
- **滚动锁要针对容器写**：滚动容器是 `main#main-scroll`（`MainLayoutInner.tsx`，`flex-1 overflow-y-auto`），`window.scrollY` 恒 0（INV-022 已记这个坑）→ 锁滚动/还原位置都必须操作那个容器，不是 `body`。
- **退出方式的可发现性**：要自建一个常驻 44px 退出控件（挤占画面），或者一条手势——但**画面上的单击今天没有别的语义了**（点画面不再浮起控制条），纵向手势又被「把手下拉关闭」占着（#26 已落地、#29 在同一块屏幕上成型）→ 甲 要么在画面里挤一个退出键，要么和 #29 打架，**第三条路是让用户去按 Safari 的返回**（那就不是全屏了）。
- **几何连坐**：词卡卡口 = 画框下沿（#27 复议结论）、抽屉顶边/词卡底边的算法都锚在「画框在哪」（INV-022 的 `useSheetGeometry`）——伪全屏把画框搬走一次，这套几何要重算一遍。

**判决：否。** 收益 0、代价是重开三条已经关掉的账（#29 的手势集、INV-019/022 的几何与 `fixed` 口径，外加一条新造的退出控件）。

### 乙 · 原生全屏 + 字幕搬进画面

**375×812 上的实际效果**：iPhone 走的是 `webkitEnterFullscreen()` → 系统播放器，**页面 DOM 不参与合成**（F2/F3）→ 进去以后**当前句卡、点词、壳顶栏、壳底栏、文稿列表一起消失**，App 连退出按钮都没有（`document.fullscreenElement` 恒 null，§1.4）。**而在能走元素全屏的设备上（iPad / Android / 桌面）也一样看不到字、点不了词**——因为当前句卡在全屏元素之外（§1.5）。全屏里能得到的最大画面是横屏的 666.7×375 ≈ 250k px²，但那是**一块不能点词、不能看字幕的视频**——对一个「看 + 点词为主」（#23）的产品等于把功能关掉。

**代价**：当前句卡（移动端与桌面唯一的一份当前句）、点词热区、壳的两个栏、文稿列表，全屏后**一处都不在**；`<track>` 不存在 → 连系统字幕都没有（§1.7）。若真要走「原生全屏看片」这一支，必须另生成 WebVTT 轨并接受丢掉词级着色与点词——那是**另一个产品模式**（纯看片），不是本图的移动播放页。

**判决：否。**（真机 P4 只作复验；即便某项意外还在，也不足以换掉整层交互。）

### 丙 · 不做全屏（入口按能力门控 + 横屏自适应当替代）

**375×812 上的实际效果**：竖屏什么都不变（画面已经满宽、画面内零覆盖物，INV-024）；横屏由旋转触发一个**新的自适应版式**（今天不存在，§1.7）：视口 812×375，画面按高度贴满 → **666.7×375**，当前句卡挪到画面下方（横屏要按新视口重排它），可见画面 **666.7×375 ≈ 250k px²**，是竖屏同一口径（375×210.9 ≈ 79k px²）的 **≈3.2 倍**（按 16:9 计算，横屏工具条吃掉的量待真机 P7）。这 3.2 倍不需要 Fullscreen API、不需要 `orientation.lock()`。

**与已拍板决定的关系**：全部相容。#23 的「横屏当沉浸模式」本来就是 #20 的范围（目标设备那一节），丙 只是把它从「靠全屏 API 实现」改成「靠旋转 + 版式实现」；#27 的词卡卡口与 #26 的抽屉几何仍锚在「画框在哪」，横屏要重算一遍（INV-022）；#29 的手势集不需要为全屏让位或增设退出路径。

**代价（照账）**：失去「把画面交给系统播放器」这一条路——在 iPhone 上它等于关掉字幕与点词，所以真正失去的只是「纯看片」；若将来要做纯看片模式，那是新票（含 WebVTT 轨与后端产物），不属于本图。

**判决：选它。** 见 §4。

---

## 4. 推荐与替代路径

### 4.1 推荐

**丙 · 不做全屏。** 移动端不再把「全屏」当作设计变量；桌面（≥1024）的既有按钮不在本图范围，原样保留。

### 4.2 替代路径（这是「更优」而不是「省事」的地方）

| | 现在 | 丙 之后 |
|---|---|---|
| **竖屏 375×812** | 画框 375×210.9 出血满宽、顶贴 44px 观看页顶栏下沿，**画面内零文字**，当前句卡在画面正下方（约 90–108px），底栏 101px 常规流 | **不变**。全屏 API 在竖屏给不了第 376 个像素（§1.6 实测 + `object-contain` 推算），所以「不做」在这里的损失是 0 |
| **横屏 812×375** | 今天没有横屏版式：`w-screen aspect-video` 得到 812×456.75，比视口还高 82px → 溢出/滚动（§1.7） | 新增横屏自适应：画面按视口高度贴满（666.7×375），当前句卡按新视口重排到画面下方（**必须在全屏元素之外**），隐藏文稿列表并让壳底栏让位。可见画面 ≈250k px²，**≈3.2×** 竖屏 |
| **Safari 工具条** | 伪全屏藏不掉；原生全屏能藏但会关掉学习层 | 横屏时 Safari 自己会收起/下移工具条（滚动与旋转触发），用 `dvh` 系列跟住可视高度即可（INV-020） |

三条「为什么不是省事」：

1. **全屏 API 不是让画面变大的东西，视口才是。** 竖屏宽度已经被 INV-024 用到 100%，`requestFullscreen()` 在竖屏能做的只是把 601px 变成黑边（§1.6）。变大的唯一来源是旋转，而旋转不需要 API、也不需要（拿不到的）方向锁定。
2. **伪全屏兑不了它的核心承诺。** 自绘层藏不掉 Safari 的地址栏与工具条——那是原生全屏或「加到主屏」才有的能力；而它要付的是 `fixed` 锚 `100lvh` 的 40px 账（INV-019/020 真机实测过一遍的病历）、容器滚动锁、以及和 #29 抢画面手势。
3. **原生全屏在本产品里是负收益。** 换来的横屏面积靠旋转就有；付出的是当前句卡 + 点词 + 文稿列表 + 退出路径（§3-乙）。想在横屏里点词，**不能靠全屏 API，只能靠旋转后的自适应版式** —— 当前句卡永远得留在**全屏元素之外**，否则全屏一进去它就没了。

### 4.3 落地清单（供后续实现票拆分；本票不改代码）

| # | 事 | 规模 | 备注 |
|---|---|---|---|
| 1 | 移动端「全屏」入口按能力门控/撤掉（`VideoControls.tsx:429-438`） | 小 | 判据见 §4.4；桌面按钮（`:446-458`）不动。**移动端那条路已经随控制条一起不渲染了 —— 先按真机 P2 确认「手机上确实没有入口」**，有就撤掉、没有就什么都不做 |
| 2 | 横屏自适应版式（`(orientation: landscape)` + `dvh` 口径 + 当前句卡按新视口重排） | 中 | 新票；输入 = 真机 P7 的横屏可视区读数 |
| 3 | e2e：≤1023px 断言「画面里没有全屏入口、⋯ 面板里也没有」（若选撤掉而非门控） | 小 | 现有 e2e 无全屏断言，不会打脸（§1.7） |

### 4.4 若要保留入口：能力门控的最小判据（不要按机型写死）

```
渲染「全屏」入口  ⇔  document.fullscreenEnabled === true
                     && typeof fullscreenElRef.current?.requestFullscreen === "function"
```

- 这条判据的意图：**只在元素全屏真的可用的浏览器上给入口**（iPad / Android / 桌面），在 iPhone 上不给——因为那里的分支必然落到 `webkitEnterFullscreen()`（`:594-598`），那是不可逆地把学习层交出去。
- **判据本身必须真机先验**（探针 P1）：如果 iPhone Safari 上 `fullscreenEnabled` 也返回 `true`（历史上不同版本行为不一致），门控就退化，此时改成「首次调用失败即隐藏入口 + 给一次可见反馈」，或直接按 §4.3-1 撤掉。
- 反面清单（明确不要做）：① 用 `fixed inset-0` 做伪全屏（INV-019 的 40px）；② 在 `webkitEnterFullscreen` 之前不检查能力（现在的代码就是这样，等于把 `InvalidStateError` 留给用户）；③ 把 `orientation.lock()` 写进任何方案（F4）。

---

## 5. 与票面不一致的地方（3 处）

1. **「字幕现在住在播放器外面的卡片里」——两次翻转，今天又回到「在外面」。** #24/#28 落地后，≤1023px 的当前句曾被搬进**画框内**（`burn-subtitle`，`VideoControls` 的子节点，点词热区也一起入画）；DEC-069 之后它又搬出来了：当前句卡在**画面正下方**（`components/watch/CurrentSentenceCard.tsx`，移动端与桌面唯一的一份，`data-testid="current-sentence-card"`），画面里**零文字零覆盖物**。结论不变，但原因变了两次：iPhone 上丢字幕**不是因为字幕在卡里，而是因为原生播放器不合成页面 DOM**；而在能走元素全屏的设备上，它丢是因为**卡在全屏元素之外**（§1.3/§1.5）。
2. **「iOS Safari 记 partial support」需要补一句注解。** caniuse 的 partial 在今天（`ios_saf` 12.0–27.2）的含义是 note #5 原文「supporting only **iPad, not iPhone**」——**不是功能残缺，是设备分叉**；桌面 Safari 自 16.4 起反而是完整支持。这直接决定「甲/乙 在 iPad 上成立、在 iPhone 上不成立」。
3. **「`screen.orientation.lock()` 在 iOS Safari 从未实现」成立，但范围要写清**：MDN BCD 记 `lock` 为 `version_added: false`（Safari 与 iOS Safari 皆然，caniuse 到 27.2 仍 Not supported）；然而 `screen.orientation` 的**读**接口（`type`/`angle`/`change`）自 Safari 16.4 起是有的。别把「不能锁」写成「没有方向 API」——横屏自适应需要的是**感知**（媒体查询/`matchMedia`），这一点今天就能做。

> 附带两条基线更正（`baseline/README.md`，该文件不属本票改动范围，留给 #22 线的维护者）：
> ① 那条「按 `aria-label` 找不到全屏按钮」应改写为「移动端全屏按钮在『更多』弹层里、且没有 `aria-label`（可用名是文本『全屏』）」——按原话读容易得出「移动端没有全屏按钮」的错误结论，而本票的第 1 问正是来纠这个的；
> ② 那条更正自身的有效期也只到「移动端控制条还在」为止：DEC-069 之后 ≤1023px 的控制条不渲染，所以**现在手机上确实没有全屏入口**（这正是本票 §4.3-1 要撤掉的那个入口，撤与不撤都得先按真机 P2 确认）。

---

## → 真机验证点（转交 §3，别自己写那个文件）

机型/系统/Safari 版本逐条记下；量具用同目录的 `probe-device-check.html`（拷进 `frontend/public/`，登录后再开；`next.config.js` 的 `allowedDevOrigins` 已默认放行 `192.168.*.*`）。**探针页不算 app 代码。** 参考机型 375×812（若手上是 414×896 就照 414 记，读数标注机型）。

| # | 动作 | 读什么 | 通过标准 |
|---|---|---|---|
| **P1** | iPhone Safari 打开 `about:blank` 或量具页，在控制台/量具里跑能力探针 | `document.fullscreenEnabled`、`typeof document.createElement('div').requestFullscreen`、`typeof document.createElement('video').webkitEnterFullscreen`、`typeof screen.orientation`、`typeof screen.orientation?.lock` | 拿到真值即为通过。**若 `div.requestFullscreen` 是 `function` 且 `fullscreenEnabled === true`** → §4.4 的门控判据作废，改用「失败即隐藏 + 反馈」；若 `lock` 是 `undefined`（预期）→ 与 F4 一致 |
| **P2** | 打开播放页（375×812），不滚动：先看画面里有没有任何按钮/浮层；再点壳顶栏的 ⋯（`watch-more-button`）把面板打开，逐项看有没有「全屏」 | 画面内覆盖物计数；⋯ 面板里有没有全屏入口；若找到，量它的实测 height | **画面内覆盖物 = 0 且 ⋯ 面板里没有全屏入口** = 手机上确实没有入口（支持 §4.3-1「什么都不用做」）。任一处找得到 → 记下位置与高度，按 §4.3-1 撤掉或门控 |
| **P3** | **若 P2 找到了入口**：点它，观察画面。**没找到就跳过这一条并标注「入口不可达」** | 是否出现系统播放器外观（「完成/Done」、AirPlay、倍速）；`document.fullscreenElement`；`video.webkitDisplayingFullscreen` | 预期：系统播放器接管、`fullscreenElement === null`、`webkitDisplayingFullscreen === true`（证实 F2/F3） |
| **P4** | 在 P3 的全屏态里找四样东西 | ① 画面里有没有字（当前句卡）② 点一下当前句卡里的词 ③ 壳顶栏 ④ 壳底栏与文稿列表 | 预期**四项全部不在**（F3；元素全屏也看不到字，见 §1.5）。任一项在 → 乙 有讨论空间，必须回报并附图 |
| **P5** | 从 P3 退出（没入口就跳过） | 退出控件是什么、在哪、多大；App 自己的退出路径是否存在；退出后：播放是否继续、当前句卡是否还在画面正下方、壳底栏还在不在 | 预期只有系统控件的退出方式、App 无退出路径；退出后内联状态无损（画框仍贴 44px 顶栏下沿、当前句卡仍在画面正下方、底栏四个键仍可点） |
| **P6** | 伪全屏机理（同一台机，量具页，不改 app）：点「测伪全屏几何」，插一个 `position:fixed;inset:0` 的覆盖层，**不滚动**页面 | 覆盖层 `getBoundingClientRect().bottom` vs `visualViewport.height`/`innerHeight`；地址栏此时是否可见 | 预期 `bottom ≈ 100lvh`（比可视区多 ~40px）、且地址栏仍在（滚动被锁 → Safari 不会收起它）。这条决定甲是否连「省 40px」都做不到 |
| **P7** | 现行播放页**横屏**（旋转手机，不改代码） | `matchMedia('(orientation: landscape)')`、`visualViewport.width/height`、`100dvh` vs `innerHeight`、画框实测 rect（预期 812×456.75 → 溢出）、当前句卡落在哪 | 拿到横屏可视区与溢出量 = 通过（这是横屏自适应票的输入）。同时记 Safari 横屏工具条占了多少 |
| **P8** | 量具页 `[dev]` 段的 `screen.orientation.lock` 行（或控制台直接调） | 返回值 / 抛什么 | 预期 `TypeError: ... is not a function`（证实 F4） |
| **P9** | 若手上有 iPad（竖持 768–1023，会走移动版式） | 先按 P2 找入口；若有：会不会进**元素**全屏、进去后 P4 那四样是否还在、退出方式 | 预期：元素全屏成立，但**当前句卡与点词仍然不在**（它在全屏元素之外，§1.5）——所以「保 iPad 一个入口」保不住学习层，这条决定 §4.3-1 是「全撤」还是「按能力门控保 iPad」 |

**最小集**：**P2 + P3 + P4 + P5**（手机上到底有没有入口 → 按下去发生什么 → 丢了什么 → 怎么退出；没入口就只填 P2 并把后三条标「入口不可达」）；P6/P7/P8 是甲与横屏替代路径的输入，可与 #29/#30 的真机轮次合并跑一次。
