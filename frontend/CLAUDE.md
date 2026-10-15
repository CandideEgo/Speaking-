# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

前端（`frontend/`）专属的命令与局部约定。架构叙述在根 [`CLAUDE.md`](../CLAUDE.md)，本文件只承接前端自己的东西。

## 这个 Next.js 不是你以为的那个

本仓库是 **Next.js 16**（App Router）——API、约定与文件结构都可能和你训练数据里的不同。**写代码前先读 `frontend/node_modules/next/dist/docs/` 里对应的指南**，留心 deprecation 提示。一个已经撞上的例子：Next 16 把 `middleware` 改名成了 [`src/proxy.ts`](src/proxy.ts) 里的 `proxy`。

另注意：**`next dev` 会往 agent 文件里塞一段托管的 nextjs-agent-rules 块**（`node_modules/next/dist/server/lib/generate-agent-files.js`）：`AGENTS.md` 存在且已托管该块时写它，否则写进 `CLAUDE.md`——**本仓库是后者**，所以那段自动块长在这个文件末尾。不要跟它较劲：本文件其余部分才是人写的、稳定的那份；**看到带 `BEGIN:` / `END:` 标记的托管块出现在 diff 里就顺手提交**，删掉只会让它再次出现。

**但别在本文件的人写段落里逐字写出那两个标记。** `upsertAgentRulesBlock` 用 `indexOf` 找**第一处**起始标记，人写文字里出现一次，它就会把「这处标记 → 真正的结束标记」之间的一切当成待替换的块内容，正文被整段吃掉：2026-10-15 实测，这段提醒原先逐字引用了起始标记，一次 `npm run dev` 就把本文件从 71 行削到 19 行（命令表、两道门、局部约定、e2e 全没了，只剩被截断的半句话）。要指代它就写「起始/结束标记」，或拆开写 `BEGIN:` 与 `END:`。

## 命令

| 目的                                                                     | 命令                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 装依赖                                                                   | `npm ci --legacy-peer-deps`                                |
| dev                                                                      | `npm run dev`                                              |
| build                                                                    | `npm run build`                                            |
| 门禁（design-system + session-writes + typecheck + lint + format:check） | `npm run check`                                            |
| 单测（全量 / 单文件）                                                    | `npm run test:unit` · `npx vitest run src/lib/api.test.ts` |
| e2e                                                                      | `npx playwright test`                                      |

单测是 Vitest 4，**跑在 node 环境**，只收 `src/**/*.test.{ts,tsx}`——测试与源码同目录，`e2e/` 下的 Playwright spec 不会被它收走。

## 设计系统门（`npm run check` 的第一关）

`frontend/scripts/check-design-system.mjs` 是**四条设计不变量唯一的机器执行点**。它扫原始文本（**注释里也扫**，故意的：假阳性只是改个措辞，假阴性会真的放行）：

1. `src/app` 下**不得**出现 `container-page` / `container-wide`——容器归壳层所有
2. `src` 下 `.ts`/`.tsx` **不得**出现原始调色板工具类（`bg-blue-100`、`text-slate-700` 之类）——用语义 token
3. `src` 下 `.tsx` **不得**出现允许集外的 `rounded-*`——允许集仅 `sm|md|lg|pill|full|none`（含方向角）
4. `src/app` 下的 `page.tsx` **不得**自己写 `<h1>`——用 `ui/PageHeader`

白名单**点名文件并写理由**，不允许通配（逼着人解释"为什么这个文件例外"）。被列进白名单的文件在该条规则下整文件豁免。**要加白名单之前先想清楚是不是在绕门禁**——根规则是「永不为让检查变绿而放宽检查器」。

## 会话写入门（`npm run check` 的第二关）

`frontend/scripts/check-session-writes.mjs` 守着一条不变量：**除了 `src/lib/authHelpers.ts`，`src/` 下不得出现任何会话写入**。两条规则——不得写 `document.cookie`（= 赋值；读不算），不得对会话 key 做 `localStorage` 写入。

