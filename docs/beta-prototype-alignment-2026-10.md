# 公测版对齐原型 · 需求记录（2026-10-19）

> **这份文档是「公测版对齐原型」这批需求的唯一事实源。**
> 来源：用户 2026-10-19 口述指令，后续沟通、决定、改动都追加到本文件，不另开副本。
> 记录时点：以项目现状代码为准。**记录本轮未改动任何代码**（只读核对）。

## 0. 版本目标

- 下个版本要做**正式公测**，公测后到**流媒体平台**做宣传；正式上线前尽量把正式版调好。
- 上一轮按原型做了参考调整后，**内容呈现相对好了**，但**还有很多没和原型对齐、很多功能没实现**。
- 改的时候**不只改前端**：缺的功能、需要重新设计的 API／接口，后端一起补。
- 项目里还有**旧设计与旧功能遗留**，没有按原型做内容呈现。

## 1. 总原则（红线）

1. **以原型为基准做优化**，不做「旧实现 + 原型」的混合体。
2. 原型**只有一个问题**：每个页面顶部有一段**开发期留下的文字说明** —— 删掉。
3. **不要把原型和本项目混着设计**（原话：「不要搞得四不像」）。功能要么没实现、要么呈现效果不好，**差什么就补什么**：呈现缺就补呈现，数据／接口缺就补后端。
4. 原型的整体信息架构不错，但**文字过多** —— 尽量用**可视化**方式让用户抓住重点。
5. **练习、词汇以原型的设计为准**，只做**视觉重点与页面布局的优化**。

## 2. 首页

| # | 要求 | 落地口径 |
| --- | --- | --- |
| 1 | **每日精选**：作为首页入口，用户可切换；进入后推荐一个视频，旁边展示相关内容 | 保留「**本周精听**」标题、视频与入口；**不要加奇怪的文字**；具体内容与版式由实现方判断（可参考原型，也可重新设计） |
| 2 | **下滑区域**：展示其他视频，布局与原型相似 | 首页下部的视频流 |
| 3 | **历史记录**：类似原型中的「本周…词汇」等记录区域 | 原型首页侧栏那类「我的学习入口／记录」模块 |
| 4 | **排除项** | 原型里「今天，听一段什么？」「按兴趣找」这类**设计遗留内容不需要** |

> 与前一轮结论一致：**首页承载现有首页 + 「发现」的职责**，不再单独存在「发现」入口；发现能力由「每日精选 + 下滑视频流」承担。

## 3. 频道页

1. **整合**原「频道」（`/browse`）与「全部频道」（`/channels`），**呈现方式参考 `channels.html`**。
2. 进入后**直接展示所有频道**，**圆形图标**。
3. 点击不同频道 → 进入**该频道主页**（`channel.html` / `/channels/[slug]`），在里面选内容。
4. 「练习」「词汇」模块**保持现有方案**。
5. 原型整体不错但文字多 → 可视化。

> 原话「对应 chinese 界面，而非 browse 界面」的确切所指待确认（见第 8 节）。

## 4. 练习

- 按原型的设计，只做**视觉重点与页面布局的优化**。
- **删除页面上说明性的文案**，例如「今天，练哪一部分？」「六级阅读卷的几类题型从…开始」这类。
- 现状对应：`frontend/src/app/(main)/practice/page.tsx` 的 `PageHeader`（crumb/title/description）正是这类文案的来源。

## 5. 词汇

- 按原型：**到期词表 + 一键「开始复习」的快速复习**。
- **删除原型里没有的标记**。用户举例：原项目词汇页会标记「VN + 一个数字」，原型里根本没有。
- 现状问题（原话）：原项目点开会出现一堆、奇奇怪怪的东西 —— 要向原型收敛。

## 6. 我的与其他页面

- 同样：**在原型基础上优化、往原型靠齐**，删除页面顶部的说明文字。

## 7. 通用清理项

- **每页顶部的开发期文字说明全部删掉**。本项目侧的落点就是 `components/ui/PageHeader` 的 crumb/title/description 里带说明性质的文案（8 个目标页全部用了它）。
- 信息呈现**可视化优先**：靠排版、图形、状态色，而不是成段文字。

## 8. 待确认（需要补一句）

1. **「VN + 数字」是词汇页上的哪个标记？** 按代码找了三处候选，都不是字面的 `VN`：
   - 词表每行的**等级徽标**：四级／六级／考研／雅思，其余等级原样大写（A1–C2）——`components/vocabulary/VocabularyToday.tsx:22-24`
   - **词性**缩写（v. / n. / adj.）——`VocabularyToday.tsx:227-228`、`components/vocabulary/VocabWordCard.tsx:49`
   - **掌握度徽标** + 「每日 N 新词 + M 复习，按错误次数安排复习」——`(main)/vocabulary/page.tsx:46,486`、`components/vocabulary/DailyHero.tsx:143`

   给一张截图或说下在哪个页面，就能精准定位并写进清单。
2. 「**对应 chinese 界面，而非 browse 界面**」：指设计稿里的中文界面版本，还是某个参考产品的频道界面？
3. `/browse` 的去留（第 9 节的选项 1／2）。
4. 流媒体平台宣传需要哪些能力（分享卡／SEO／落地页／试看等）—— 等后续沟通。

## 9. 导航与 IA 结论（前一轮已对齐，仍待最后确认）

