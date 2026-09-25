# Handoff: S2f — 首页排序项「收藏最多 / 本周收藏」（前端）

- Owner: `frontend-main`
- Status: done
- Planner acceptance: 首页排序下拉里出现「收藏最多」与「本周收藏」；选任一项后 URL 带 `sort=`，
  且**发往 `/api/v1/browse/feed` 的请求里真的带该参数**（不是静默回落默认排序）、后端返回 200；
  既有四项（推荐/热播/最新 + `sort=hot`）行为不变。

## 任务

S2b 已把 `favorite` / `weekly_favorite` 两个排序值落到 `GET /api/v1/browse/feed`（DEC-052，后端已提交），
本片把它接到首页排序下拉。S2b 归档票的「契约变更」节点名必须改 **3 处**（设计文档 §2.2 只写了 2 处）：
`FeedSort` 联合类型、`SORT_VALUES`（`isFeedSort()` 白名单）、`HomeFilterBar` 的 `SORT_OPTIONS`；
漏掉第二个会让 URL 上的 `?sort=favorite` 静默回落到默认排序。

设计依据：`docs/plans/词汇训练与播放页返回-设计方案-2026-09.md` §2.2；
执行方案：`docs/plans/词汇训练与播放页返回-执行方案-2026-09.md` §3。

## 已完成

- `frontend/src/hooks/usePlatformFeed.ts`
  - `SORT_VALUES` 扩为五值并改为 `as const` 数组，`FeedSort` 由它派生（`(typeof SORT_VALUES)[number]`）。
    原先类型与白名单是两处独立列表，加值只改一处就静默漂移；现在这类漏改不可能发生。对外仍是
    `export type FeedSort`，`HomeFilterBar` 的 import 未动。
  - 请求参数由「只认 `hot`」改为白名单四值：`hot | favorite | weekly_favorite` 才 `params.set("sort", …)`；
    `latest`（后端默认）与 `recommended`（客户端概念）都不发。注释同步。
- `frontend/src/components/home/HomeFilterBar.tsx`
  - `SORT_OPTIONS` 加两项：`favorite`「收藏最多 / 按收藏总数排序」、`weekly_favorite`「本周收藏 /
    按本周新增收藏排序」；图标 `Bookmark`（沿用 `VideoCard` 的收藏语义）与 `CalendarHeart`。
  - 顺序为 推荐 → 热播 → 收藏最多 → 本周收藏 → 最新（两个计数型排序贴着热播，时间轴落末位）。
  - 组件 docstring 的排序取值列表同步为五项。
- 新增 `frontend/e2e/home-sort.spec.ts`
  - 断言**发出去的请求**：点「收藏最多」→ `/browse/feed` 请求带 `sort=favorite` 且响应 200；再点
    「本周收藏」→ `sort=weekly_favorite` 同样成立；且两项在下拉里可见。只断言 URL 抓不到「白名单漏改
    导致的静默回落」，所以刻意断言响应而不是 URL。不依赖库里有视频，无需 `test.skip()`。
- 知识层：`knowledge-stamps.json` 刷新 `frontend-components` 印章（先核对
  `wiki/architecture/frontend-architecture.md` 的 Navigation 一节——它讲 URL 是筛选唯一真相、`from=` 与
  `replace`，不枚举 sort 取值，改动后仍成立）。**未写 wiki 正文**：sort 取值由代码直述，按知识层
  「Implicit Knowledge Filter」不入档。

## 契约变更

**无**（四个契约文件均未动）。

- `frontend/src/lib/api.ts`、`createApiClient.ts`、`backend/app/schemas/*`、`backend/app/api/dependencies.py`
  一律未改；后端零改动。
- 唯一的对外变化是 `FeedSort` 联合类型**追加**两个值（`"favorite"` / `"weekly_favorite"`），两个消费方
  （`usePlatformFeed` 自身、`HomeFilterBar`）都已在同一次改动里同步；`usePlatformFeed` 的入参与返回结构未变。
- 与后端的契约（`sort` 参数取值）由 S2b 定，本片只是接通，无新契约面。

## 关键决策

- **类型从白名单派生**，而不是各写一份：这正是本片要修的漏洞（S2b 警告的「漏改 `SORT_VALUES`」）。
  副作用是 `isFeedSort` 里需要 `(SORT_VALUES as readonly string[]).includes(value)` 一次窄化转换。
