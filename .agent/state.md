# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `knowledge/decisions-index.md`, `knowledge/CHANGELOG.md` or `knowledge/archive/`. Nothing in the
> knowledge layer is size-capped: sizes are reported (`--size-report`) and never gated (DEC-067).

Last Updated: 2026-10-12

## Current Focus

- **前端视觉统一：方案与 DEC 已落盘，P1–P6 待执行（10-12，DEC-075）** —— 起因是用户启动本地
  `master` 后看版式判「东一块西一块」。诊断是**四处尺度各自为政**：内容宽度四级（2400 / 1320 /
  880 / 768，而 `TopBar` 只在 2400 那一级与内容对齐）、页头 6 套（15/18/24/26/28/34px）、圆角 token
  档位顺序是坏的（`md 10 < 默认 12`）且 9 个圆角类在 354 处混用、品牌橙有 4 个名字指向同一个值、
  字号 19 档、104 处原始调色板、`ui/Card` 被绕过（`bg-surface-card` 105 处）、`ui/Eyebrow` 与
  `ui/Grid` 零引用。**用户拍板 A：全站单容器 1320**（依据：线上本就是 1320、四级宽度本身是症状、
  单容器让顶栏对齐成为构造结果）。方案 `knowledge/plans/前端视觉统一-2026-10.md` 拆 P1–P6 六片，
  **分会话串行执行**（片间同改 `globals.css` 与同一批 `page.tsx`，不得并行）；P6 是新加的
  `check-design-system.mjs` 门禁 —— ADR-0005 那次统一没带检查所以八个月后复发。**代价照账接受**：
  S2 的 2400 与 S6 的 8 列归零，2560 屏两侧各留 ~620px。**待办**：开 P1 的会话。
- **移动端设计优化：已实施、待真机复看与真媒体 e2e（10-11，DEC-073/074）** —— 起因是用户两张真机截图
  （线上 `seeword.top`，`/watch/[id]`）。六条定位：当前句带只有英文（中文被 WebKit 的 flex + `max-h` 折叠挤出
  可视区）、贴顶画框压住文稿半截字、文稿是卡内第二层滚动、壳顶栏级别药丸仍是"压画面"的黑色半透明样式（~26px 高）、
  考试词底色过密（含已掌握词）、真题交卷栏仍 `fixed bottom-0`。**本轮落地**：① 移动端设计基线写进
  `globals.css`（英文 17 / 译文 14 / 次要正文 14 / 标签元信息 12 / 角标 11；行高 1.5/1.5/1.3）；② 当前句带改三行
  （英文 ≤2 行 + 中文恒 1 行 + 24px 元信息行：计数 + 长句展开开关 44×24），字号与行高只由行内 style 给
  （`.now-sub-en` 只剩 weight/color）；③ 高亮四档（learning/reviewing 实底 → 未掌握命中 `bg-*-50` 浅底+虚线 →
  已掌握只留虚线 → 其余无），watch 页多拉一次 `/vocabulary/words?mastery=mastered`；④ 移动端文稿与真题文章框改
  页级滚动，跟随改滚 `main`（画框贴顶才跟、手动滚即暂停、显式句导航恢复），贴顶画框补 1px 下边线；
  ⑤ 顶栏药丸改浅色描边（热区 44×44）；⑥ 交卷栏 `fixed` → `sticky`。**验证**：tsc 0 / eslint 0 error /
  prettier 全过 / vitest 110 全过 / `next build --webpack` 成功 / `check_knowledge.py` rc=0（默认 Turbopack
  构建在本沙箱因无法派生 node 子进程失败，属环境限制）。**还欠**：(a) 真机复看 5 条（中文恒在 / 药丸好按 /
  文稿单层滚动 / 贴顶不切字 / 长句展开可读）；(b) 在放了真 mp4 的机器上跑一次 `mobile-transcript-scroll.spec.ts`
  与 `mobile-current-sentence-card.spec.ts`（本地与 CI 的媒体都是 7 字节占位，会整条 skip）；(c) `audit-touch-targets.mjs`
  的 rev7 基线还没重出。方案与逐文件改动：`knowledge/plans/移动端设计优化-2026-10.md`。