- **一级导航（桌面侧栏 + 手机底栏，5 项）**：首页 `/`（承接发现） · 频道 `/channels`（全部频道） · 练习 `/practice` · 词汇 `/vocabulary` · 我的 `/profile`。
- **次级导航（仅桌面侧栏，4 项）**：我的收藏 `/favorites` · 学习记录 `/history` · 通知 `/notifications` · 会员 `/upgrade`（**用本项目的会员页**，不是原型的 `pricing.html`）。
- **学习周报功能删除**：导航不出现该项，页面／后端／e2e 一并清（影响面清单见 T3 摸底）。
- **`/browse` 待定**：
  - **选项 1（推荐）**：保留为**首页的下级页**，导航不再给它位置（停在它上面时高亮「首页」）。全站 **24 处**「去看视频」引用与 4 条 e2e 都不用动。
  - **选项 2**：首页吸收全部筛选能力后，`/browse` 重定向到 `/`。要改那 24 处引用（其中 `weekly-report` 的 2 处会随删周报一起消失）、4 条 e2e、`components/ui/VideoCard.tsx:74` 的 `startsWith("/browse")` 分支，并合并 `platform: "home"` 与 `platform: "browse"` 两条 feed 链路。

## 10. 已核实的现状差距（定点核对，非全量）

| 模块 | 现状（代码为准） | 与要求的差距 |
| --- | --- | --- |
| 首页 | `(main)/page.tsx`：`PageHeader`「今日学习／开始今天的学习」→ 继续上次 → 词汇摘要 → 每日练习 → 「精选视频」（`components/home/FeaturedListening.tsx:70-81`，**没有「本周精听」标题**，带「换一条」）→ 「发现更多视频」+ `HomeFilterBar` + 网格 + 无限滚动 | 补「每日精选」的形态与切换；补「历史记录」区；「发现更多视频／按兴趣找」属排除项 |
| 频道 | `/browse`（浏览视频：`ChannelStrip` + 分类／难度／排序 + 无限滚动）与 `/channels`（全部频道目录）**两个页面并存** | 合并为一个「频道」页：直接展示所有频道、圆形图标，点进各自频道主页 |
| 练习 | `practice/page.tsx` 顶部 `PageHeader`「今天，练哪一部分？」 | 这类顶部说明文案要删；其余以原型为准做视觉优化 |
| 词汇 | `/vocabulary`：`DailyHero`（每日 N 新词 + M 复习）+ 词表（等级徽标／词性／原句／来源链接／标为已掌握／删除）+ 独立的 `sets`／`drill`／`sieve` 页 | 收敛为原型形态：**到期词表 + 「开始复习」快速复习**；删掉原型没有的标记 |
| 我的 | `/profile` 4 个 tab（资料／进度／账号／设置）+ 周报入口 3 处 | 周报删除；其余逐页向原型对齐 |

## 11. 导航与 IA · 落地清单（已细化，待确认）

### 11.1 代码结构

`MAIN_NAV` 保留原名与 5 项（三个消费者不动），**新增 `SECONDARY_NAV`（4 项）**，再给 `NavItem` 类型与一张 `ACTIVE_SCOPE` 归属表：

| 文件 | 改法 |
| --- | --- |
| `lib/navigation.ts` | 全文重写：`NavItem`（`label/href/icon`，一级多 `shortcut`，底栏多 `showBadge`）+ `MAIN_NAV` + `SECONDARY_NAV` + `ACTIVE_SCOPE`，`navigationActive` 改表驱动 |
| `components/layout/Sidebar.tsx:8,58-78` | 抽 `renderNavLink(item)`，`<nav>` 内渲染「MAIN_NAV → hairline 分隔线 → SECONDARY_NAV」两段 |
| `components/layout/MobileTabBar.tsx:10-11` | **一行不改**（`TABS = MAIN_NAV` 仍是 5 项），只改注释措辞 |
| `components/layout/TopBar.tsx:141` | **一行不改**（快捷键只查一级） |

**不用「一个数组 + `slice(0,5)`」**：slice 把「次级」定义成下标而不是角色，将来在一级插一项就会挤进底栏；`shortcut`/`showBadge` 的合法性无法用类型表达；且底栏注释承诺的「与侧栏共用五个入口」会立刻失真。

### 11.2 归属表（`navigationActive`）

| 路径 | 归属 |
| --- | --- |
| `/`、`/watch/*`、`/rankings` | 首页 |
| `/browse` | 首页（仅选项 1；选项 2 下该路径被重定向，不进表） |
| `/channels`、`/channels/[slug]` | 频道 |
| `/practice/*` | 练习 |
| `/vocabulary/*` | 词汇 |
| `/profile`、`/contact` | 我的 |
| `/favorites` / `/history` / `/notifications` / `/upgrade` | 各自次级项（`/notifications` 今天**零归属**，改后首次有高亮） |
| `/search` | 不高亮（与现状一致，它是顶栏能力的落地页） |
| `/pricing`、`/checkout`、`/redeem` | 不需要处理：三个都是服务端 `redirect`，pathname 停留不了 |

不得双高亮：9 项的 scope 前缀两两不相交；`/` 必须写成精确匹配，**绝不能 `startsWith("/")`**。

### 11.3 侧栏视觉与高度预算

- 分组**只用 hairline 分隔线、不加小标题**：折叠态（4.5rem）下小标题渲染不出来，分隔线仍有效；与 `AccountMenu` 面板内的分隔语言一致。
- 高度预算（**估算，未跑浏览器**）：项 46px + 间距 5px → 9 项 459px；+ 分隔线 9px + header 80px（折叠态 98px）+ AccountMenu 69px ≈ **展开 625px / 折叠 643px**（加小标题再 +32px）。
- 结论：e2e 的 768/900 视口不用滚动；真机 1366×768 可视约 638–668px，余量 13–43px，字体放大可能触发滚动——但 `nav` 本身是 `overflow-y-auto`，只滚列表内部，不是新风险。

### 11.4 手机端

