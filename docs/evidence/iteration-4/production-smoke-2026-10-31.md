# 迭代 4 · 生产 smoke 实跑与负控（A11 第二条出口条件）

日期：2026-10-31。分支：`redesign`。口径与任务定义的家仍是
[`docs/development-plan-2026-10-29.md`](../../development-plan-2026-10-29.md) 与
[`docs/comprehensive-audit-2026-10-29/execution-plan.md`](../../comprehensive-audit-2026-10-29/execution-plan.md)。
本文件只记录这一轮**真实跑过什么、结果是什么、什么没跑**。

> 迭代 4 原先记的「未执行」有两条：生产 smoke 的实跑，和「故意破坏」负控。两条现在都做了。
> 结论先说：**负控四条全部按预期变红，恢复配置后绿**；过程中抓到一个真实产品缺陷（生产包
> 客户端崩溃，TDZ），已修；另有两处 smoke 夹具/断言本身过期，也已修。

## 环境与方法

| 项 | 值 |
| --- | --- |
| 宿主机 | Windows 11，物理内存 7.27 GB（Docker Desktop WSL 后端分配 3.5 GB / 8 CPU） |
| Docker | 29.9.2，Compose v5.6.1（Docker Desktop） |
| 隔离栈 | `docker-compose.smoke.yml`，项目名 `seeword-production-smoke`，nginx 仅监听 `127.0.0.1:18443`，自签 localhost 证书，PG 用 tmpfs，`ENV=testing` |
| 浏览器 | Playwright Chromium（`npx playwright install chromium`），`playwright.production.config.ts` |
| 未使用 | 生产环境的任何凭据、卷或 `.env`；未向线上写入任何测试数据 |

`production-smoke.ps1` 是 Windows PowerShell 脚本（依赖 `docker.exe` / `openssl.exe`），本轮改为
按它同样的步骤直接在 bash 里执行，命令与幂等性一一对应：

```bash
docker compose -f docker-compose.smoke.yml -f .production-smoke/refdata.yml up -d --wait --wait-timeout 300 nginx
docker compose ... exec -T backend python scripts/seed_e2e.py
docker compose ... exec -T --user root backend chown 1000:1000 /app/media
docker compose ... exec -T backend python /smoke/seed.py
docker compose ... exec -T nginx nginx -t && nginx -s reload
cd frontend && PRODUCTION_SMOKE_URL=https://localhost:18443 npx playwright test -c playwright.production.config.ts
```

## 实跑结果

两个 spec 文件**分两次执行**（原因见文末「限流」），各自全绿：

| 文件 | 用例 | 结果 |
| --- | --- | --- |
| `e2e/production/readiness.spec.ts` | 生产资源、公开元数据与 HTTPS 策略 | ✅ 321 ms / 87 ms（多次） |
| | 生产视频拖动、录音回放与通知连接 | ✅ |
| | 用户页面三档视口与亮暗主题布局（15 路由 × 3 宽度 × 明暗） | ✅ 5.8 min |
| `e2e/production/recovery.spec.ts` | 学习记录断网可重试 / 会员账户读取失败 / 价格限流 / 帮助页 / 购买信息 | ✅ 5 passed / 34.5 s |

## 实跑抓到的三处问题（都已修）

### 1. 生产包客户端崩溃：模块级 `let` 的 TDZ（产品缺陷）

首轮实跑时观看页与首页都落到错误边界。从 Playwright trace 里取到的浏览器控制台是：

```
pageError: ReferenceError: Cannot access 'b' before initialization
  at _next/static/chunks/0e7ns7njy06ds.js
```

反查该 chunk 命中 `lib/analytics.ts`：模块级副作用块（注册 `visibilitychange` / `pagehide` 并调用
`startVitalsObservers()`）写在 `watchState` / `vitalsState` / `vitalsObserverStarted` 这些 `let`
声明**之前**，模块求值时命中 TDZ。单测与 `tsc` 都看不见，只有压缩后的生产包 + 真浏览器能暴露。

修法：把该副作用块整段移到文件末尾（并留下注释说明为什么不能上移）。改后观看页、首页、抽检的
三条路由都能正常渲染，`生产视频拖动、录音回放与通知连接` 由红转绿。

### 2. `docker-compose.smoke.yml` 缺 `SMS_DEV_FAKE_ENABLED`

e2e helper 用固定码 `1234` 走 `sms/send-code → sms/login` 注册账号。假码是**显式开关**（见
`backend/app/services/sms_service.py::_dev_fake_enabled`），CI 的每个 job 都单独设了它，但
compose 文件漏了——于是任何一次全新 smoke 跑都会在 `beforeAll` 里以
`400 验证码错误或已失效` 挂掉，且**看起来像认证坏了**。已在 smoke compose 的 backend 环境里补上
（仅隔离环境，`ENV=testing`）。

### 3. 改版后两条断言过期