- **生产部署已完成（10-04）** —— 本地 `master` 领先 `origin/master` 的 8 个提交已 push（CI 在跑），并按
  RUNBOOK §1.1「异地构建 + 传镜像」部署到 `47.122.109.52`（DNS 指向确认、`.env` 的 `ENV=production`、
  compose/nginx/promtail 三份配置哈希与仓库逐字节一致，故未同步配置）。**线上现跑镜像**：
  `speaking-backend/celery/celery-beat` = `0831fc629212`、`speaking-frontend` = `d1cad0a46011`；
  回滚标签 `speaking-*:pre-deploy` = 上一版 `c7b1af6595cf` / `45c85b6f92af`。**部署前四道门**：
  backend pytest 995 passed / 12 skipped、ruff 干净、mypy 51 对 = 基线 51（零新增）、frontend
  format+tsc+vitest(109)+lint 全绿、`check_knowledge.py` rc=0。**线上核验**：容器全部 Up/healthy、
  alembic `k6l7m8n9o0p1`(head)、celery `ping`→pong、`/health` 200、`/login` 200、前端 `BUILD_ID`
  在容器内为 `o3Mzw7N37_6fWntBTLlrp`（新）而 `/_next/static/chunks/*` 走的是新构建。`/root/images.tar`
  已删。**独立验证**：另一 agent 在镜像里对上一轮「零引用死代码删除」触及的 13 个后端文件做 sha256 与本地
  HEAD 逐字节比对（13/13 相同）、并在新前端镜像里找到 16 个本轮移动端改动新增的 test-id（旧镜像 0 个）、
  线上返回的 chunk 字节与新镜像内文件 sha256 相同（旧构建独有的 chunk 现在 404）。
- **CI 红 → 修好 → 前端二次部署（10-04）** —— 首次 push 后 CI 的 `e2e` job 红在
  `repro-stage1.spec.ts`：「收起字幕面板 → 词卡停右下」实测 `cardBox.x+width = 424 ≤ 640`。
  根因不是本轮新写的代码：`WordTooltipInline` 的 `panelCollapsed` **自加入起从没被传过**
  （call site 只传 word/gloss/onClose/onPronounce/onSave），所以恒为默认 false；这个缺陷
  一直存在但被掩盖 —— 该 spec 的守卫用了 `isVisible({ timeout })`（此 API 已废弃、选项被忽略），
  于是每次都在未水合时判定「无视频」而 skip，上一轮修好守卫后断言才第一次真跑。修法两处：
  ① 页面补 `panelCollapsed={panelCollapsed}` 一行；② spec 按 `mobile-player-shell.spec.ts`
  的口径用 `seeword_coach_done=true` 跳过首访教程浮层（新注册用户进观看页时
  `新手引导` 的 `fixed inset-0 z-[100]` dialog 会拦截折叠键 click，实测 60s 超时 —— 这是
  本地绿/红翻转的原因，与版式无关）。**本地判据**：改前 1 failed（与 CI 同一断言）→ 改后
  连跑 4 次 3 passed。**已二次部署**：只重建并替换 frontend（`75818b6c994f`，BUILD_ID
  `GX5r9orOcBlFkqDyQiSSz`），backend/celery/celery-beat 未动；`speaking-frontend:pre-deploy`
  现为 `d1cad0a46011`（**注意**：那个中间版本从未上过生产，真正回退一档等于 09-28 的
  `45c85b6f92af`）。