- 底栏仍是 5 项 → **`e2e/mobile-watch-chrome.spec.ts:119` 的 `toHaveCount(5)` 不会红**。
- 五个目标路由手机上**都已能到**，不需要补入口：`/channels` 由底栏第 2 项承担；`/favorites`、`/history` 走账号菜单；`/notifications` 走顶栏铃铛下拉「查看全部 →」；`/upgrade` 走「我的」页会员卡。
- 既存缺口（本批不做，知情即可）：手机观看页的 `WatchTopBar` 没有头像/账号菜单。

### 11.5 `/browse` 的两个选项

| | 选项 1（推荐，本批只做这个） | 选项 2 |
| --- | --- | --- |
| 改动 | `navigation.ts` 一行：`/` 组加 `/browse` | 页面缩成 redirect + **24 处引用 / 15 文件** + `VideoCard.tsx:74` 埋点分支 + `usePlatformFeed` 的 `platform:"browse"` 死分支 + `watchEntry` 的 `from:"browse"` 枚举（含单测 4 行） + 4 组 e2e |
| 后端 | 无 | 无（`/api/v1/browse/*` 是 API，与页面无关） |
| 代价 | 0 | 高，且会改变埋点数据 |

### 11.6 会红 / 必须同步的检查点

| 检查点 | 结论 |
| --- | --- |
| `e2e/mobile.spec.ts:88-95`（点「发现」→ `/browse`） | **必红**，改成「频道」→ `/channels` |
| `e2e/design-rollout.spec.ts:231-252`、`:340`；`production/readiness.spec.ts:85`（周报） | **必改/必删**（随删周报） |
| `e2e/mobile-watch-chrome.spec.ts:119`（底栏 5 项） | 不红 |
| `e2e/design-rollout.spec.ts:39-60`（四档断点 + 无横向溢出） | 侧栏多 4 项，需实跑复核 |
| `e2e/design-rollout.spec.ts:145-154`（观看页「首页」高亮）、`production/recovery.spec.ts:20,23`（「发现视频」按钮名） | 不红，别误伤 |
| `lib/navigation.ts` 单测 | 目前**零覆盖**；建议新增 `navigation.test.ts` 11 条（两项数组内容与顺序、href 不重复、**任意 pathname 最多命中一项**、无归属路径命中 0 项、逐路由归属、`/` 不吞前缀、`/watch` 斜杠边界、shortcut 唯一、`showBadge` 唯一、icon 非空）。vitest 是 node 环境、不引 jsdom |

### 11.7 提交拆分（每步可独立验证）

**C1 结构重构（零行为变化）** → `npx vitest run src/lib/navigation.test.ts` + `npm run check` + `playwright test e2e/design-rollout.spec.ts e2e/mobile.spec.ts --project=chromium`
**C2 第 2 项换「频道」+ 落归属表** → `npm run check` + 同批 e2e（重点看 5 项计数与四档断点）
**C3 `/browse` 决策**（选项 1 则跳过）
**C4 删周报**（前端 + 后端 + drop 迁移 + e2e）
**C5 视觉收尾**（分隔线、aria-label、`AccountMenu` 去重、过期注释）

---

## 12. 首页 · 落地清单（已细化，待确认）

### 12.1 先把原型的两条事实纠正过来

1. 原型首页**不加载 `discover.css`**，版式全在 `home.css`；首页三大块（本周精听/我的学习入口/按兴趣找）**全是写死的 HTML**，`home.js` 从不碰 `#a-feature`。
2. 原型里**没有「旁边展示相关内容」这一列**——hero 右列是「我的学习入口」（继续上次/词汇/练习，与视频无关）；真正的"更多内容"只有「看完整文稿」弹层。原型也**没有历史记录区**，只有一行「连续学习 7 天 · 本周 3.4 小时 · 已学 18 段」。
   → 这两块都属**新增**，且**以现有产品实现为基线**（`FeaturedListening` 已经真的能切换），不是照抄原型。

### 12.2 目标形态（建议）

```
页头（精简：日期 + 继续上次）
每日精选 / 本周精听    左：封面 + 来源·难度·时长 + 标题 + N 句字幕·M 张词卡·语速
（可切换）             右：相关内容列（待定，见 §13）
下滑视频流             保留现有无限滚动（去掉筛选栏与「发现更多视频」标题）
历史记录区             本周数据 + 最近条目（新做，数据后端已有）
```

### 12.3 现状 → 差距

| 区块 | 现状 | 差距 |
| --- | --- | --- |
| 精选 hero | `FeaturedListening.tsx:25`：`GET /api/v1/browse/featured?limit=6`，本地 `setIndex` 切换（`:76`），标签叫「精选视频」（`:72`，兜底文案 `:112` 同字面） | 改标题为「本周精听」；补「相关内容」；「每日」语义待定 |
| `featured` 接口 | 只有 `limit`，`show_on_homepage + created_at DESC`，`@cached(ttl=300)`（`browse.py:155,178-186`） | 300s 内换不出新内容；需要 `exclude`/`offset` 并写进缓存 key |
| 下滑流 | `usePlatformFeed({platform:"home"})`：默认走 `/api/v1/recommendations/home`，带筛选回落 `/browse/feed`（`usePlatformFeed.ts:184-205`）；无限滚动 + URL 单一真相 | 保留；删筛选栏后 `categories/sort/total` 派生逻辑成死代码（但 **hook 不能删**，`/browse/page.tsx:90` 仍在用） |
| 历史记录区 | 首页只有 `CompactStatsBar` 三项（连续天数/词库词数/已学视频数）+ `ContinueLearningRail` | **不需要新端点**：`/learning/stats/weekly` 已给 `this_week_words`/`this_week_videos`/`daily_minutes`（7 天分布），配 `/plan/profile` + `/learning/records` 即可；`history/page.tsx:140-154` 的「今天/昨天/更早」分组逻辑可直接搬 |

