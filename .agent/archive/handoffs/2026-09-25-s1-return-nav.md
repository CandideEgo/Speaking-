# Handoff: S1 — 播放页来源感知返回 + 无损返回 + 频道入口提亮

- Owner: `frontend-main`
- Status: done（工作区已改完、门禁已过，**端到端已验证**：2026-09-25 在 docker Postgres/Redis + `ENV=testing` 的后端上 seed 后，`e2e/watch-return.spec.ts` 对着真实栈 passed）
- Planner acceptance: 六个来源（首页/频道/搜索/收藏/词库集合/真题）各进一次播放页，返回按钮的**文案与目标**均正确；首页筛选与滚动位置返回后保留；未挂频道的视频不出现「返回频道」；按返回后按浏览器后退不出现回到播放页的回退环。

## 任务

播放页返回按钮现在写死 `router.push("/browse")` + 写死「返回频道」（`frontend/src/app/(main)/watch/[id]/page.tsx:606-612`，且无条件渲染），全站入口不带来源信息，首页筛选又在组件 state 里，所以「从首页来、返回首页、筛选不丢」目前不成立。

给所有进入播放页的链接打 `?from=` 来源标记，播放页按标记决定返回目标与文案；把首页/浏览的筛选写进 URL；加滚动位置恢复；顺手把频道名升级为可辨识的 chip（带边框 + **朝右**箭头，不新增占位——大卡曾在「播放页去掉频道入口卡，字幕卡回到播放器正下方」（09-22）因挤字幕被删，不要回滚）。

设计依据：`docs/plans/词汇训练与播放页返回-设计方案-2026-09.md` §2.1 §2.2。

## 已完成

来源枚举与映射表
- 新增 `frontend/src/lib/watchEntry.ts`：`WatchSource` 九值枚举、`buildWatchEntryQuery` / `watchHref`（进播放页）、`resolveWatchReturn`（播放页解析返回目标 + 文案）。返回地址是枚举 + 白名单参数拼出来的，不接受任意「返回 URL」参数，所以不引入 open redirect。
- 新增 `frontend/src/lib/watchEntry.test.ts`：12 例，覆盖九行映射表、缺标记 / 未知标记 / `channel` 缺 slug / `set` 缺 set 各返回 `null`、编码、`null`/空值丢弃、`from` 不可被 `extra` 覆盖。

播放页
- `frontend/src/app/(main)/watch/[id]/page.tsx`：新增 `useWatchReturn()`（`:72-95`），命中标记 → `{label, go: () => router.replace(href)}`；未命中 → `{label:"返回", go: history.length>1 ? back() : replace("/")}`。
- 三处写死出口改用同一出口：顶栏返回按钮（`:629-637`）、处理失败页的 action（`:608-613`）、已下架页的「浏览其他视频」（`:575-580`，文案随来源变）。
- 频道 meta 行（`:709-717`）：有 `channel_slug` 时升级为圆角边框 chip + 朝右 `<ChevronRight size={12}>`；无 slug 保持纯文本、无名字保持 `SeeWord`。

入口标记（14 个面，进播放页的 22 处跳转里 20 处已带来源）
- `components/ui/VideoCard.tsx`：新增可选 prop `entry?: WatchEntry`，href 走 `watchHref`；不传时 href 与今天逐字节一致。四个渲染点（首页/浏览/频道/收藏）各自传自己的来源。
- 首页 `from=home`（透传原始 `category/level/sort`）、浏览 `from=browse`、频道 `from=channel&slug=`、收藏 `from=favorites`（含卡片内嵌的 note 链接，保留 `note=1`）、历史 `from=history`、集合详情 `from=set&set=`、搜索页与搜索下拉与顶栏搜索 `from=search&q=`、榜单 Row/Podium `from=rankings`、训练面板与 `WordFlashcard` `from=drill`。
- 剩下的 2 处是 `hooks/usePlatformFeed.ts` 的 `startLearning`（`:212`/`:221`），死代码、全仓无消费者，按执行方案「不动」。若将来要接上它，`from` 直接取该 hook 已知的 `platform`（`"home" | "browse"`，正好都在枚举里）即可。