为什么值得单开一个门：「已登录」有两个家——localStorage（真身，API 调用带它）与镜像 cookie `seeword_token`（`proxy.ts` 的边缘登录墙只查它的存在性）。两者分开写会造出「用户看着已登录、每个请求被 307 弹回 /login」的状态（修过一次，见 `components/auth/RedirectStuckState.tsx`）。收敛后，写两个家只能经 `authHelpers` 的 `setSession` / `clearSession` / `remirrorSessionCookie`。`src` 下其它 `localStorage` 用途（主题、播放倍速、搜索历史…）不受这条规则影响。

## 几条容易踩的局部约定

**容器归属**：全站唯一的 `.container-page` 在 [`src/app/(main)/MainLayoutInner.tsx`](<src/app/(main)/MainLayoutInner.tsx>) 渲染一次。页面**不得**自己再加容器——这正是设计系统第 1 条拦的东西。

**观看页换壳**：`pathname.startsWith("/watch/")` 会把 TopBar 换成 `WatchTopBar`、MobileTabBar 换成 `WatchBottomBar`。[`WatchChromeProvider`](src/components/watch/WatchChromeProvider.tsx) 是全局单槽，底栏是铺满整宽的四个键。

**`devIndicators: false` 是故意的，不是随手关的**（[`next.config.js`](next.config.js)）：Next 的 dev 徽标正好压在观看页底栏「上一句」的中心点上（实测 `elementFromPoint(52, 868)` 命中 `NEXTJS-PORTAL`），挪到右下角又压「跟读」，而底栏四角没有一个位置不压按钮——所以唯一能同时保住真机可点性与自动化判据的取值是整个关掉。编译/运行时错误浮层不受影响。

**dev 代理只在 dev 生效**：`next.config.js` 的 `rewrites()` 把 `/api`、`/media`、`/health` 转到 `localhost:8000`，**仅当 `NODE_ENV === "development"`**。生产是 `output: "standalone"` + nginx 反代，没有这些 rewrite。**推论：e2e 必须对着 `next dev` 跑**；`next start` 没有代理，也够不到后端。同理，本机真机联调（手机走局域网 IP 访问 dev 站）要靠 `allowedDevOrigins`（默认放行 `192.168.x.x`，其它网段用 `DEV_ALLOWED_ORIGINS`），否则 Next 16 的 cross-site 防护会挡掉 HMR WebSocket，页面停在骨架屏、一个 API 都不发。

**token 双重存放**：真身在 Zustand [`authStore`](src/stores/authStore.ts) 的 localStorage，请求时带 `Authorization: Bearer`；同时镜像到 cookie `seeword_token`，供边缘登录墙 [`src/proxy.ts`](src/proxy.ts) 读取。**登录墙只查 cookie 是否存在**，不解析 JWT、不查库。管理端是另一套：独立 `adminAuthStore` + `seeword_admin_token` + [`lib/adminApi.ts`](src/lib/adminApi.ts)。因为 `<video>`/`<audio>` 发不了请求头，`mediaUrl()` 用 `?token=` 附 token。

**图片走自定义 loader**：[`src/lib/imageLoader.ts`](src/lib/imageLoader.ts) 绕过 Next 优化器（生产 standalone server 上没有 `/media` 路由，优化器的服务端抓取会失败）；`mediaUrl()` 把防盗链的 CDN 经 `/media/proxy` 代理。**新增远程图源要同时加 `next.config.js` 的 `images.remotePatterns`**，否则 `next/image` 会拒。

## e2e

[`playwright.config.ts`](playwright.config.ts)：`testDir: ./e2e`，baseURL 取 `PLAYWRIGHT_BASE_URL` 否则 `http://localhost:3000`，四个 project：`chromium` / `firefox` / `mobile-chrome` / `mobile-iphone`。非 CI 环境下有 `webServer` 会自动拉起 backend（uvicorn :8000）+ `npm run dev`。

**CI 只跑 `--project=chromium`，并且必须先把库迁到 head 再 `python scripts/seed_e2e.py` 播种**——否则首页没有视频，观看页那批 spec 会整片 `skip()`（看着绿，其实一条没跑）。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