### 12.4 要删的（排除项）

| 内容 | 位置 |
| --- | --- |
| 「发现更多视频」标题 + 副标题 | `(main)/page.tsx:64-69` |
| 筛选栏（分类/排序/难度/计数） | `HomeFilterBar` 全文（**只有首页一个使用方**）+ `page.tsx:102-111` |
| 排序里的「完整榜单 →」入口 | `HomeFilterBar.tsx:204-212`（删筛选栏即消失，`/rankings` 需另找入口） |
| 「精选视频」小标签 | `FeaturedListening.tsx:72` 与兜底 `:112`（改成「本周精听」而不是删） |
| 页头说明性文案 | `PageHeader` 的 crumb/description（「今日学习 / 接着上次的视频，或花几分钟巩固词汇。」） |

### 12.5 后端补什么

| 优先级 | 缺口 | 做法 |
| --- | --- | --- |
| **P0** | 「相关内容」**没有任何相关视频端点** | 先零改动复用 `GET /api/v1/recommendations/category/{tag}`（tag 取精选视频 `topic_tags` 第一个）；要「同作者/同难度」再新增 `GET /api/v1/videos/{id}/related` |
| **P0** | 精选「换一批」换不出新内容 | `/browse/featured` 加 `exclude=`/`offset=`，并把维度写进 `@cached` 的 key（`browse.py:155`） |
| P1 | 「每日」语义（现在新视频一发布 hero 立刻变、且所有人同一条） | 加 `date` 派生或新端点；若要「每人不同」复用 `recommendation_service` 的个性化管线 |
| P1 | 历史记录区 | **无需新增**；只有口径要「打开过的段数（含未完成）」时才在 `/learning/stats/weekly` 加一个字段 |

### 12.6 测试影响

| spec | 影响 |
| --- | --- |
| `home-sort.spec.ts:21-46`、`home-sort-truth.spec.ts:37-79`、`watch-return.spec.ts:43-71` | **必红**（依赖「排序方式」「选择分类」按钮与首页筛选 URL）→ 随改版**改写断言**，不得 skip/放宽 |
| `home-continue-learning.spec.ts:114,160-177` | 部分红（mock 的是 `/api/v1/recommendations/home`；且断言 `.user-learning-dashboard` 恰好 3 个 section） |
| `grid-columns.spec.ts`、`viewport-height.spec.ts`、`design-rollout.spec.ts:327-377` | 只有改网格布局或引入新接口报错才红 |
| 单测 | **首页组件零覆盖**（vitest 是 node 环境，15 个测试全在 `lib/`+`stores/`）；只有 `watchEntry.test.ts` 间接覆盖 `?from=home` 往返 |

### 12.7 v1 已实现（2026-10-19）

| 改动 | 落点 |
| --- | --- |
| 页头精简：删说明句，标题改「今天，学点什么？」 | `(main)/page.tsx` |
| 「精选视频」→「**本周精听**」（含 aria-label 与空态文案） | `components/home/FeaturedListening.tsx` |
| 新增：把当前选中视频交给页面（`onVideoChange`），页面据此渲染右列 | 同上 |
| 新增「相关内容」列：取 `topic_tags` 第一段请求 `/recommendations/category/{tag}`，桌面两列、手机堆叠，**无数据整块不渲染** | 新 `components/home/RelatedVideos.tsx` |
| 新增「本周」记录区：本周词数/分钟/看完段数 + 最近 3 条 + 全部记录入口，三态齐全 | 新 `components/home/WeeklyHistory.tsx` |
| 下滑流改为**有界预览**（12 条 + 「看全部视频 →」`/browse`）：无限滚动会让后面的记录区永远滚不到，原型也是「看全部 N 段」 | `(main)/page.tsx` |
| 删除「发现更多视频」标题与整个筛选栏；`HomeFilterBar.tsx` 无其它消费者，**文件已删** | `(main)/page.tsx`、`components/home/HomeFilterBar.tsx` |
| 顺带修：`/browse` 卡片进观看页再返回时**筛选会丢**（只带回 category）。现在 category/level/sort 全带回 | `lib/watchEntry.ts`、`(main)/browse/page.tsx` |

**e2e 变更（不得放宽，只改落点）**：`home-sort.spec.ts`、`watch-return.spec.ts` 改指 `/browse`（那里才有排序与筛选）；`home-sort-truth.spec.ts` **删除** —— 它守的是首页「推荐/最新」回落文案，随着首页筛选栏一起被移除，已无观测对象。

**验证**：`npm run check` exit 0；`watchEntry` 单测 29 passed；`home-continue-learning` / `home-sort` / `watch-return` 共 7 passed。

**已知、待处理**：
1. 本地库 49 段视频 `show_on_homepage` 全为 false → 「本周精听」显示空态。后台 `/admin/videos/{id}` 打开「首页精选」即可看到 hero 与相关内容列。
2. `design-rollout.spec.ts` 的 `/search?q=habit` 在 `#main-scroll` 横向溢出（单跑仍红），**与首页改动无关**，属既有/数据相关问题。
3. 「相关内容」的效果取决于视频有没有 `topic_tags`；没有标签的精选不会出现右列。

### 12.8 v2 已实现（2026-10-19，按用户红框反馈重做）

用户反馈：**红框 1（页头「今日学习 / 今天，学点什么？/ 日期」）删掉；红框 2（三张并排卡片）按原型重做；下方区域不带分类设计。**

