# 触控目标与可达性基线（wayfinder #20 · Destination §2）

2026-10-01。375×812 @2x、`isMobile` + `hasTouch` 的无头 Chromium，**在本地真实栈上量的**（dev :3000 + 后端 :8000 + docker db/redis），量的是运行中的真实 DOM。

**这份基线回答三个问题**：本图交付面（壳层 + 播放页 + 四个浮层态 + 登录）上有哪些可点/可擦目标、它们多大、**能不能真的点到**。
它**不是**一次全站无障碍审计：列表项、卡片、文稿列表里的词、个人页设置项都量了、也列了（§3 第 4 节），但不计进「关键路径」——那不是本图交付的东西。

> 三条最要紧的结论，先看这里：
> 1. **44×44 不是合规线。** WCAG 2.2 的 AA 线是 **24×24**（SC 2.5.8，还有间距豁免）；44×44 是 **AAA**（SC 2.5.5）+ Apple HIG 的建议值。出处与查证日期见 §1。
> 2. 按 AA 口径，本图交付面**只有一处真的不过**：播放页控制条上的**进度条**（`input[type=range]`，盒高 6px、有效命中 15px，2.5.8 fail）。其余 <24 的目标要么是行内文本（Inline 豁免），要么有 24px 净空（Spacing 豁免），要么能用同一页上的同等控件完成（Equivalent 豁免）——逐条见 §4。
> 3. **发现一个缺陷（不是量法问题）**：播放页画面内左上角的**「返回」键（44×44）接不到指针** —— 它的中心点上最上层的是 `VideoControls` 的覆盖层（两者都是 `z-10`，DOM 靠后的赢）。真机做法点它不导航、只把控制条点出来；`locator.click()` 直接超时。详见 §6。

---

## 1 标准与口径：44 是什么，不是什么