- **认知系统 v2：AOCI 为核心（10-03，DEC-072）** —— 规则文档与知识系统按「三层 + 一条缝 + 一个收尾动作」重写：**L0 认知层** = AOCI（对象事实的唯一权威：某个文件/表是什么、与谁有关系、契约、改它的非显然约束）、**L1 热层** = `AGENTS.md` + `CONTEXT.md` + `.agent/`（规则与会话契约）、**L2 冷仓** = `knowledge/`（为什么、历史、操作程序）。缝判据落在 `.agent/README.md`：**能写成「恰好一个受管理对象」的属性 → AOCI，否则 → prose**；prose 只准指认对象，不准复述其契约。落地清单：`AGENTS.md` 改为「开场三件事 + 按问题类型找权威」并把 AOCI 收尾写进 MUST；`.agent/invariants.md` 的 INV-019~025 压回「规则 + 为什么 + 强制方式」（叙述与实测指向 DEC-069/070）；`/knowledge-maintain`、`/knowledge-verify`、`/context-bootstrap` 改为 AOCI 优先；`check_knowledge.py` 新增第九项 `cognition` 门（结构与接线）；`layout.json` 新增 `cognition` 层并登记 `.aoci`；DEC-072 记录决定与备选方案。**收尾已完成（10-11）**：drift 已根治，见 Next Steps #10 与 Known Issues 的 AOCI 收尾条目。
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
10. **AOCI 收尾已完成（10-11）**：升级 rc20 后，drift 通过四批 `aoci_maintain` → 真读源码 → `aoci_update_entry` 整批提交根治（27+25+28+3 = 83 条，全部 `status=applied`）；`aoci verify` / `aoci check` 均 `governance_aligned=true`（`ok=true`、`structure_valid=true`），guide `complete=true / next_action=none`。**遗留的结构性缺口（未阻塞对齐）**：① 托管范围不含 `backend/tests/**` 与 `frontend/e2e/*.spec.ts`（25 条 INV 的强制目标在 AOCI 里不可见）；② 数据库认知为空（`database_cognition.state=absent`，而 Postgres 是本系统的核心存储）；③ `aoci check` 的 `e_scale` 有 7 条标签末位与文件行数分档不符的软性 mismatch（不进 findings、不影响对齐，下次动这些文件时顺手改标签）；④ `scripts/prod_ssh.py`、`scripts/prod_upload_parallel.py`、`scripts/build_prod_images.ps1` 仍是未跟踪文件（跟踪后会成为新受管理对象，需走正常收尾）。
11. **移动端设计优化的三个收尾动作（DEC-073/074）**：① 放真 mp4 后跑 `mobile-transcript-scroll.spec.ts` 与
    `mobile-current-sentence-card.spec.ts`（本地与 CI 的 `backend/media/*.mp4` 都是 7 字节占位，会整条 skip），
    跑法见 Known Issues「本地要跑『播放中』类 e2e」；② 真机复看 5 条并把读数按 `device-acceptance.md` 的格式落
    `docs/design/mobile/destination/`；③ 重出 `audit-touch-targets.mjs` 的 rev7 基线（口径已改，rev6 读数不可比）。
12. **规则层重构 B 待执行（10-12，DEC-076 / ADR-0021）** —— 决议是「保留 AOCI 的 742 条对象语义，
   换掉围绕它的仪式与层次」：会话开场从「每会话全量读」降为按需检索、规则就近分层
   （新建 `backend/AGENTS.md`）、`ci.yml` 三 job 各加 `paths`、6 个技能补停止信号、
   新增复盘回填清单。执行序列：`knowledge/plans/规则层重构-B-落地序列-2026-10.md`（R0–R5）。
   **本轮只落决策，未动 `AGENTS.md`**：R1/R2/R3 都改这份宪法级文件且必须串行，改前须保留
   `aoci:begin`/`aoci:end` 区块原样并做一次 AOCI 收尾；R2/R5 的验证需要能跑 `check_knowledge.py`
   的环境（本机沙箱无可用 Python 解释器）。**对标结论**：kimi-code 的轻门禁靠 1003 个测试文件加
   21 个契约文件接住「对象事实」，本仓没有替代物，故不撤认知层。

## Known Issues

- **AOCI 两个入口的结论已一致（10-12 复核，此前的「相反结论」不再复现）** —— 早前记录过的
  `aoci check`（CLI）与 `aoci_maintain`（MCP）互斥结论已消失：10-12 收尾后 CLI
  `aoci verify` 报 `result=aligned` / `next_required_action=none` / `code_drift` 全空，
  `aoci check --json` 报 `ok=true` / `governance_aligned=true` / `exit_code=0` / 非 `code_skipped`
  findings 为 0，`aoci index agent guide --agent codex` 报 `complete=true` / `next_action=none`。
  **教训保留**：三者不一致时以 `aoci check` 为准并记录，`guide.complete=false` 与
  `maintain.aligned=true` 都不能覆盖它；不得为对齐手改 `.aoci` 白名单、合成 candidate 或用
  `scan --force` 洗白。另两条仍在：`update_entry` 的 S 字段按 UTF-8 字节/3 计 token（C1-4≤40、
  C5-7≤80、C8≤140、C9≤200），超额要重写语义而不是机械截断；`e_scale` 有 7 条分档软性不符
  （不进 findings，见 Next Steps #10）。复跑命令：`aoci verify --json`、`aoci check --json`、
  `aoci index agent guide --agent codex --json`。
