# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `knowledge/decisions-index.md`, `knowledge/CHANGELOG.md` or `knowledge/archive/`. Nothing in the
> knowledge layer is size-capped: sizes are reported (`--size-report`) and never gated (DEC-067).

Last Updated: 2026-10-03

## Current Focus

- **认知系统 v2：AOCI 为核心（10-03，DEC-072）** —— 规则文档与知识系统按「三层 + 一条缝 + 一个收尾动作」重写：**L0 认知层** = AOCI（对象事实的唯一权威：某个文件/表是什么、与谁有关系、契约、改它的非显然约束）、**L1 热层** = `AGENTS.md` + `CONTEXT.md` + `.agent/`（规则与会话契约）、**L2 冷仓** = `knowledge/`（为什么、历史、操作程序）。缝判据落在 `.agent/README.md`：**能写成「恰好一个受管理对象」的属性 → AOCI，否则 → prose**；prose 只准指认对象，不准复述其契约。落地清单：`AGENTS.md` 改为「开场三件事 + 按问题类型找权威」并把 AOCI 收尾写进 MUST；`.agent/invariants.md` 的 INV-019~025 压回「规则 + 为什么 + 强制方式」（叙述与实测指向 DEC-069/070）；`/knowledge-maintain`、`/knowledge-verify`、`/context-bootstrap` 改为 AOCI 优先；`check_knowledge.py` 新增第九项 `cognition` 门（结构与接线）；`layout.json` 新增 `cognition` 层并登记 `.aoci`；DEC-072 记录决定与备选方案。**收尾**：在最终稳定状态调用了一次 `aoci_maintain`，机器给出 37 条待创作的签名批次（零写入），详见 Known Issues 与 Next Steps 第 10 条 —— 漂移已登记、未被静默，也**未**用手工或 `scan --force` 洗白。
- **移动端播放页：句导航 + R5「齐平字幕带」已落地、待真机复看（10-02，DEC-070）** —— 本轮四件事全落：① `devIndicators` **整关**（原计划的 `bottom-right` 实测把「跟读」那一格吃掉，底栏是铺满整宽的四个键、四角没有一个位置不压按钮，见 `next.config.js` 注释）；② 「下一句」过期闭包改「稳定引用 + ref 读最新值」（`onNextStable`，新增 INV-025）；③ R5 版式（当前句卡 ≤1023px 与画框**齐平 0 断层**、无外框无圆角；模式行 48px / 每段 44px 分段控件并成为文稿卡卡头、移动端不渲染折叠键；文稿当前项降级为淡底 + 橙左竖线 + ink；`panelCollapsed` 加 `!isMobile` 守卫）；④ 进度条总时长以**媒体真实时长**为准（`aria-valuemax` 实测 612 → 720）。**本地实测**：卡 `x=0 y=276.9 w=414`（= 画框下沿）、四键中心全部命中自己、模式行 48px + 三段各 44px、`npx tsc --noEmit` 0、`npm run lint` 0 error、新 spec `mobile-sentence-nav.spec.ts` 4 条绿（红→绿逐条验过：A「9 → 2」、C「nextjs-portal 压住 watch-prev」、D「612 ≠ 720」）。**还欠一次真机复看**（判据只能靠真机）：(a) 底栏左下角不再有黑「N」、四键都好按；(b) 0 断层的观感（嫌挤就改 6–8px，仍在合法窗口内，改完重看）；(c) 三段 44px 是否好按、切换后字幕带与文稿是否同步换语言。**本轮唯一与方案预期不符的一条**：§4 判据 6 写「首屏 ≥4 条文稿」，实测 **3 条**（判据本身只要 ≥3，判据 1–3 全绿）；差的是 R5 把模式行从 32px chip 行换成 48px 卡头（+16px），而四个锁定值（段 44 / 容器 46 / 行 48 / 底线）都已在最小值上，凑第 4 条要再省 20px ⇒ 只能动已定案的模式行。若你要 4 条，说一声即可（那是新决议）。**已提交（10-03）**。方案：`knowledge/plans/移动端播放页-句导航与R5版式-执行方案-2026-10.md`。
- **移动端播放页重构：已实施、待真机复看（10-02，DEC-069，issue [#31](https://github.com/CandideEgo/Speaking-/issues/31)）** —— `/watch/*`（≤1023px）现在整页跑在壳里：新件 `components/layout/WatchTopBar.tsx`（44px：返回 / 标题 / `channel · cefrWithExamHint` / `ExamLevelSelector` / ⋯）、`components/watch/WatchBottomBar.tsx`（进度条 `requestAnimationFrame` 直读 `videoRef` 不进 state + 上一句/播放/下一句/跟读，替换 5 Tab）、`components/watch/CurrentSentenceCard.tsx`（画面正下方的**唯一**一份当前句，移动与桌面同一张）、`components/watch/WatchMoreSheet.tsx`（语言/字号/倍速/来源版权/动作行/笔记）、`components/watch/WatchChromeProvider.tsx`（页面 ↔ 壳的模块级 store）；画面里零文字零覆盖物、`VideoControls` 收成桌面专属。三条验收判据（本地已过：`npx tsc --noEmit` 0、`npm run lint` 0 error，Playwright chromium 43 passed）：**画面内零文字 / 首屏不滚动可见完整底栏 + 当前句卡 + ≥3 条文稿（Chromium 414×896 实测 4 条）/ 进页面到播放 1 次点击**；桌面与其它路由零 diff 有守卫。**还欠一次真机轮次确认两件事**：(a) iPhone 414×896 上的真实首屏（Chromium 视口 896 ≠ 真机 Safari 可视 776，「4 条文稿」是模拟读数）；(b) 词卡盖住当前句卡在手里是否可接受（INV-022 记的新代价）。**已提交（10-03）**。方案与差异清单：`knowledge/plans/移动端播放页-壳层控制条-落地方案-2026-10.md`。
- **移动端视口收尾（09-30，wayfinder #22）**：底栏从 `fixed bottom-0` 改成壳 `h-dvh` 的常规流收尾行、安全区收归壳独占、全仓 `vh → dvh`，回归在 `frontend/e2e/viewport-height.spec.ts`（INV-019/020）。真机读数已齐：Safari 地址栏收放差 40px（`100vh` 恒 790 / 可视区 750↔790）、夸克不受影响、`cover` 在 Safari 浏览器模式下不生效（insets 恒 0，所以壳的 `env()` padding 在那里是 no-op，只在 standalone / 有 cutout 的 Android 上生效（standalone 那份未实测：项目无 manifest / `apple-mobile-web-app-capable`，别当死代码删）。**真机复测通过（09-30）**：改动落地后用户在真机上确认「地址栏展开时底栏贴住可视区底边」，不再被地址栏压住。**已知缺口**：非 shell 路由（login / onboarding / legal / admin）没有安全区归属，等哪天 insets 真的非 0 才会暴露
- **附录 B 全仓扫描收尾（09-28，DEC-059/060/061）**：235 个文件 1308 条 finding；critical/high 153 条已逐条核实（53 成立 / 75 降级 / 24 证伪），128 项修复落地
- **知识层分层重构（09-29，DEC-066/067）**：冷仓收敛为一个目录 `knowledge/`（99 个文件搬动、521 处路径引用重写），热层只余 `AGENTS.md` / `CONTEXT.md` / `.agent/` 的 README+state+invariants+owners；`knowledge/INDEX.md` 双向检查上线；字节上限与目标全删，改为只报不判的 `--size-report`；检查器改配置驱动（`scripts/check-knowledge/paths.json`，配置里的路径不存在即失败）。仍未机器化：热层行形状（S2）、stale 命中承重模块升级为失败（S6）
- **内测上线收尾**：proxy 代理播放实现（需求 §5.4 优先级 3）、海报视觉稿、内测反馈收集渠道

## Next Steps

1. **词卡落档支与 INV-022 的冲突：冻结（原归 #25）** —— 只在视口高 < ~560px 激活的那一档保持现状（375×480 会抬进画面 79.9px）；`⑥b` 只锁当前行为，**按 INV-022 改会红是有意为之**。要动它先开一张新票，别再挂在地图上。
2. **触控基线 §6 的 AA 真缺陷：挂起** —— 控制条进度条 `input[type=range]` 2.5.8 fail（`VideoControls` 收成桌面专属后只剩桌面这一份；移动端底栏的进度是 44px 热区的 `role="slider"`），属可达性整改、不在本轮优化范围；量具 `frontend/scripts/audit-touch-targets.mjs` 可随时复跑，`touch-targets.md` 的快照声明仍点名它过时。
3. **审计残留：medium/low 未逐条核实**（674 + 481，连同降级/证伪项共约 1100 条原始 finding 未验证）——引用前先对代码求证，筛查问法见 `knowledge/wiki/problems/audit-verification-failure-modes.md`
4. **本地 dev uvicorn（:8000）未带 `--reload`**：仍跑旧代码，重启后才含本轮 `/videos/search`、WebSocket 认证、通知 `type` 过滤
5. **Catalog Phase 2/3（DEC-036 / ADR-0017）**：admin「内容目录」前端页；部署迁移 + 导入 772 条 + 端到端验证一条 promote；重抓脚本收进 `backend/scripts/`
6. 视频存储收尾：Docker cache prune 可随时做；**删源站 `_raw` 母带被阻塞**——未配 OSS，raw 是唯一副本，删=不可逆丢失
7. 集成测试 / e2e 覆盖新页面（/weekly-report、收藏、CoachMark、ShareCard、drill 选择题循环、集合详情两栏）
8. Recommendation 深度个性化 P2（ADR-0011）；ICP 解封后项：payment、前端单测、e2e
9. **词汇训练线收尾（DEC-053/056/057）**：T1 回填 09-28 生产已跑，0 候选（存量词行连 `context_sentence` 都没有）；追票：续轮次序精确化（`wrong_in_round` 改计数）、ECDICT 干扰项兜底、「全部单词」词行级 unmark；SM-2 旧文案清扫（`layout.tsx:7`、`practice/page.tsx:296`、`AuthCard.tsx:7`）
10. **AOCI 收尾（机器已签发批次，未完成；恢复后第一件事）**：**先重新 `aoci_maintain` 取当前批次**（上一份被本次收尾后的编辑作废），再**逐条真读**受影响对象（其中 24 个代码文件本轮没有读过——不得凭印象写语义），创作完整 F/R/A/S 后用 `aoci_update_entry` **一次提交整批**（`max_entries=50` 容得下 37 条，不得截取、不得缩减 scope）；随后走受治理路径（`aoci baseline scope plan/preview/apply`）解决 `managed_scope_formal_volume_baseline_drift`，再 `scope acknowledge` 那 3 条 observe。**不要**用 `aoci scan --force`。另两处结构性缺口：托管范围不含 `backend/tests/**` 与 `frontend/e2e/*.spec.ts`（25 条 INV 的强制目标在 AOCI 里不可见），数据库认知为空（`database_cognition.state=absent`，而 Postgres 是本系统的核心存储）

## Known Issues

- **AOCI 收尾未完成：机器已签发创作批次，正式卷与 Baseline 漂移（10-03）**：在最终稳定状态调用了一次 `aoci_maintain`，返回 `status=stopped` / `result=blocked`，**零写入**（`semantic_generated=false`，write 集为空），并给出一份机器签名的创作批次：`batch_identity=575453c079610a89d7766e9a61aaa02d2f98745e0702ede65ee31977601bc4d2`、`total_targets=37`、`remaining=37`、`next_action=author_complete_current_machine_batch`。37 条 = 本轮改过的 9 份规则/技能/配置 + 4 份知识文档 + 上一轮瘦身提交改过的代码文件（`code_drift.stale` 在响应里截断到 20 条，总数 37）。同时 `scope` 操作被拒：`managed_scope_formal_volume_baseline_drift: aoci.code.txt` —— 正式卷在 Baseline 建立后被手工裁掉 61 条孤儿条目（508632 B → 473200 B），于是 `scope status` / `scope acknowledge` 失败，3 条 observe 待复核无法前移；机器给的 `next_commands` 是 `scope status --json` 与 `scope acknowledge --reviewed-by {agent} --json`。**可写路径只有一条**：`aoci_maintain` → 按返回批次用 `aoci_update_entry` 提交；`aoci_report`、`remove-entry` 与 CLI 的 `index update` / `score` / `agent plan` / `status --deep` 在本仓一律报 `volume_read_only`（rc17 的 CLI 维护面只服务旧布局）。**禁止**用 `aoci scan --force` 洗白：那会把手工裁剪与 37 条未创作的 stale 一起写进新 Baseline，`code_stale` 归零而条目仍描述已删除的代码。**批次已过期**：它绑定的是调用时的 preimage，而收尾之后又改过 4 个受管理对象（`.agent/state.md`、`knowledge/decisions.md`、`AGENTS.md`、`scripts/check-knowledge/README.md`），所以下一轮应先重新 `aoci_maintain` 取一份当前批次，不要直接提交这一份。当前 `aoci check`：`code_stale` 37 条、`governance_aligned=false`。
- **线上 `ENV` 无法从仓库自证**（DEC-051 残留）：`env` 默认 development，漏配即 dev 形态运行（支付签名旁路 + mock 支付路由 + 无 HSTS/CSP）
- **catalog 并发 promote 的窄窗**（DEC-049 残留）：共享同一 `source_url` 的两个条目并发 promote 仍各播一次
- **非有限浮点的读路径未设防**（H24 残留）：写入侧已拦，已落库的值 / 裸 dict 响应 / 无 schema 的 JSONB 仍可能把 `nan` 交给 `json.dumps(allow_nan=False)`
- **静态基线不是「已验无害」**：`backend/.mypy-baseline` 里碰 ORM 属性/列名/跨模块签名的条目是待验运行时风险（见 `knowledge/wiki/problems/audit-verification-failure-modes.md`）
- **iPhone 真机验证待办（本线唯一在飞项）**：内联播放 / 滚动跟随（#30 常驻形态）/ 字幕同步 / 跟读录音（局域网 http 非安全上下文，量具页量不了，两条路写在 `docs/design/mobile/destination/device-acceptance.md` §2）—— 清单与量具页已就绪，等一次真机轮次
- **滚动跟随的形态与两条陷阱（INV-023）**：画面**贴顶常驻**；**不能量被粘住的元素自己**（会在 sticky/static 之间自激振荡），**sticky 的活动范围是包含块**（挂在 490px 左列上会在滚动上限前 ~72px 被推走）。成对回归在 `mobile-pip-scroll.spec.ts` 与 `mobile-inline-subtitle.spec.ts`
- **横屏挂起（#25 已 defer，DEC-068）**：667×375 实测画框 64..439.2 比屏幕还高、底栏顶 330；812×375 的 768–1023 断点错位（`isMobile` 为真、`md:hidden` 的底栏却已隐藏）——**保持现状**。要治它先开票，不再由地图承载。
- **本地要跑「播放中」类 e2e，`backend/media/<id>.mp4` 得是真文件**：CI seed 只写占位 SQL 行 + 假 URL（`/media/<id>.mp4` 404），`mobile-*.spec.ts` 里需要真播放的用例（`mobile-d1-d10`、`mobile-inline-subtitle`、`mobile-current-sentence-card`、`mobile-watch-chrome` …）会整条 skip。本地补法是往 `backend/media/` 放一个同名真 mp4（该目录已 gitignore）
- **本地 e2e 容易被限流打脸**：`/auth/sms/register` 是 3/minute（按 IP），一个 spec 文件注册几个用户就 429，看到 `API registration failed: 429` 先清 `LIMITS:LIMITER/127.0.0.1//api/v1/auth/sms/{register,send-code}*` 再跑
- **本地 dev SMS 发送 502**：待 `.venv`/镜像重装 Dypnsapi SDK 后复测；无凭据环境回退 dev-fake 码
- **两份 e2e 在本地点不出读数（10-02 复核发现，**与本轮改动无关**，改的都不是本轮文件）**：① `repro-stage1.spec.ts` 三条全 skip —— 它的 `openFirstWatch` 里 `locator.isVisible({ timeout: 15000 })` **被 Playwright 忽略**（该选项在这套 API 上已废弃），于是 `goto(href)` 后未水合就立刻判 `false` ⇒ **这三条守卫在任何环境都不会真跑**（CI 同样），折叠键/词卡锚位那几条断言等于长期无人看；② `watch.spec.ts` 的 4 条视频用例不登录就 `goto("/")`，被登录墙 302 到 `/login`，首页当然没有 `a[href*="/watch/"]` ⇒ skip（`auth.spec.ts` 的登录用例全绿，说明登录流程本身没问题）。**结论**：方案 §4 判据 8 里「`repro-stage1` 仍点到折叠键」这条目前**没有有效机器证据**，本轮是由复核者的探针替代验证的（1280 下折叠键 36×36、中心命中自己、折叠后 tablist/rail 互换成立）。要修先开票——修法是给这两份 spec 补 token 登录 + 去掉那个失效的 `timeout` 选项。
- **E2E coverage 不完整**：词汇复习 / 词表（`/practice`、`/vocabulary`）只有壳层与截图矩阵覆盖，没有功能级 e2e；桌面播放的深流程（全屏 / 字幕模式 / 倍速）也没测。播放页与考试流程已有 spec（`watch.spec.ts` / `watch-return.spec.ts`、7 份 `mobile-*.spec.ts`；`exam.spec.ts`）。`mobile-d1-d10.spec.ts` 的隐藏控件断言需真能播的视频，CI 会 skip
- **ICP compliance**：等个体营业执照才能全量部署（payment 保持禁用）
- **DEC-043 存量已是新算值**：勿再跑 `backfill_difficulty.py`
- **"本地绿"不等于绿**：提交前按 `knowledge/wiki/guides/release-checklist.md` 过四道本地门，且必须用 `.venv` 解释器
- **mypy 已钉版本**（09-27）：`requirements-dev.txt` 钉 `<2.4`；2.3.1 下 77 个实例收敛进基线 53 个唯一 `file:code` 对（实例数≠基线行数）；再升须重估基线
- **`get_user_local_date` 无 timezone 回退 UTC**（`knowledge/wiki/problems/local-date-basis-test-flake.md`）；改回退基准需 DEC