| 改动 | 落点 |
| --- | --- |
| **删除整个页头**（crumb + 标题 + 日期），页面直接从「本周精听」开始；`PageHeader` 上关于首页的注释同步改掉 | `(main)/page.tsx`、`ui/PageHeader.tsx` |
| hero 重做成原型 `.a-hero`：左侧 `.a-feature`（1.08fr / 1fr 两列：媒体列 + 正文列），右侧 `.a-aside`（继续上次 / 词汇 / 练习，三块独立入口） | `components/home/FeaturedListening.tsx`、新 `components/home/HomeAside.tsx` |
| 媒体列：来源（橙点）+ 级别 · 时长、居中播放键（手机移到右上角且来源行右侧留位）、底部真字幕句、卡片下方中文译文（手机译文在卡片内，原型 `.a-media-zh` 同款） | 同上 |
| 正文列：标题 → `N 句字幕 · N 张词卡 · 语速 N wpm · 级别` → **这句话里值得记的词**（词/音标/释义/等级点 + 「隐藏译文」开关）→ 「从这一段开始」+「看完整文稿」 | 同上 |
| 右栏：**继续上次**（缩略图 + 标题 + 剩余时间 + 进度条 + 继续观看，只取最近一条未完成且进度 > 0 的记录）、**词汇**（今天到期 N 个 / 词库总数 / 开始复习 / 复习安排）、**练习**（自由选题或继续上次 + 上次成绩） | 新 `components/home/HomeAside.tsx` |
| 下方视频流：**保持无分类**（不引入原型的 `a-cats`），仍是有界预览 12 条 + 「看全部视频」；本周记录区（`WeeklyHistory`）保留在末尾（**已被 §12.10 取代**：无限流 + 分类/难度/排序，本周数字收进右栏） | `(main)/page.tsx` |
| 删除文件：`RelatedVideos.tsx`（「相关内容」列被原型 hero 正文列取代）、`ContinueLearningRail.tsx`、`CompactStatsBar.tsx`（后两者的右栏形态并入 `HomeAside`）；`user-ui.css` 清掉对应的死样式（`.user-learning-dashboard` / `.user-home-hero` / `.user-feature*` / `.user-study-aside` / `.user-continue-compact` / `.home-page-header`） | 三个组件文件、`app/user-ui.css` |
| **后端**：`GET /discovery/learning-metadata` 追加 `sample_words`（最多 3 条 `{word, phonetic, translation, levels}`）：取该视频**第一条字幕**的 `word_levels`，先按 `{cet4,cet6,ky,ielts,toefl,gre}` 过滤（只有 `zhongkao/gaoKao` 的词不算「值得记」），过滤后为空则回退不过滤；按句中首次出现位置排序；ECDICT 不可用或异常时置 `[]`，不 500 | `backend/app/services/discovery_service.py`、`backend/tests/test_discovery_api.py` |

**e2e 变更（断言不放宽，只改观测对象）**：
- `home-continue-learning.spec.ts` **重写**：新增 `browse/featured` / `learning-metadata` / `vocabulary/stats` / `exams/attempts` / `learning/stats/weekly` 的 mock；保留「只显示最近一条续播、排除完成/0 进度、链接带 from=home」「失败可重试不拖垮推荐流」「未登录 → /login」；新增「本周精听展示真句与值得记的词」；版式断言从「三块横排」改为「右栏在 hero 右侧且三块同列竖排 / 手机落到 hero 下方不横向溢出」。
- `container-align.spec.ts`：首页不再有 h1，对齐锚点从 `h1` 改为**页面内容根节点**，仍断言内容从容器 gutter 开始（未放宽）。

**验证**：`npm run check` exit 0（0 error）；`npm run test:unit` 231 passed；`home-continue-learning` 6 passed、`container-align` 2 passed、`grid-columns` 3 passed；后端 `pytest tests/test_discovery_api.py` 10 passed、`ruff check` 通过；截图核对 1440 / 1024 / 375 三档（`.debug-shots/home-*.png`，临时脚本已删）。

**本地数据（不进代码）**：为了能看 hero，本地 dev 库给 4 段 `ready` 视频打开了 `show_on_homepage`（Micron C1 / Action Verbs A2 / Birthday B1 / Procrastinator B2）。线上仍需在后台 `/admin/videos/{id}` 逐条打开。

**已知/待定**：
1. 原型 aside 底部还有一行「连续学习 7 天 · 本周 3.4 小时 · 已学 18 段」；与末尾「本周」记录区重复，暂未加。
2. 原型媒体列下方有「选它的原因」编辑文案，项目无对应数据，暂不显示。
3. 原型浏览区的行样式（kicker 来源/级别/语速 + 开始听）与本项目 `VideoCard` 仍有差异；本轮只去掉分类，未改卡片。
4. 首条字幕若是 `Kick. Flick. Skip.` 这类无四级以上词的句子，`sample_words` 走回退逻辑（仍显示 3 个词，但等级可能是「中考/高考」）。

### 12.9 v3 已实现（2026-10-19，hero 降噪 + 全文文稿页）

用户反馈三点：
1. 原型里的分类条「**没有这分类功能**」——首页不引入分类（v2 本来就没有，这里只记口径）；
2. **橙色按钮把整个画面的重点抢掉了**；
3. 「**完整文稿也没有原型**」（原型弹窗只给节选 10 句），要求把整段字幕**以文档方式**显示，比图三那种弹窗更丰富。