- **AOCI 认知层曾在 10-11 全量对齐（10-03 起的漂移根治；现状以上一条为准）**：rc20 之后 `aoci_maintain` 恢复签发候选，四批
  27+25+28+3 = 83 条条目由模型真读源码/diff 后经 `aoci_update_entry` 整批提交（全部 `applied`，未用
  `scan --force`、未手工改卷）；终态 `aoci verify` 与 `aoci check` 均 `governance_aligned=true`、
  guide `complete=true / next_action=none`。**历史记录留档**：10-03~10-11 期间曾因正式卷被手工裁剪 61 条
  叠加 rc17 的 `baseline_scope_refresh` 不支持本仓 profile 而长期 `blocked`；若同类漂移复发，路径仍是
  maintain → 真读 → 整批 update_entry，不是洗白。剩余软性读数：`e_scale` 7 条标签分档不符（不进 findings），
  `backend/tests/**` 与 `frontend/e2e/*.spec.ts` 不在托管范围、数据库认知 absent —— 见 Next Steps #10。
- **`.dockerignore` 的嵌套文件漏过（10-04 部署时由独立验证发现，非本次提交引入）**：`backend/.dockerignore`
  里 `__pycache__`、`*.log` 等模式**只匹配顶层**（Docker 的 ignore 模式不跨 `/`），所以 `app/**/__pycache__/*.pyc`
  与嵌套目录下的 `*.log` 照样进镜像。本次新镜像里因此带着 `/app/.dev-logs/probe-uvicorn.log`（353 KB）与
  `uvicorn-mobile-verify.log`（92 KB），其中含**已签发的媒体访问 JWT + 用户 UUID**（本次抽样解码的
  `exp` 是 2026-09-30，已过期，故不是活跃凭据泄露；旧镜像 09-28 就带后者）。另外 `docs/`、`scripts/`、
  `transcripts/`、`reprocess_export/`、`.agent/`、`.coverage`、`.mypy_cache` 等也一并进镜像（体积问题）。
  修法：把这些模式改成 `**/` 前缀（或去掉不需要的目录），**改完必须重建 backend 镜像并重新部署**才生效。
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
- **DEC-073/074 的 e2e 还没在真有媒体的机器上跑过（10-11）**：新写的 `mobile-transcript-scroll.spec.ts` 与改过的
  `mobile-current-sentence-card.spec.ts` 都需要「真能播」的媒体 —— 本地与 CI 的 `backend/media/*.mp4` 都是 7 字节
  占位，断言会**整条 skip**（只报 skip、不报红），所以「新断言绿」目前只是写好了、没有机器证据。
  `audit-touch-targets.mjs` 的 `SCRIPT_REVISION` 已升到 7（播放页可点目标集合变了），**rev6 的基线 JSON 不可再当对照**。
- **CI e2e 只跑 chromium，移动形态回归隐形（10-11，待决）**：全量 mobile-chrome（103 条）此前从未系统性跑过；10-11 首跑 + 收尾共揪出多条存量（`watch-return` 移动壳返回键恒红 8 天、`repro-stage1` 桌面断言按 393 必红、`watch.spec` / `video.spec` 6 条被登录墙静默 skip / 空转——10-02 复核留档），全部修复后 **102 passed / 1 skipped、0 failed（103 条，1.3m）全绿**。**待决**：是否给 `ci.yml` e2e 加 `--project=mobile-chrome`（chromium 内核、零新装浏览器、+~1.3m）——加则移动形态回归进 CI 门禁。
- **E2E coverage 不完整**：词汇复习 / 词表（`/practice`、`/vocabulary`）只有壳层与截图矩阵覆盖，没有功能级 e2e；桌面播放的深流程（全屏 / 字幕模式 / 倍速）也没测。播放页与考试流程已有 spec（`watch.spec.ts` / `watch-return.spec.ts`、7 份 `mobile-*.spec.ts`；`exam.spec.ts`）。`mobile-d1-d10.spec.ts` 的隐藏控件断言需真能播的视频，CI 会 skip
- **ICP compliance**：等个体营业执照才能全量部署（payment 保持禁用）
- **DEC-043 存量已是新算值**：勿再跑 `backfill_difficulty.py`
- **"本地绿"不等于绿**：提交前按 `knowledge/wiki/guides/release-checklist.md` 过四道本地门，且必须用 `.venv` 解释器
- **mypy 已钉版本**（09-27）：`requirements-dev.txt` 钉 `<2.4`；2.3.1 下 77 个实例收敛进基线 53 个唯一 `file:code` 对（实例数≠基线行数）；再升须重估基线
- **`get_user_local_date` 无 timezone 回退 UTC**（`knowledge/wiki/problems/local-date-basis-test-flake.md`）；改回退基准需 DEC