- **请求参数用白名单而非 `sort !== "latest"`**：`/browse?sort=recommended` 是 `isFeedSort()` 认得的合法值，
  用「非 latest 就发」会把它发给后端换一个 422。
- **不新开 DEC**：执行方案 §1 的三个强制 DEC 点是空进度落库(S3)、复习间隔(S6)、选择题化(S5)；本片接口契约
  已由 DEC-052 裁决，它只是被接通到前端。
- **不加单元测试**：`hooks/` 模块顶层 import `next/navigation`，现有 vitest 是 `environment: "node"`，为一个
  `includes()` 白名单拉 jsdom 不值当；本片也没有值得抽进 `lib/` 的纯函数（类型已从数组派生）。回归防线放在 e2e。
- **`/browse` 不加排序 UI**：本片范围是首页（执行方案 §3 的「首页排序项」）。`/browse?sort=favorite` 手写 URL
  现在也能用，只是没有入口。
- **门禁 0 影响面（`npx gitnexus` CLI 本次可用）**：`usePlatformFeed` 与 `isFeedSort` 报 **HIGH**（direct 2、
  影响 4 条流程 HomePage/HomeFeed/BrowsePage/BrowseFeed），`HomeFilterBar` / `SortDropdown` 为 LOW。HIGH 只来自
  「hook 被首页与浏览页共用」，本片是纯追加（不动签名/返回结构/既有四值行为），已按 AGENTS.md 要求报备。
  索引比 HEAD 落后三个 docs-only commit（只动了 `.md` / `knowledge-stamps.json`），代码图仍有效。

## 遗留

- **门禁 1 结果（逐个看退出码）**：
  - `npm run format:check` → **exit 0**；`npx tsc --noEmit` → **exit 0**；
    `npm run test:unit` → **exit 0**（10 files / 78 tests）；
    `npm run lint` → **exit 0**（0 errors / 10 warnings，均为既有文件）；
    `npm run build` → **exit 0**。
  - 知识层 `check_knowledge.py` → **exit 0**（七项全 ok，含刷新后的 `stale`）。
  - **后端三门未跑**（pytest / ruff / mypy）：本片零后端改动。上一次全量绿是 S3 那次提交。
  - **e2e 只跑了受影响的 2 个 spec**（`npx playwright test --project=chromium e2e/home-sort.spec.ts
    e2e/watch-return.spec.ts`）：`home-sort.spec.ts` passed；全量 chromium 套件交给 CI 的 e2e job。
    本地后端按 `wiki/guides/release-checklist.md` 的 e2e 行起（`ENV=testing` + `JWT_SECRET` + `DATABASE_URL`
    + `PYTHONUTF8=1`，`.venv` 解释器），`playwright.config.ts` 的 `reuseExistingServer` 复用它。
  - 后端访问日志实证：e2e 期间真实出现 `GET /api/v1/browse/feed?...&page_size=20&sort=favorite` 与
    `…&sort=weekly_favorite`，均 200。
- **本地 e2e 的既存并发 flake（与本片无关）**：两个 spec 并行跑时，`uniquePhone()` 会撞号，`watch-return.spec.ts`
  报 `409 该手机号已注册`；单独重跑 **passed**（release-checklist 的 trap 表已记同类现象）。要本地全绿就串行跑。
- **未跟踪的 `frontend/AGENTS.md` / `frontend/CLAUDE.md`**：`next dev` 生成的下一代 agent 文件，历史提交从未纳入，
  本次亦不提交（避免把工具产物混进功能提交）。`frontend/next-env.d.ts` 在 `next build` 后回到 tracked 形态，
  提交前已用 `git status` 复核未夹带。
- **`frontend/src/hooks/**` 仍不匹配 `modules.json` 任何 glob**（state.md 已记录的缺口）：本片改动的两个文件里，
  只有 `HomeFilterBar.tsx` 有模块归属（`frontend-components`），所以 `/knowledge-maintain` 的「≥2 模块」门槛未触发。
  若要补这个缺口，得给 `modules.json` 加 `frontend-hooks` 模块并刷印章——属知识层动作，不在本片范围。
- 未跑全量 chromium 的具体理由：全仓只有 `watch-return.spec.ts` 会点排序下拉（已 grep 确认），其 `/热播/`
  定位器不受新增项影响（触发按钮当时显示「推荐」，定位不歧义）。