| 改动 | 落点 |
| --- | --- |
| `Button`/`LinkButton` 新增 **`tonal`** 变体（品牌色浅底 + 品牌色文字）；hero 主动作「从这一段开始」由实心橙改为 tonal，橙只留小面积点缀，视觉重心回到视频与这句话 | `components/ui/Button.tsx`、`components/home/FeaturedListening.tsx` |
| 「看完整文稿」改为「**看全文文稿**」，指向独立文档页 `/watch/{id}/transcript`（不再是播放页链接、也不再是原型式弹窗） | `FeaturedListening.tsx` |
| 新增**全文文稿页**：页头（标题 / 来源·级别·句数·时长·词数·考试词数·语速 / 隐藏译文 / 复制全文 / 回到视频 / 一行阅读提示）；正文按「句间静默 ≥ 6s 或满 9 句」分段；每句左侧时间戳是回播放器并从该句开始的入口；句中考试词只加**等级色虚线下划线**（不铺底色，整篇不花），点词回播放器并直接打开词卡（`?sub=…&word=…`）；右栏吸顶**目录 + 考试词索引**（按等级→出现次数→出现位置排序，最多列 24 个，点条目页内定位并短暂高亮）；底部「回到视频 / 返回首页」+ AI 转写提示 | 新 `components/transcript/TranscriptDocument.tsx`、`app/(main)/watch/[id]/transcript/{page,layout}.tsx`、新 `lib/transcriptDoc.ts` |
| 文档版式：1440 正文 46rem（约 736px）+ 右栏 15rem 吸顶；`<xl` 不显示右栏（1024 壳里正文只剩约 480px，加栏会把一行挤成短句），正文居中最大 46rem | `TranscriptDocument.tsx` |
| 严格按**整段**数据渲染：一次 `GET /videos/{id}`（本来就连全部字幕返回），没有「节选 N 句」这种截断 | 同上（后端无需改动） |
| 返回来源：新增 `from=transcript`（播放页返回按钮显示「返回文稿」）；`resolveWatchReturn(params, videoId?)` 增加可选 id——只有这个来源需要它，缺 id 时退化为 `null`，照旧走浏览器后退 | `lib/watchEntry.ts`、`watch/[id]/page.tsx` 的 `useWatchReturn(id)` |
| 纯函数与单测：分段、考试词索引、逐词 token 化、词数统计都放在 `lib/transcriptDoc.ts`，单测钉住「一段多长 / 词怎么排 / 哪些词才带下划线」 | 新 `lib/transcriptDoc.ts`、`lib/transcriptDoc.test.ts` |

**e2e / 单测变更（断言不放宽）**：
- `home-continue-learning.spec.ts`：hero 用例补两条断言——主操作 `data-variant="tonal"`（防止退回实心橙）、「看全文文稿」`href=/watch/featured-1/transcript`。
- 新增 `transcript-document.spec.ts`（4 条，全量 mock 单个 `/videos/v1`）：整段 4 句与两段都渲染、考试词链接 `?from=transcript&sub=s1&word=rush`、目录 2 条 + 考试词计数；译文一键隐藏/恢复；点句首时间跳到 `/watch/v1?from=transcript&sub=s3`；390 手机右栏隐藏且不横向溢出。
- `watchEntry.test.ts` 新增 `from=transcript` 用例（带 id → `/watch/{id}/transcript`「返回文稿」；缺 id → `null`）。

**验证**：`npm run check` exit 0（0 error，3 条既有 warning）；`npm run test:unit` **247 passed**（新增 16）；e2e `transcript-document` 4 passed、`home-continue-learning` 6 passed、`container-align` 2 passed、`grid-columns` 3 passed；截图核对 1440 / 1024 / 768 / 390 四档（`.debug-shots/transcript-*.png`、`home-v3-*.png`，临时脚本已删）。本轮后端无改动。

**已知/待定**：
1. 文稿页目前只有首页 hero 一个入口；播放页要不要也加「看全文」入口待确认（同一个路由，成本很小）。
2. 原型弹窗的「回到这一句」在文档页由「每句左侧时间戳」承担；页面不内嵌播放器。
3. 分类口径：首页没有任何分类筛选；视频卡片上的「CNBC · 新闻」是内容元信息，不是筛选功能。若这也要去掉，说一声。
4. 词卡只在观看页右侧/抽屉存在，因此文稿页点词是「回播放器 + 打开词卡」，不是页内弹出释义。
5. ~~分类口径：首页没有任何分类筛选~~ **已被 §12.10 取代（2026-10-19）**：用户要求把 `/browse` 的功能并入首页，首页下滑流重新带分类 / 难度 / 排序。

### 12.10 v4 已实现（2026-10-19，browse 并入首页）

用户反馈：**「browse 页和首页的衔接设计的不好」**，理解是**把 browse 页的功能转移到现在首页，在首页下滑就可以选择分类以及排序**。

| 改动 | 落点 |
| --- | --- |
| 首页下滑流从「12 条有界预览 + 看全部视频 → `/browse`」改为**完整无限流**；分类 chips（全部 + 8 个主题，横向可滚）、难度下拉（A1–C2，附考试对照）、排序下拉（推荐 / 最新 / 热播 / 收藏最多 / 本周收藏）、右侧结果计数都在流上 | `app/(main)/page.tsx`、新 `components/home/HomeFeed.tsx` |
| 默认视图仍是「全部 + 推荐」的个性化混合流；选分类/难度后落到 `/browse/feed`（最新），「推荐」选项在筛选时隐藏——后端没有分类内的个性化排序，界面不撒谎。清除筛选自动回推荐 | `hooks/usePlatformFeed.ts` |
| 筛选仍以 URL 为单一真相（`?category=` / `?level=` / `?sort=`）；返回播放页时筛选与滚动位置原样恢复 | `usePlatformFeed`、`useScrollRestore`、`VideoCard entry` |
| 原页尾「本周 + 最近 3 条记录」大块删除：无限流会让它永远滚不到。数字（N 个词 · N 分钟 · N 段看完 + 全部记录 →）收进右栏第 4 个入口，完整记录交给 `/history` | `components/home/HomeAside.tsx`；删除 `components/home/WeeklyHistory.tsx` |
| `/browse` 不再有独立页面：`app/(main)/browse/route.ts` 以 **307** 把 `category/level/sort` 白名单参数带到 `/?…`；站内 22 处引用改指 `/`；播放页「换一段」改指 `/#feed` | `app/(main)/browse/route.ts`；13 个页面文件 |
| 分类标签统一走 `TOPIC_CATEGORY_LABELS`：后端 `/browse/categories` 返回的是英文（All / TED Talks…），原先 browse 页会直接显示英文；`?level=` 非法值回落「全部」，避免下拉显示与请求不一致 | `usePlatformFeed.ts`、`lib/cefrLevels.ts`（新增 `CEFR_LEVELS`） |
| 旧来源 `from=browse` 保留兼容：返回目标改 `/?…`、按钮文案「返回首页」，旧链接不 404；`ACTIVE_SCOPE` 移除 `/browse` | `lib/watchEntry.ts`、`lib/navigation.ts`、`components/ui/VideoCard.tsx` |