筛选进 URL
- `frontend/src/hooks/usePlatformFeed.ts`：`category/level/sort` 改为由 `useSearchParams` 派生（URL 是唯一真相，不做双向同步），setter 走 `router.replace` 且默认值不写进 URL；返回结构不变，所以 `HomeFilterBar` 与「清除筛选」一行未改。`filters` 仍是定长 4 元组。
- `app/(main)/page.tsx` 拆出 `HomeFeed`、`app/(main)/browse/page.tsx` 拆出 `BrowseFeed`，Suspense 边界只包列表段，问候区/统计条保持预渲染（`next build` 路由表里 `/` 与 `/browse` 仍是 ○ static）。

滚动恢复
- 新增 `frontend/src/lib/scrollMemory.ts`（`SCROLL_CONTAINER_ID`、`scrollKey`、`loadScroll`、`saveScroll`，sessionStorage 全部 try/catch）与 `frontend/src/hooks/useScrollRestore.ts`（rAF 恢复循环 + 节流存档；恢复期间不写存档，用户一动滚轮即放弃）。
- `app/(main)/MainLayoutInner.tsx`：给真正的滚动容器 `<main>` 加 `id={SCROLL_CONTAINER_ID}`。
- 接入 7 个列表页：首页、浏览、频道详情、搜索、收藏、历史、榜单。训练页与集合详情页刻意不接（前者应从顶部开始）。

e2e
- 新增 `frontend/e2e/watch-return.spec.ts`：点「热播」→ URL 带 `sort=hot` → **点击**卡片（客户端导航）→ 返回按钮文案「返回首页」→ 点返回 → 回到带筛选的首页 → `goBack()` 不落回 `/watch/`。
- `frontend/e2e/watch.spec.ts:25`：删掉早已不匹配任何文案的 `返回浏览` 正则备选。

知识层
- `wiki/architecture/frontend-architecture.md`：新增「Navigation, URL State and Scrolling」一节（shell 的 `<main>` 是唯一滚动容器、`window.scrollTo` 无效、筛选以 URL 为单一真相、`useSearchParams` 需 Suspense、`from=` 标记与 `replace` 而非 `push` 的原因），`updated` 改 2026-09-25。
- `wiki/guides/release-checklist.md`：trap 表补一行——Playwright 的 webServer 是子进程，pytest 那行的 `PYTHONUTF8=1` 传不进去，本地必须先 `PYTHONUTF8=1 npx playwright test`，否则 uvicorn 读 env 文件时 `UnicodeDecodeError: 'gbk' codec`。
- `.agent/state.md`：Next Step 8 标注 S1 已落地待提交。

## 契约变更

无。

`frontend/src/lib/api.ts` / `createApiClient.ts` 未动；`backend/app/schemas/*` 未动（本片零后端改动）。两个新增文件 `lib/watchEntry.ts`、`lib/scrollMemory.ts` 不在 `owners.md` 的契约文件清单内。`VideoCard` 的 `entry` prop 是可选新增，四个既有调用点不传时行为不变。

## 关键决策