| 出处 | 是什么 | 数值 | 查证 |
|---|---|---|---|
| [WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum)（W3C Recommendation，2024-12-12） | **AA 合规线** | **24×24 CSS px**，或满足其中五条例外（Spacing / Equivalent / Inline / User Agent Control / Essential） | 2026-10-01 取 [Understanding 页](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)（该页标注 Updated 11 May 2026），逐字读到「The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when: …」 |
| [WCAG 2.2 SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/TR/WCAG22/#target-size-enhanced) | **AAA**（更严的一档，非合规下限） | **44×44 CSS px**，例外四条（Equivalent / Inline / User Agent Control / Essential） | 2026-10-01 取 [Understanding 页](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)（Updated 06 September 2026），逐字读到「Make custom targets at least 44 by 44 pixels.」与「The size of the target for pointer inputs is at least 44 by 44 CSS pixels…」 |
| [Apple HIG · Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)（Mobility → Offer sufficiently sized controls） | 平台建议 | iOS/iPadOS **默认控件 44×44 pt**；最小 28×28 pt | 2026-10-01 从 Apple 自己的 markdown 端点 `developer.apple.com/tutorials/data/design/human-interface-guidelines/accessibility.md` 逐字读到表格行 `|iOS, iPadOS|44x44 pt|28x28 pt|` |
| [Apple HIG · Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | 平台建议 | 「a button needs a hit region of **at least 44x44 pt**」 | 2026-10-01 同法读到 `…/buttons.md` 一行 |
| Google Material Design（48×48 dp） | 常被并列引用的第三个数字 | 48 dp | **没能取到一手原句**：SC 2.5.5 的 Understanding 页把「Google Material Design Touch targets」链到 [m2.material.io/design/layout/spacing-methods.html](https://m2.material.io/design/layout/spacing-methods.html)，而 m2 / m3 两页都是客户端渲染，2026-10-01 直接抓 HTML 拿不到那句话（m3 返回 0 字节正文）。**所以本文不拿 48dp 当依据**，只在需要并列时提一句 |

一句话口径：**24 是门槛（AA，可豁免），44 是上限型目标（AAA + Apple 建议）**。所以本基线不写「不合规」，只写「<44」「<24」与逐条的豁免判定；把 44 说成合规线是本图要避免的那个错。

顺带一条实测更正：网上最常被引用的那个 Apple 地址 [`/design/human-interface-guidelines/layout`](https://developer.apple.com/design/human-interface-guidelines/layout) **今天已经没有 44pt 那句话了**（改版后的 Layout 页讲栅格与安全区；页内 change log 显示 2026-09-09 更新）。要引 Apple 的 44，引 Accessibility / Buttons 两页。

### 本基线用的判据（四个数 + 两个判定）

| 字段 | 怎么来的 | 作用 |
|---|---|---|
| `rect w×h` | `getBoundingClientRect()` | 题面要的「逐条 w/h」，也是「<44 / <24」两列的来源 |
| `有效命中 w×h` | 从元素中心向上下左右逐像素 `elementsFromPoint()` 探，取**元素盒 ∪ 探到的可达范围** | WCAG 判的是「会接受指针动作的显示区域」，不是元素盒：`burn-sub-word::after{inset:-4px}` 这类外扩真的按得到，被相邻元素压掉的部分也真的按不到 |
| `<44` / `<24` | `w<44 || h<44`（两维都要够，SC 要求能放进一个对齐的实心方块） | <24 是 AA 的尺寸线 |
| `wcag258` | `pass` / `pass-spacing`（24px 圆不与任何相邻目标相交）/ `exempt-inline`（行内，行高约束）/ `fail` | **AA 结论**。间距判据按 SC 原文实现：以目标外接盒中心为心、直径 24 的圆，不与其它目标、也不与其它未达标目标的圆相交；祖先/后代候选算同一个目标，不互为「相邻」 |
| `wcag255` | `pass` / `exempt-inline` / `fail`（AAA 没有间距豁免） | **AAA 结论**（44 那一档） |

**豁免口径**（哪些位置结构上做不出，凭什么豁免）——这是判断，不是脚本算的，逐类写死在这里：

| 类别 | 判据 | 依据 | 本文适用对象 |
|---|---|---|---|
| **Inline** | 目标在句子里、尺寸被行高约束 | SC 2.5.8 / 2.5.5 的 Inline 例外；2.5.8 说得很直白：「text reflow … makes it impossible for authors to anticipate where links may be positioned」 | 入画字幕的**行内词**（§5）、文稿列表里的词、登录页底部三个法务链接、`真题练习`/`创建账号` 这类行内链接 |
| **Spacing** | <24 但 24px 圆不与邻居相交 | SC 2.5.8 第一条例外 | `忘记密码？`(60×16)、`去做真题`(76×20)、`合并一条`(56×20.5)、D10 标记（位置不挤时） |
| **Equivalent** | 同一页上有另一个达标控件能完成同一功能 | SC 2.5.8 第二条例外 | 两个浮层的**下拉把手**（375×16）：关闭同一功能的「关闭 / 取消」按钮 ≥44；D10 进度条标记（8×8）：跳句在文稿列表里也有 ≥44 的行按钮。**注意**：这是判过，不是「没问题」——把手的**拖拽**本身另有 **SC 2.5.7 Dragging Movements（AA）** 的要求（必须有单指针替代路径），那一条由上面那些按钮满足；不在本文的量程内，但 #29 手势集要认 |
| **不做豁免** | — | — | **进度条**：`input[type=range]` 是作者改过尺寸的原生控件（`h-1.5`），User Agent Control 例外不成立，也没有 Equivalent → **2.5.8 fail，这是真缺陷** |

---

## 2 量法（可复跑）

```bash
# 前置：docker db+redis 起来、后端 :8000、前端 dev :3000（本地栈）
cd frontend
node scripts/audit-touch-targets.mjs                      # 默认输出到 docs/design/mobile/destination/readings/touch-targets-375.json
node scripts/audit-touch-targets.mjs --emit-md            # 从同一份 JSON 生成文档里的表（§3 那些表就是这么来的）
node scripts/audit-touch-targets.mjs --only drawer        # 冒烟：只跑 route+state 含该子串的状态
```

- **量具**：`frontend/scripts/audit-touch-targets.mjs`，仓库自带 `frontend/node_modules/playwright@1.60.0` 的 chromium，`viewport 375×812`、`deviceScaleFactor 2`、`isMobile: true`、`hasTouch: true`、iPhone 17.5 Safari UA（与 `baseline/README.md` 同一口径）。
- **登录**：不碰短信注册（3/minute 限流）。脚本自己调后端 `.venv` 的 `app.core.security.create_token(user_id)` 铸 JWT，注入 `localStorage.seeword_token` + 同名 cookie（与 `frontend/e2e/helpers.ts:110` 同一招）。本次用的用户：`2f8bdb0b-feb2-494b-a25f-27c525c21337`（本地 dev 库按 `onboarding_completed desc, created_at` 取第一行；见 JSON `meta.userId`）。
- **枚举什么**：`button`、`a[href]`、`[role=button|link|switch|tab|checkbox]`、`input`/`select`/`textarea`、`summary`、`[onclick]`、`label[for]`、`[contenteditable]`、`[draggable]`、`.burn-sub-word`、`[data-testid$="-grab"]`、播放器覆盖面 `div.absolute.inset-0.z-10`，外加**启发式兜底**：`cursor:pointer` 且祖先不是目标。React 17+ 是事件委托 → DOM 里没有 `onclick` 属性，所以 `[onclick]` 这条实际命中 0，靠 `cursor:pointer` 兜住挂在 div/span 上的 onClick（这一条写在脚本里，别以为漏了）。`<video>` 只在带原生 `controls` 时算目标（本项目是 `controls=false` + 自定义控制条，实测 `videoHasControlsAttr: false`）。
- **稳定化**（否则两次跑没法比）：
  - 注入 `seeword_coach_done` 关掉 D2 教程浮层；
  - 视频**钉到 0 秒再暂停** —— 入画字幕的当前句由播放位置决定，不钉住它两次跑的字词集合就不一样；
  - 关掉 CSS 过渡/动画（读终值，不读动画中间帧）；
  - 探针跳过 dev 的 `<nextjs-portal>` 浮标（产品里没有它，留着会伪造「被盖」）；
  - **默认不写库**：把 `POST /api/v1/shadowing/attempts` 掐掉。跟读录音一旦落库，下次跑就会多出「D10 进度条标记」和「最近跟读」两族目标（实测：每次跑 +1~2 条），读数就不稳定了。唯一例外是 `overlay-drawer-history` 那一态（它就是来量这两族的），脚本会往它自己的 note 里写 `allowWrites`。
- 退出码 0 只表示「跑完了」；有 <44 目标不算失败 —— 这是测量，不是门禁。

## 3 读数（表 0–4 全部由 `--emit-md` 从同一份 JSON 生成，不要手改）

<!-- TABLES -->

## 4 <44px 清单（`文件:行号`、当前尺寸、能否修、动谁、是否在关键路径）

**先给三个数**（口径见 §1；计数都是「跨状态去重后的不同控件」；`overlay-controls-more` 那几行见 §3 表 2 的对应状态）：

| | 数量 | 说明 |
|---|---|---|
| 量到的目标 | 见 §3 各状态的「目标 N」 | 11 个状态各自枚举后合计，同一控件在多个状态里各算一次 |
| **<44px（rect 两维有一维 <44）** | 见 §3 表 3（关键路径，逐条）+ 表 4（关键路径外） | 计数随当时的数据（跟读历史）微动，见 §8 |
| **<24px（AA 的尺寸线）** | 见 §3 表 3/4 的 `<24` 列 | 逐条都带 2.5.8 判定：`pass-spacing` / `exempt-inline` / `fail` |
| **2.5.8 fail（真的不过 AA）** | **1 类**：播放进度条（外加两个浮层把手，可用 Equivalent 判过） | 其余 <24 全部落在 Spacing / Inline / Equivalent 三条例外里（§1 的豁免表） |

### 4.1 关键路径上的 <44px（逐条）

「关键路径」= 本图交付面：壳层常驻控件（顶栏 / 底栏）+ 播放页交互面（画框、入画字幕、控制条、词卡浮层、跟读抽屉、伴侣条动作行）+ 登录表单（唯一入口）。判据写在脚本的 `CRITICAL_CONTAINERS` 里。

| 目标 | 当前尺寸（rect / 有效命中） | `文件:行号` | 在关键路径 | 能否修 | 修的话动谁 |
|---|---|---|---|---|---|
| 顶栏 · 切换主题 | 40×40 / 40×40 | `frontend/src/components/layout/TopBar.tsx:358-366`（尺寸来自 `Button.tsx:46` 的 `icon: "w-10 h-10"`） | 是（壳层） | 能 | 在 `TopBar` 就地加 `min-h-[44px] min-w-[44px]`，**不要**改 `SIZE.icon`（admin/全站的 icon 按钮都吃它） |
| 顶栏 · 通知 | 40×40 / 40×40 | `TopBar.tsx:371-381` | 是 | 能 | 同上 |
| 顶栏 · 账号菜单 | 32×38 / 32×38 | `TopBar.tsx:392-398`（头像 `Avatar.tsx:14` 的 `md: "w-8 h-8"`） | 是 | 能 | 给外层 button 加 `p-1.5`（32+12=44 宽、38+12=50 高） |
| 顶栏 · SeeWord 首页（logo 链接） | 32×32 / 32×32 | `TopBar.tsx:277-282`（内层 `h-8 w-8` 在 `:278`） | 是 | 能 | 链接加 `p-1.5`；`sm:` 以上本来就带文字、更宽 |
| 顶栏 · 搜索 | 40×40 / 40×40 | `TopBar.tsx:316-318`（`LinkButton size="icon"`） | 是 | 能 | 同「切换主题」 |
| **播放页 · 返回键** | **44×44（尺寸达标）但接不到指针** | 目标 `page.tsx:1005-1012`；覆盖者 `VideoControls.tsx:194` | 是 | 能 | 层叠问题，不是尺寸问题：让标题 overlay 高于控制条，或让控制条根只在控制条区域接指针 → §6 |
| 播放页 · 播放/暂停 | 32×32 / 32×32 | `frontend/src/components/watch/VideoControls.tsx:273-280`（`w-8 h-8`） | 是 | 能 | 改 `w-11 h-11`；控制条那一行（375 宽）放得下：44 + 时间 ~90 + 44 ≈ 178 |
| 播放页 · 更多设置 | 32×32 / 32×32 | `VideoControls.tsx:362-369`（`w-8 h-8`） | 是 | 能 | 同上 |
| 播放页 · 更多弹层 · 字号 小/中/大 | 见 §3 表 2 的 `overlay-controls-more` | `VideoControls.tsx:375-392`（`flex-1 py-1 rounded text-[12px]`） | 是 | 能 | 加 `min-h-[44px]`；弹层 `min-w-[150px]`，三个并排每个 ≈44 宽 |
| 播放页 · 更多弹层 · 倍速 6 档 | 同上 | `VideoControls.tsx:400-417`（`px-2 py-1`） | 是 | 能 | 同上；6 个 `flex-wrap` 两行，行高提到 44 后弹层变高（`bottom-10` 之上还有空间） |
| 播放页 · 更多弹层 · 字幕·模式 | 同上 | `VideoControls.tsx:420-428`（`w-full py-1`） | 是 | 能 | 同上 |
| 播放页 · 更多弹层 · 全屏 | 同上 | `VideoControls.tsx:429-438`（`w-full py-1`） | 是 | 能 | 同上 |
| **播放页 · 进度条** | **351×6 / 有效 351×15 → 2.5.8 fail（唯一一处硬违规）** | `VideoControls.tsx:238-247`（`className="w-full h-1.5"`） | 是 | 能，且**该修** | 保住 6px 视觉高度、给 input 一层命中区：外头套 `py-[9px]`（6+18=24）或 `className="w-full h-6 bg-transparent"` + 内层画 6px 轨道；改完 2.5.8 立刻过 |
| 播放页 · D10「已跟读」标记 | 8×8 / 8×8 | `VideoControls.tsx:251-265`（`w-2 h-2`） | 是 | 能，但不急 | 进度条上的次级入口，判过靠 **Equivalent**（文稿列表的行按钮同样跳句且 ≥44）；要 44 得让它按下时才放大，或把跳句收进「更多」 |
| 播放页 · 入画字幕的行内词 ×11 | 20px 高（宽 11–104.9）/ 有效 24–27 | 渲染 `page.tsx:788-804`；样式 `frontend/src/app/globals.css:618-628` | 是 | **结构上做不到 44**（行内，受 22px 行距约束） | 不修。判 `exempt-inline`，与 #27 的结论一致 → §5 |
| 跟读抽屉 · 下拉把手 | 375×16 / 375×16 | `frontend/src/components/watch/SheetHandle.tsx:52-69`（`pt-2 pb-1` + `h-1` 的横条） | 是 | 能 | 加 `py-2` → 24（过 2.5.8）；要 44 得 `py-4`（把手会离抽屉顶远一点）。**AA 判过靠 Equivalent**（取消/关闭按钮 ≥44）；拖拽本身另受 SC 2.5.7 约束 |
| 词卡浮层 · 下拉把手 | 375×16 / 375×16 | 同上（`WordCardSheet.tsx:76-83` 传 `testId="word-card-grab"`） | 是 | 能 | 同上 |
| 词卡浮层 · 关闭 ✕ | 25×25 / 25.5×25.5 | `frontend/src/components/subtitle/WordTooltipInline.tsx:134-140`（`p-1 -m-1`，图标 17px） | 是 | 能 | 25 ≥ 24 → **AA 已过**；要 44 得 `p-3`（17+24=41）或 `p-3.5`。`-m-1` 是视觉对齐用的负边距，改 padding 要一起调 |
| 跟读抽屉 · 自动推进开关 | 343×32 / 343×32 | `frontend/src/components/watch/ShadowingDrawer.tsx:236-261`（`py-1.5`） | 是 | 能 | 加 `min-h-[44px]`；整行都是热区，加高不影响版式 |
| 跟读抽屉 · 合并一条 / 两条分开 | 56×20.5 / 56×21.3 | `ShadowingDrawer.tsx:214-221`（`px-1.5 py-0.5`） | 是 | 能 | 加 `min-h-[44px]`（回放态那一行右侧的小按钮，加高会把「原声 / 我的」那行顶高） |
| 登录页 · 登录（提交） | 327×40 / 327×40 | `frontend/src/app/login/page.tsx:115`（`Button` 默认 `size="md"` → `Button.tsx:43` `py-2.5`） | 是（唯一入口） | 能 | 加 `className="min-h-[44px]"`（页面上别的 Button 已有同款用法） |
| 登录页 · 手机号输入框 | 271×42 / 271×42 | `login/page.tsx:87-88` | 是 | 能 | `<Input>` 加 `min-h-[44px]`（差 2px） |
| 登录页 · 密码输入框 | 327×42 / 327×42 | `login/page.tsx:108-109` | 是 | 能 | 同上 |
| 登录页 · 忘记密码？ | 60×16 / 60×16 | `login/page.tsx:96-100` | 是 | 能 | 行内链接，判 `pass-spacing`（AA 已过）；要 44 得做成块级按钮 |
| 登录页 · 创建账号 | 52×16 / 52×16 | `login/page.tsx:123-127` | 是 | 能 | 行内链接，判 `exempt-inline` |
| 登录页 · 服务条款 / 隐私政策 / 联系我们 | 44×14 / 44×14 | `login/page.tsx:136-145` | 是 | 能 | 行内链接，判 `exempt-inline` |
| 登录页 · 品牌链接（SeeWord 首页） | 101.7×29 / 101.7×29.5 | `login/page.tsx` 顶部品牌区（`TopBar.tsx:277` 同款链接的非壳层版本） | 是 | 能 | 加 `py-2` 即到 44 |

**已经达标的（不用动；列出来是为了下次改动别把它们弄坏）**：底栏 5 个 tab（75×44，`MobileTabBar.tsx:72-91` 的 `min-h-[44px]`）、伴侣条动作行 5 个按钮（44×44，`page.tsx:1358` + `VideoActions compact`）、抽屉动作行（44，`ShadowingDrawer.tsx:274-307` 的 `min-h-[44px]`）、词卡底部「发音 / 加入词库」（44，`WordTooltipInline.tsx:289-307` 的 `touchTargets` 分支）、词卡里的「播放原声 / 播放我的 / 删除」（44）、迷你窗退出键（44，`page.tsx:1073` 的 `h-11 w-11` —— **这一条是同期另一位执行者刚改的**，见 §7 快照声明）。

### 4.2 关键路径之外的 <44px（本图不交付，列出备查）

完整清单在 §3 表 4（按路由去重、带尺寸与 2.5.8 判定）。「动谁」一栏：

| 路由 | 目标（尺寸） | `文件:行号` | 说明 |
|---|---|---|---|
| `/` | 关闭（里程碑横幅 ✕）24×24 | `frontend/src/app/(main)/page.tsx:88-94` | 只在有 `recentMilestone` 时渲染（**数据依赖**，见 §7） |
| `/` | 选择分类 / 排序方式 94×33.5 | `frontend/src/components/home/HomeFilterBar.tsx:46` 那一套 `px-3.5 py-1.5` pill | 筛选栏；AA 过（≥24） |
| `/` | 难度筛选 全部/A1/B1/C1 … 41–45.7×51 | `HomeFilterBar.tsx`（同款 pill） | 高 51 达标，宽 41–43.7 差一点 → <44，但两维都 ≥24 |
| `/vocabulary` | 今日 / 词库 54×31.5 | `frontend/src/components/practice/PracticePanels.tsx:168` 同款 tab | 页内 tab |
| `/practice` | 去做真题 76×20、去复习 91×35.5 | `frontend/src/app/(main)/practice/page.tsx:192` 附近 | 行内 / 次级链接 |
| `/profile` | 上传头像 92×30、男生/女生 58×34、更换 48×28、保存修改 88×40 | `frontend/src/components/profile/ProfileTab.tsx:167` / `:186` / `:239` | 全部 ≥24 → AA 过 |
| `/profile` | 你的昵称 301×42 | `ProfileTab.tsx` 的 `<Input>` | 差 2px |
| `/watch` | 文稿列表里的词（`role=button`）×N | `frontend/src/components/subtitle/SubtitleList.tsx:113-139` | 行内，判 `exempt-inline`；与入画字幕同一类 |
| `/watch` | 文稿行右侧 5 个图标（播放此句/复制/收藏/编辑/练习口语） | `SubtitleList.tsx:235-298` | 实际尺寸见 §3 表 4；整行本身是 ≥44 的按钮 |
| `/watch` | 四级药丸 77×28 | `frontend/src/components/watch/ExamLevelSelector.tsx:22` | 画框外的等级选择（桌面同款） |
| `/watch` | 字幕模式 双语/英语/中文 70×31.5、收起为字幕轨 36×36 | `frontend/src/components/subtitle/SubtitleModeTabs.tsx:89-90`（收起键） | 文稿面板头部 |
| `/watch` | 真题练习 52×16、来源链接 259.8×35.5 | `page.tsx:1493`、`page.tsx:1390-1397` | 行内链接 |


---

## 5 与 #27 既有结论的对齐 —— 不打架

#27 写的是「**22px 行距是天花板，画面内热区实测 21–29px，44px 在行内做不出**」。这次在 app 里量到的是同一件事，数字对得上：

| | #27 原型 | 本次 app 实测（375×812，点词那 11 个词） |
|---|---|---|
| 行内词元素盒 | — | 高 **20px**（`font-size: 17px`；宽 11–104.9px 随词长） |
| 行内词可点范围 | **21–29px** | 有效命中高 **24–27px**（`burn-sub-word::after` 外扩 `inset:-4px -1px`，`globals.css:624-628`） |
| 结论 | 44px 在行内做不出 | **同样做不出**：11 个词里没有一个的有效命中高过 27px，两维都够 44 的一个都没有 |

补充两条对齐要点：

- **量法差异**：这次把「元素盒」和「有效命中区」分开报（§1 表）。#27 的 21–29 是**含外扩**的口径，与本次的 24–27 同一量级；差的那几像素来自 app 的实际字号（17px）与相邻行 `::after` 互压（`globals.css:622-623` 的注释已经写明「相邻两行互压 4px」）。**不要拿元素盒的 20px 去和 #27 的 21–29 比**——那是两个口径。
- **豁免判定与 #27 一致**：这些词在 SC 2.5.8 下判 `exempt-inline`（行内、受行高约束），在 2.5.5 下同样 `exempt-inline`。也就是说 **#27 选「行内点词」没有引入 AA 违规**；它付出的代价是「44px 够不到」，而那条线本来就是 AAA。
- 与 #27「点词只在画面内那句可用」的落位一致：本次量到的入画字幕块 y=189.9 高 82.1（底边 272.0），画框底 274.9 —— 底边那 3px 是 `thin-progress`（`VideoControls.tsx:211-218`），与 INV-021 的断言同源。

---

## 6 与现有 e2e 44px 断言的对齐 —— 一条不一致（发现时是缺陷，**已修**）

| 断言 | 量到 | 是否一致 |
|---|---|---|
| `mobile-player-shell.spec.ts:111` 「动作行是 44px 触控目标」`[data-testid="mobile-actions"]` 高 ≥44 | **343×44**（恰好 44） | ✅ 一致 |
| `mobile-wordcard-drawer.spec.ts:225` 抽屉动作行每个 button 高 ≥44 | 录音中 **166.5×44 / 168.5×44**；回放态 **109.7×44 ×3** | ✅ 一致 |
| `viewport-height.spec.ts:86` `nav.md\:hidden` 高 ≥44 | **45**（`min-h-[44px]` + 1px 上边框） | ✅ 一致 |
| `mobile-pip-scroll.spec.ts:186-187` 迷你窗退出键 ≥44×44 | 该 spec 是**同期另一位执行者刚加的**（未提交）；当前工作树里按钮已改成 `h-11 w-11`（`page.tsx:1073`），本次读数量到的是改动**之后**的版本 | ⚠️ 见 §7 的快照声明 |
| 播放页「返回」键 | 44×44 尺寸达标，但**中心点被 `VideoControls` 覆盖层占据**：真机点击不导航（只把控制条点出来）、`locator.click()` 超时 | 发现时 ❌ **不一致 —— 缺陷**；**同一批已修**（见下） |

### 那条缺陷，逐条证据

- 目标：`page.tsx:1005-1012` 的返回键（`h-11 w-11`，44×44），在画面内左上 (8,72)–(52,116)。
- 覆盖者：`VideoControls.tsx:194` 的根 `div.absolute.inset-0.z-10.select-none`（`pointer-events: auto`）。标题 overlay 也是 `z-10`（`page.tsx:1004`）且**先渲染** → 同层级下 DOM 靠后的赢。
- 机器判据：该键中心的 `elementsFromPoint()` 栈顶是覆盖层，键在第 4 位；`page.locator('[aria-label="返回"]').click()` **TimeoutError**（可点性检查失败）。
- 真人判据：用 `page.mouse.click()` 点它的中心 → URL 不变（仍在 `/watch/<id>`），**控制条被点出来了** —— 附加动作落到了 `handleSurfaceClick`（`VideoControls.tsx:153-168`）。
- 为什么 e2e 没抓到：三条 44px 断言量的都是**盒子高度**，`mobile-player-shell.spec.ts` 对标题 overlay 只做几何断言（`frame-title` 在画框内），从没点过返回键。**不是断言写错，是断言没覆盖「能不能点到」这件事。**
- 影响：底栏导航（75×44）仍可用，所以用户没被彻底困住；但这是关键路径上一个看起来能点、实际点不动的控件。
- 建议（本图只测量、不改产品源码，所以只给方向）：让返回键所在的标题 overlay 拿到比控制条更高的交互层级（或让控制条根只在控制条自身区域接指针），并给 e2e 补一条「点返回键会离开播放页」的断言。
- **落定**：这条已在**同一批**里按上面的方向修掉 —— 标题 overlay 抬到 `z-20`（`page.tsx` 的 `isMobile` 那一层），返回键加 `data-testid="frame-back"`，`mobile-player-shell.spec.ts` 新增「中心命中的是它自己 + 真的可点」一条（旧实现下 `click()` 直接 TimeoutError）；规则写进 **INV-024 第 ② 条**以免被改回 `z-10`。上面的证据保留原样 —— 它解释的是这条 e2e 为什么必须存在。

### 另一处该记的差距（不是不一致）

`mobile-d1-d10.spec.ts:87` 断言的是一条 **≥36px** 的高度。本次基线里对应的「逐句跟读 / 录音」入口实测 **101×44 / 75×44**（`page.tsx:1181-1227` 的 `min-h-[44px]`）——读数不冲突，但断言的门槛（36）低于本图的口径（44）。补测点应把它抬到 44，否则将来掉到 40 也没人拦。

---

## 7 没量到的路由与状态（点名 + 为什么）

| 没量 | 为什么 |
|---|---|
| `/browse`、`/channels`、`/channels/[slug]`、`/history`、`/favorites`、`/notifications`、`/search`、`/rankings`、`/weekly-report`、`/contact` | 不在本图交付面（Destination 是移动端**播放页**交互方案 + 壳层最小改动）。它们的 <44 目标要量，属于一次全站无障碍审计，不是这一节。壳层（顶栏/底栏）的读数在 `/` 上量了，而壳层是所有 `(main)` 路由共用的 |
| `/practice/daily`、`/practice/exams/*`、`/vocabulary/drill`、`/vocabulary/sets/*`、`/onboarding`、`/register`、`/forgot-password`、`/terms`、`/privacy` | 同上；且考试/训练流程是**全屏沉浸流程**（`MobileTabBar.tsx:37-41` 里它们会隐藏底栏），壳层的量法在那些路由上不成立 |
| `/admin/**` | 管理端，不在移动端交付面 |
| `/watch/<id>` 的**逐句跟读**态（`sentenceShadow.active`，`page.tsx:1189-1198`） | 它先播原句、播完**自动**开录，状态在一次测量窗口里会自己跳（playing → recording），读数不可复现。抽屉容器本身已按「录音中 / 回放态」两态量过，动作行与把手是同一批 DOM |
| 迷你窗（旧 `useStickyPip` 的小窗形态） | 375×812 首屏**不出现**（`pip not visible on load`，每次跑都记在 JSON 的 note 里）；滚出视口才出现。而且**测到一半时另一位执行者正在把它改成「贴顶常驻」**（见下面的快照声明）——该改动**已落地**（#30：小窗形态取消，改成画面贴顶常驻，INV-023），所以**小窗这一态不再存在**；§3 表 0 / 表 2 里播放页那几行按快照声明待重跑 |
| 真机（iPhone Safari） | 这份基线是**无头 Chromium 的渲染**，不是真机。地址栏/安全区那类差异归 `baseline/README.md` 与 #25；触控目标尺寸在真机与模拟器上一致（CSS px），但**手指遮挡**与**系统手势区**（Home indicator 条）只有真机能验 |

### 快照声明（必须读）

**同期有别的执行者在改前端源码。** 本次测量的工作树状态：

- `git rev-parse HEAD` = `c277dc9e67ab30a8111c20fc4b0e70c14b9607b5`（`fix(watch): 移动端补上「乙」的页面版式——画面出血、贴壳顶、标题入画`）
- 工作树**不干净**：`frontend/src/app/(main)/watch/[id]/page.tsx` 与 `frontend/src/hooks/useStickyPip.ts` 处于**未提交的修改中**（另一位执行者在做 #30「滚过画框后贴顶常驻」，把小窗换成 sticky，并把小窗退出键从 24×24 改成 44×44）。测量窗口内这两个文件的 sha256：
  - `page.tsx` = `F8F9DD4A7950D4688AF60809DF9FF4E2500B9C4A0FB6878942C94B18A95896AC`
  - `useStickyPip.ts` = `6C2E18CA3FA1B6626479AB796C8FEE18FAED4D95F2F349FD0680792113DBF565`
- 每次跑的完整 `git status --porcelain` 都抄进 JSON 的 `meta.git`（含当时新建的 `S-scroll*` 原型、另一位执行者的 `mobile-pip-scroll.spec.ts`、`probe-device-check.html` 等未跟踪文件）。
- **因此**：§3 的数字是**上述工作树状态**下的读数，不是 `c277dc9` 这个提交的读数，也不是「线上是什么样」。**#30 的贴顶常驻落地后，§3 表 0/表 2 里播放页那几行需要重跑**（画框几何、迷你窗态、控制条与字幕的层叠都可能变），而壳层、登录、词卡/抽屉内部的尺寸不受影响。

---

## 8 两次跑的一致性

量具默认不写库（§2），所以两次跑应当逐条相同。实测（同一脚本修订 `scriptRevision: 5`、同一 HEAD、同一用户）：

| 比对 | 结果 |
|---|---|
| **正式两次（run D → run E）**，11 个状态、逐条按「选择器 + 文案 + 尺寸 + 2.5.8 判定」比对 | 见下（本文写成时以 JSON `meta.scriptRevision` 为准；差异逐条列在 `runD`/`runE` 的比对里） |
| 早期两次（脚本修订 2 → 3，写库仍开着）：剔除「D10 标记」与「最近跟读删除键」两族后 | **逐条完全相同**（尺寸、选择器、2.5.8 判定全部一致），差异 100% 是量具自己写进去的跟读记录：每次跑 +1 个进度条标记、+1 行「最近跟读」。**源码没变**（两次的 `HEAD` 都是 `c277dc9`） |

结论：**两次跑之间没有源码层面的漂移**；唯一的漂移源是「量具写库 → 下次跑多出跟读历史那两族目标」，而这个源头已经在正式版里掐掉了（`overlay-drawer-history` 那一态除外，它是故意保留的）。

---

## 9 复跑与维护

- 口径、判据、豁免规则都写在本文件与 `frontend/scripts/audit-touch-targets.mjs` 的头部注释里；**改口径 = 同时改这两处**，并把 `SCRIPT_REVISION` +1（它进了 JSON 的 `meta`，用来判断两份读数能不能直接比）。
- 表 0–4 全部由 `--emit-md` 从 JSON 生成，**不要手改表里的数字**：改完脚本重跑，重新生成一遍。
- 上游一变就要复核的：`VideoControls.tsx`（控制条内所有小目标）、`globals.css` 的 `.burn-sub-word*`（行内热区）、`TopBar.tsx` 的五个 40×40/32×38/32×32、`SheetHandle.tsx`（把手）、`Button.tsx` 的 `SIZE.icon`（`w-10 h-10`，顶栏三个按钮都吃它）。