**e2e / 单测变更（断言不放宽）**：
- `home-sort.spec.ts` 改名 `home-feed.spec.ts`（4 条，共用一次注册避开注册 3/min 限流）：排序写 URL 且进请求；点分类/选难度后 URL 与请求一致、筛选时「推荐」选项消失；空结果可清除筛选回推荐流；`/browse?category=ted&sort=hot&utm_source=old&page=2` → `/?category=ted&sort=hot`（白名单外参数丢弃）。
- `watch-return.spec.ts`：落点从 `/browse` 回到首页，从 `#feed` 的卡片进播放页，断言 `from=home`、返回按钮「返回首页」、回到 `/?sort=hot`。
- `grid-columns.spec.ts`：去掉首页 vs `/browse` 的对比（两处网格已合并），保留三档视口列数断言；`viewport-height` / `design-rollout` / `production/readiness` 的路由清单以 `/channels` 补位。
- `home-continue-learning.spec.ts`：删掉「本周记录 page_size=3」的 mock 分支，补右栏「本周」数字断言。
- 单测：`watchEntry.test.ts` 新增 `from=browse&category=ted&sort=hot` → `/?category=ted&sort=hot`；`navigation.test.ts` 同步移除 `/browse` 归属。

**验证**：`npm run check` exit 0（0 error，3 条既有 warning）；`npm run test:unit` **245 passed**（20 files）；e2e `home-feed` 4、`watch-return` 1、`grid-columns` 3、`home-continue-learning` 6、`container-align` 2、`transcript-document` 4、`viewport-height` 5 全通过；实测无限滚动 20 → 49 条、URL 不变；截图核对 1440 / 1024 / 768 / 390（`.debug-shots/home-v4-*.png`），390–1440 每档 `documentElement` 与 `#feed` 均无横向溢出；临时截图脚本已删。本轮后端无改动。

**已知/待定**：
1. 分类 chips **不带数量**（原型有「演讲 42」这种计数）：`/browse/categories` 只返回 id/label，要计数得加后端聚合查询，本轮未做。
2. 筛选条**不吸顶**；无限流滚深后要改筛选得滚回流顶（与旧 `/browse` 一致，`.filter-bar` 的吸顶样式仍留给词汇页）。
3. `/browse/feed`、`/browse/categories` 接口保留（首页仍在用），只是前端页面没了。
4. 「本周」只留数字，最近 3 条记录需要去 `/history` 看；如果要在首页保留列表，需要另找位置。


---

## 13. 待确认（更新）

1. ~~**「相关内容」到底是哪一种？**~~ **已结论（2026-10-19）**：用户指向原型 hero 右列那三块入口（继续上次·词汇·练习）；「同主题视频右列」方案已作废，`RelatedVideos.tsx` 已删除（见 §12.8）。
2. **「每日精选」的语义与标题**：标题保留「**本周精听**」但内容按天换，还是标题也改成「每日精选」？全站每天同一条，还是每人不同？
3. **历史记录区要显示什么**：「本周看完 N 段」还是「本周打开过 N 段」（后者要后端加一个字段）；要哪几个数字（词数/分钟/天数/段数）。
4. ~~**`/browse` 选项 1 还是选项 2**（§11.5）~~ **已结论（2026-10-19）**：用户要求把 browse 功能并入首页，走**选项 2**；`/browse` 只留 307 重定向（见 §12.10 / §14.3）。
5. **词汇页的「VN + 数字」**（§8 第 1 条）——给张截图即可定位。

## 14. 导航栏定稿（2026-10-19 确定，待用户点头）

### 14.1 定稿结构：5 个一级 + 4 个次级

| # | 栏目 | 目标路由 | 图标 | 手机底栏 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 1 | 首页 | `/` | Home | ✅ 第 1 项 | 承接原「发现」职责 |
| 2 | 频道 | `/channels` | Layers | ✅ 第 2 项 | 原「发现」槽位换成「全部频道」内容 |
| 3 | 练习 | `/practice` | GraduationCap | ✅ 第 3 项 | 按原型 |
| 4 | 词汇 | `/vocabulary` | BookOpen | ✅ 第 4 项（带到期词徽标） | 按原型 |
| 5 | 我的 | `/profile` | User | ✅ 第 5 项 | 账号与学习设置 |
| 6 | 我的收藏 | `/favorites` | Bookmark | ➖ 仅桌面侧栏 | |
| 7 | 学习记录 | `/history` | History | ➖ 仅桌面侧栏 | |
| 8 | 通知 | `/notifications` | Bell | ➖ 仅桌面侧栏（手机走顶栏铃铛） | 改后首次有导航高亮 |
| 9 | 会员 | `/upgrade` | Crown | ➖ 仅桌面侧栏（手机走「我的」页会员卡） | **本项目会员页**，非原型 `pricing.html` |

