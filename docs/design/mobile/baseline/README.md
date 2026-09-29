# 播放页移动端现状基线（wayfinder #22）

2026-09-29。**在本地真实栈上量的，不是真机**——量不出来的三件事单列在最后一节。

## 怎么量到的

```
docker compose -f docker-compose.dev.yml up -d     # db + redis
cd backend  && ./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
cd frontend && npm run dev                          # :3000
```

登录：用后端自己的 `app.core.security.create_token(user_id)` 铸了一个 JWT（线上是短信登录，`auth.py` 的 dev-fake 模式把验证码写日志），在 Playwright 里注入 `localStorage.seeword_token` + 同名 cookie。测的对象是 `/watch/6fdcdd86-d267-460c-bb48-da2eb88d21cf`。

量具：仓库自带前端 Playwright 的 Chromium，视口 **375×812 @2x**、`isMobile` + `hasTouch`、iPhone 17.5 Safari UA。所有数字取自 `getBoundingClientRect()`，不是目测。

> 注意：线上 `seeword.top` 的播放页在登录墙后面（INV-018），匿名打不开；docker 之前没启动。所以这份基线是**本地渲染的真实代码**，不是线上实例。

## 首屏实测（375×812）

| 元素 | 位置 | 尺寸 | 占屏高 |
|---|---|---|---|
| 顶栏 `header` | y0–64 | 375×64 | 7.9% |
| **视频盒**（`aspect-video` + `px-4`） | **y166–358.9** | **343×192.9** | 23.8% |
| 文稿滚动容器 | y64–812 | 内容高 1417 | — |
| 底部导航 `nav`（fixed bottom-0） | y767–812 | 375×**45** | 5.5% |
| 迷你播放器（fixed bottom-4 right-4 z-50） | y711.6–796 | 150×84.4 | 10.4% |

三条读数值得记：

1. **视频从 y166 才开始**——顶栏 64px + 页头 + 频道元信息吃掉 **166px = 20.4% 屏高**（和 `reference/README.md` 从截图上读出的「21%」吻合，那次是数像素，这次是量元素）
2. **底栏真实高度是 45px，不是 56px**。三个原型里 `--tabbar-h` 按 56 算的，差 11px——不用重做原型（它只是让可用高度保守了 11px），但实现时要按真实值来
3. **迷你播放器压住底栏 29px**（711.6–796 与 767–812 相交，z-50 盖 z-40）。它的关闭按钮实测 **24×24**，远低于 44px

## 点词（#27 的第一手实证）

- **行内单词热区**：点中的 `welcome` 是 **74.1×20 px**（font-size 17px）→ 高度 20px。44px 在这条路上不可能，与原型里的实测一致
- **点开后词卡**：`fixed` z-50，**345×313**，y475–788，left 24 → **不遮住刚点的那个词**，词下沿（473.3）到卡上沿（475）只差 **1.7px**
  - 也就是说：**现状的词卡是贴着被点的词定位的，不是从底部弹起来的**。这一点很重要——乙（字幕入画）会把词搬到画面上部（y111–191），卡如果还按「贴着词」定位，就落到画面里；如果改成「从底部升起」，就出现原型里那 470px 的断层。这是 #27 要裁决的分岔
- 词卡 `touch-action: none`（`components/subtitle/WordTooltipInline.tsx:147` 确认），内部另有一个 `overflow-y-auto max-h-[min(72vh,560px)]` 滚动区。本次词条内容没超出（scrollHeight == clientHeight == 256），**所以「卡内能不能滚」这次没验到**
- 卡内按钮实测：关闭 **25×25**、发音 **152×30**、加入词库 **151×30** —— 全部低于 44px

## 代码侧已确认（不是量出来的）

- `app/(main)/MainLayoutInner.tsx:75` 是 `flex flex-col h-screen overflow-hidden`，底栏 `components/layout/MobileTabBar.tsx` 是 `fixed bottom-0`。**两个原因叠在一起**：`100vh` = 地址栏**隐藏**时的高度（比可视区多 40px），而 `fixed` 锚的是 layout viewport（= `100lvh`）而不是当前可视区 —— 地址栏一出现，45px 的底栏就落到可视区底边以下 40px，被地址栏压住
  - **2026-09-30 更正**：上面这条原先只记了 `h-screen` 那一半。真机截图（地址栏展开态，414×896）显示底栏标签（css y780–794）正压在地址栏上沿、而 `100dvh` 已生效 —— 说明**单独换 `dvh` 修不了 `fixed` 元素**：壳换成 `h-dvh` 之后底栏仍是 `fixed`，仍比可视区低 40px，只有把它从 `fixed` 改成壳里的常规流收尾行（`shrink-0`）才贴得住 `dvh` 的底边。两条都改了：壳 `h-screen → h-dvh`（+ `viewport-fit=cover` + 壳上安全区 padding），底栏由 `fixed bottom-0` 改成常规流。回归断言在 `frontend/e2e/viewport-height.spec.ts`
- ~~全应用没有 `viewport` 导出 → 没有 `viewport-fit=cover`；全仓唯一一处安全区（`components/layout/MobileTabBar.tsx:61`）很可能恒为 0~~ **09-30 改了**：`app/layout.tsx` 导出 `viewport`（`viewportFit: "cover"`）；安全区收归壳 `app/(main)/MainLayoutInner.tsx` 一处负责（`env(safe-area-inset-*)` padding），底栏不再自带