- 返回用 `router.replace` 而非 `push`：`push` 会形成「首页 → 播放页 → 首页 → 浏览器后退 → 又回播放页」的回退环。
- 无 `?from=` 时 `router.back()`，无法回退再落 `/`；**不要**用 `document.referrer` 判断（不可靠）。
- `from=` 是枚举，不是自由返回地址；返回 URL 由白名单参数拼装 —— 与 `lib/authHelpers.safeNext` 同一条安全底线，只是用枚举而不是校验来实现。
- `from=browse` 的文案也是「返回频道」：`/browse` 就是导航里的「频道」tab（`MobileTabBar` / `TopBar`），同一个文案两个不同目标（tab vs 某个频道详情页）都是对的。
- 筛选进 URL 会外溢收益：首页筛选从此可分享、可收藏、可后退。
- 频道 chip 箭头朝右；朝下会被理解为「下拉展开」。
- **本片不新建 `.agent/decisions.md` 条目**：执行方案 `:29` 把 DEC 强制点限定为 ①空进度落库(S3) ②复习间隔(S6) ③选择题化(S5)，S1 不在其中；且 `.agent/decisions.md` 已到 99.8%，下一条写入前必须先做归档轮。本片的取舍记在本节与上面那节 wiki 里。
- 开工前的 `gitnexus_impact` **未能执行**：本会话没有 GitNexus MCP 工具，仓库里也没有 `gitnexus` CLI。改为手工调用方分析，最高风险为 MEDIUM（`usePlatformFeed` 两个调用方：首页、浏览），无 HIGH/CRITICAL。

## 遗留

- **端到端已验证（2026-09-25，本条已关闭）**：起 docker Postgres/Redis 后，`e2e/watch-return.spec.ts` 对着真实栈 passed（客户端导航 → 「返回首页」→ 回到带 `sort=hot` 的首页 → `goBack()` 不落回 `/watch/`）。走通这一步要两个前提，都已处理：
  - 本地后端必须 `ENV=testing`：dev 形态下限流是开的，而 ~95 个 spec 各自注册一个用户，`e2e/helpers.ts` 会成片吃 `429 RATE_LIMITED`（且并行下时间戳手机号会撞成 `409`），看起来像大面积回归。已写进 `wiki/guides/release-checklist.md` 的 trap 表。
  - `backend/scripts/seed_e2e.py` 建的视频**从未置 `is_published=True`**，而 feed/browse 过滤 `is_published`：所以自 2026-08-14 起 watch 类 e2e 在 CI 里一直是**静默 skip**（`watch.spec.ts` 亦然）。已修，并顺带处理它暴露出来的 `e2e/mobile-d1-d10.spec.ts`——该 spec 断言写死 iPhone X 几何却被 chromium（1280 宽）收集，且需要真能播的本地视频（合成 seed 只有占位 URL），现在视口自钉 + 无媒体时跳过。
- `from=drill` 目前只落 `/vocabulary/drill`，**轮次续不上**——drill 的进度还在 React state 里。要等 S3/S5 落库；那之前从训练页点「去看原视频 / 回看原句」再返回会丢掉本轮进度。
- 浏览器**后退**（不是点返回按钮）回到列表页时，滚动位置不恢复：`useScrollRestore` 的恢复挂在 `ready` 的 false→true 跳变上，走 Next 路由缓存复用组件实例时 `ready` 一直是 true。点返回按钮（本片的验收路径）已验证可用。
- 搜索页的 URL 不同步 `q`（本片刻意不动它的写入逻辑）。后果：从 `/search` 直接输入关键词搜索、再进播放页，返回目标带 `?q=…`，滚动记忆的 key 与来时不一致，位置不恢复（筛选与结果本身正常）。
- 播放页的 `?sub=` / `?word=` 定位与高亮、「回到对应句子」/「去原视频」链接的统一生成函数留 S7b —— `lib/watchEntry.ts` 已按同文件复用的预期留好位置。
- 本机跑不通的后端门：`PYTHONUTF8=1 pytest tests/` 得 409 passed / 12 skipped / **1 failed**，失败是 `tests/test_profile.py::TestAvatarUpload::test_upload_avatar_sets_url`，原因是 `app/api/v1/users.py:93` 用了 `starlette.status.HTTP_413_CONTENT_TOO_LARGE`（该 starlette 版本只有 `HTTP_413_REQUEST_ENTITY_TOO_LARGE`）。本片零后端改动，与本片无关，但会挡住「四道门全绿」。