**删除**：学习周报（页面/接口/通知偏好/e2e 一并清）。
**不占导航位**：`/search`（顶栏能力，不高亮）、`/pricing`·`/checkout`·`/redeem`（服务端重定向）、`/browse`（见 14.3）、`/contact`（归「我的」）、`/rankings`（归「首页」）。

### 14.2 每栏职责（装什么 / 不装什么 / 归属哪些路由）

| 栏目 | 一句话职责 | 装什么 | **不装什么** | 归属路由 |
| --- | --- | --- | --- | --- |
| **首页** | 今天学什么 + 找内容 | 每日精选/本周精听（可切换，含真句与值得记的词）、右栏四个入口（继续上次 / 词汇 / 练习 / 本周数字）、带分类·难度·排序的无限下滑流 | 频道目录（→ 频道）、完整复习流程（→ 词汇）、完整做题流程（→ 练习）、独立的浏览长列表页 | `/`、`/watch/*`、`/rankings`（`/browse` 仅 307 兼容） |
| **频道** | 按频道/来源逛内容 | 全部频道目录（圆形图标）、频道主页与该频道的内容列表 | 全站视频的筛选长列表（那是首页/浏览的活）、播放（→ 观看页） | `/channels`、`/channels/[slug]` |
| **练习** | 做题 | 三类题型、套卷、每日一组、错题回看（按原型，只做视觉优化） | 词汇复习（→ 词汇） | `/practice/*` |
| **词汇** | 复习到期词 | 到期词表 + 一键「开始复习」的快速复习（按原型收敛） | 原型里没有的标记与入口（如等级徽标等，待定点核对） | `/vocabulary/*` |
| **我的** | 账号与学习设置 | 资料/进度/账号/设置 4 个 tab、帮助与反馈 | 收藏/记录/通知/会员（已拆成次级项） | `/profile`、`/contact` |
| **我的收藏** | 收起来的内容 | 收藏的视频/句子/词 | — | `/favorites` |
| **学习记录** | 看过什么 | 按天分组的学习历史 + 继续观看 | — | `/history` |
| **通知** | 消息收件箱 | 系统/学习提醒/互动 + 偏好开关 | — | `/notifications` |
| **会员** | 购买与权益 | 套餐档位、微信扫码/链接、会员状态 | — | `/upgrade` |

### 14.3 `/browse` 的处置（已定：选项 2）

- **选项 2（2026-10-19 用户选定）**：分类 / 难度 / 排序 / 无限滚动并入首页下滑流（§12.10）；`/browse` 只保留 **307** 重定向到 `/?category=…&level=…&sort=…`，站内 22 处引用改指 `/`。
- ~~选项 1（保留为首页的下级页，导航不出现、高亮「首页」）~~ 作废：用户明确要求「把 browse 页的功能转移到现在首页」。

### 14.4 手机端次级项的入口（已存在，不新增）

| 次级项 | 手机上从哪进 |
| --- | --- |
| 我的收藏 / 学习记录 | 顶栏头像 → 账号菜单 |
| 通知 | 顶栏铃铛 → 下拉「查看全部 →」 |
| 会员 | 「我的」页会员卡 |
| 频道 | 底栏第 2 项 |

---

## 15. 首页 · 三个口径的默认方案（你不反对就按这个做）

1. ~~**「相关内容」= 同主题视频**~~ **已被原型取代（2026-10-19）**：hero 右侧照原型放「继续上次 / 词汇 / 练习」三块入口（见 §12.8），不再另开相关内容列。
2. **「每日精选」**：标题保留「**本周精听**」；内容**按天轮换**（服务端按用户本地日期派生，先做「全站同一天同一条」）；切换按钮保留（前端本地切 + 后续给 `featured` 加 `exclude` 让服务端也能换）。
3. **历史记录区**：显示「本周 N 词 / N 分钟 / N 段（看完）」+ 最近 3 条记录（按今天/昨天/更早分组，沿用 `history` 页的分组逻辑）；数据用 `/learning/stats/weekly` + `/learning/records` + `/plan/profile`，**不加新端点**。
   **2026-10-19 调整（§12.10）**：首页下滑流改无限滚动后，末尾记录区永远滚不到；本周数字收进右栏，最近 3 条记录只在 `/history` 保留。

---

## 16. 下一步

顺序：~~导航栏（C1 结构重构 → C2 换「频道」+ 落归属表）~~ ✅ → ~~首页改版（v1）~~ ✅ → ~~首页 v2 视觉迭代（§12.8）~~ ✅ → ~~首页 v3：hero 降噪 + 全文文稿页（§12.9）~~ ✅ → ~~首页 v4：browse 并入首页（§12.10）~~ ✅ → 频道 → 词汇 → 练习 → 我的。

- 导航与 IA：§11 清单 + §14 定稿**已落地**（`navigation.ts` / `Sidebar.tsx` / `navigation.test.ts` / 移动端 e2e 同步）。
- 首页：v1（§12.7）、v2（§12.8）、v3（§12.9）、v4（§12.10）都已落地；下滑流现在自带分类 / 难度 / 排序与无限滚动，`/browse` 只剩 307 重定向。
- 全文文稿页已就位（`/watch/{id}/transcript`）；**播放页要不要也加一个入口**待用户点头，其余视觉细节等反馈。
- 频道是下一条：`/channels` 收敛为**圆形频道图标 + 频道主页**（browse 已并入首页，不再做「合并 browse」）；开工前确认这一版频道形态。
- 仍待补：**词汇页的「VN + 数字」截图**（§13 第 5 条），到词汇那一栏时要用。