| 断言 | 旧 | 现 |
| --- | --- | --- |
| 首页存在发现入口 | `link "发现视频"` | 导航在 375 宽收进折叠菜单，改断言发现流本体：`region "视频列表"` |
| 学习记录失败可重试 | 区域 `继续观看`、文案 `学习记录暂时未能加载`、成功后给 `开始学习` | 改版后由 `DiscoverContinue` 承担：接口 `/learning/continue`、文案 `观看记录暂时未能加载`、失败给错误+重试、空列表静默不渲染（`开始学习` 入口已随旧首页下线） |

两条都保留了原断言的意图（首页不是空壳；失败不能被伪装成空状态），没有放宽任何检查器。

## 负控：改坏 → 红 → 恢复 → 绿

四条负控全部只改 nginx 配置（`nginx.ssl.conf` 的等价副本挂在同一路径），不碰应用代码。改法见下表，
基线状态下同一 spec 是绿的（321 ms）。

| # | 故意破坏 | 期望红在哪 | 实测 |
| --- | --- | --- | --- |
| C1 | 删掉 `add_header Content-Security-Policy`（server 与 /media/ 两处） | `expect(csp).toContain("media-src 'self' blob:")` | ✅ 红 @22，`Received: undefined` |
| C2 | 删掉 `add_header Permissions-Policy` | `expect(permissions-policy).toContain("microphone=(self)")` | ✅ 红 @20 |
| C3 | `/media/` 内 `proxy_set_header Range "bytes=0-511"`（见下方口径修正） | `expect(content-range).toMatch(/^bytes 0-1023\//)` | ✅ 红 @48，`Received: "bytes 0-511/638558"` |
| C4 | server 级 `add_header X-Powered-By "Next.js"` | `expect(x-powered-by).toBeUndefined()` | ✅ 红 @19，`Received: "Next.js"` |
| — | 恢复原 `nginx.ssl.conf` | 同一 spec 应绿 | ✅ passed 321 ms；`csp=1 xpb=0 perms=1` |

**C3 的口径修正（本轮实测得到，写下来免得下次重踩）**：最初用的是
`proxy_set_header Range ""`（按 nginx 文档「空值即不转发该头」）。**不生效**——客户端 RFC Range 请求
仍然拿到 `206 + Content-Range: bytes 0-1023/638558`；不带头时才是 `200 + Content-Length: 638558`。
也就是说在这个 `proxy_pass` 场景里，空值并没有剥掉客户端的 `Range`。改用强制值的写法既能证明断言
有牙（服务端给出 0-511 而断言要求 0-1023 时立刻红），也顺带证明了该 location 的
`proxy_set_header` 确实生效。**「模拟 StaticFiles 吞 Range」这个更贴近历史 bug 的改法本轮没做成**，
如实记在下面。

## 未执行 / 边界

1. **两个 spec 连跑会被认证限流打断**：`nginx.ssl.conf` 的 `login` 区是 `5r/m burst=3`，两个文件各在
   `beforeAll` 注册一次（每次 `send-code` + `sms/login` 两条受限请求），连跑时第 5 条被拒，第二个文件
   整体 `did not run` 或 `503`。**分文件执行 + 间隔 ≥60 s** 稳定通过（本轮即如此）。
   要一条命令跑完，只能在 smoke 环境单独放宽 auth 限流——那会牺牲「与生产同构」，需负责人拍板，
   本轮没有改。
2. **`reference-data` 服务在本机跑不通**：容器内 `cp /reference/ecdict.db /data/ecdict.db` 报
   `cp: read error: Out of memory`（851 MB SQLite 走 virtiofs + 3.5 GB VM）。本轮用
   `docker cp` 把同样的字节灌进同一个命名卷，再用 `.production-smoke/refdata.yml` 把该服务替换成
   「校验文件存在」。**Linux/CI 上不需要这个 override**。
3. **冷启动超时**：首次跑 `用户页面三档视口与亮暗主题布局` 在 `/notifications` 上因默认 5 s 断言超时
   失败（页面 `isLoading` 时只渲染 spinner），复跑 5.8 min 全绿。本机慢启动所致，不是产品回归；
   没有为此放宽超时。
4. **未跑**：`PRODUCTION_REGRESSION=1` 的整批回归（观看页/移动端 14 个 spec）、
   `playwright.crossbrowser.config.ts` 的 Firefox/WebKit（本机未装这两款浏览器）。
5. **Windows 原脚本**：`production-smoke.ps1` 本轮没有原样执行（本机装 Docker Desktop 前无 docker），
   步骤是手工等价复现。下次在有 Docker Desktop 的机器上应原样跑一次，确认脚本本身也能过。

## 本轮改动清单（代码）

| 文件 | 改动 |
| --- | --- |
| `frontend/src/lib/analytics.ts` | 模块级副作用块移到文件末尾，修生产包 TDZ 崩溃 |
| `docker-compose.smoke.yml` | backend 环境补 `SMS_DEV_FAKE_ENABLED: "true"` |
| `frontend/e2e/production/readiness.spec.ts` | 首页断言改为发现流本体 |
| `frontend/e2e/production/recovery.spec.ts` | 学习记录重试用例改到 `DiscoverContinue` 的现状 |

`npm run check`（设计系统 9 条 + 会话写入 2 条 + tsc + ESLint + Prettier）与
`npx vitest run src/lib/webVitals.test.ts`（5 passed）在本轮改动后通过。