## 真机读数（2026-09-30，iPhone 11 · 414×896 css @dpr2）

用户在自己手机上跑量具页取到的读数，原文逐字存在 `probe-2026-09-30.txt`，截图 `probe-*.jpg`。

| | Safari（地址栏收起 → 展开） | 夸克 |
|---|---|---|
| `innerHeight` / `visualViewport.height` | 790 → 750（**−40**） | 749 → 749（不变） |
| `100vh`（= `h-screen`） | **790 → 790**（恒定） | 749 → 749 |
| `100svh` / `100lvh` / `100dvh` | 750 / 790 / 790→750 | 749 / 749 / 749 |
| 安全区四边 | 全 0（`fit=auto`） | 全 0（`fit=auto`） |

三条推论：

- **iOS Safari 的 `100vh` 恒等于地址栏收起时的高度**，地址栏一展开就比可视区多 40px —— 壳拿它当高度，就必然有 40px 内容落在可视区外
- **夸克没有这个问题**：四个高度单位读数一致、`100vh` = `innerHeight`，地址栏收放不动它们。所以「底栏被地址栏吃掉」是 Safari 独有的病历
- 安全区在 `fit=auto` **和 `fit=cover` 下四边都是 0**（09-30 贴报告文本重跑确认，原文在 `probe-2026-09-30.txt` 末节）。两张表逐行相同、连 `100vh` 都是 790 —— **说明 `viewport-fit=cover` 在 Safari 浏览器模式下根本没生效**。社区口径是「cover 生效时 insets 才有值」（[WebKit 原说明](https://webkit.org/blog/7929/designing-websites-for-iphone-x)），而 iOS 26 起 Safari 还允不允许铺进上下工具条区，社区里已有「浏览器模式下不生效、只有加到主屏才生效」的说法，与这里的读数一致
  - **所以壳那段 `env()` padding 今天在 Safari 上是 no-op**（加 0），底栏贴在可视区底边、本就在工具条之上，不会落进 Home indicator 条；它是留给 standalone（加到主屏）与有 cutout 的 Android 的保险。本项目目前没有 manifest / `apple-mobile-web-app-capable`，所以「加到主屏」那条路也还没实测过 —— **别据此把那段 padding 当死代码删掉**：有 manifest 之后、以及有 cutout 的 Android 上，它就是唯一在挡这条内容的东西
  - **已知缺口**：非 `(main)` 壳的路由（login / onboarding / legal / admin）没有安全区归属，哪天 insets 真的非 0，它们的第一行与最后一行会贴到刘海和 Home indicator 上

## 量不到的（只有真机能给）

1. ~~**地址栏收放的真实行为**~~ → **09-30 已量到**，见上一节。原先我用「把视口从 812 改成 700」模拟过，**那个模拟是错的**：它把 `100vh` 也一起改了，而 iOS 上 `100vh` 恰恰不变。那次错误模拟的截图已删，不留误导
2. ~~**安全区**（刘海 / 灵动岛 / Home indicator）~~ → **09-30 量完**：`fit=auto` 与 `fit=cover` 四边全 0（cover 在 Safari 浏览器模式下不生效，见上一节）。`standalone`（加到主屏）那份没有实现路径 —— 项目没有 manifest / `apple-mobile-web-app-capable`
3. **全屏**：移动端控制条上按 `aria-label` 找不到全屏按钮；原生全屏一旦接管，字幕与点词是否还在，只能真机看（这条同时决定 #25）

## 截图

| 文件 | 是什么 |
|---|---|
| `iphone-1-first-screen.png` | 首屏（375×812 @2x，已关掉引导浮层） |
| `iphone-2-scrolled-mini.png` | 滚过视频后的迷你播放器状态 |
| `iphone-3-word-card.png` | 点词后的词卡 |
| `probe-safari-auto.jpg` / `probe-quark-auto.jpg` | 真机量具页，`fit=auto`（Safari / 夸克） |
| `probe-safari-cover.jpg` / `probe-quark-cover.jpg` | 真机量具页，`fit=cover`（09-30 重跑确认：读数与 `auto` 逐行相同，insets 全 0 —— cover 在 Safari 浏览器模式下不生效） |

量具页本体存为 `dev-probe.html`，**不在 `frontend/public/` 里**（一次性量具，不随生产构建发布）。要重跑：把它拷回 `frontend/public/`，手机开 `http://<局域网 IP>:3000/dev-probe.html?fit=cover`，点一次 A、收起/展开地址栏再点一次 B，然后截图或复制报告文本。dev 站要从手机访问，`next.config.js` 的 `allowedDevOrigins` 得放行你的网段（默认 `192.168.*.*`）。

## 本地 dev 数据的改动（可还原）

那个 CI 种子视频原本只有 4 条字幕（16 秒），复现不出线上文稿的长度与滚动，所以用 **190 条合成中英文**替换了它的字幕，`videos.duration` 16 → 612，截图因此带的是合成字幕。这是本地 dev 库、没有动任何代码。要还原说一声。
