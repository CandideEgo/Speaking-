# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `knowledge/decisions-index.md`, `knowledge/CHANGELOG.md` or `knowledge/archive/`. Nothing in the
> knowledge layer is size-capped: sizes are reported (`--size-report`) and never gated (DEC-067).

Last Updated: 2026-10-02

## Current Focus

- **进度真身（跨会话，先读这里）**：移动端播放页这条线「做到哪了」以 wayfinder 地图 [#20](https://github.com/CandideEgo/Speaking-/issues/20) 的 `Decisions so far` 与 `Not yet specified` 两节为准 —— 这张图同时被别的会话推进，本文件只记「现在在飞什么」与「哪里是坏的」，别拿它当进度台账
- **移动端播放页重设计（wayfinder #20）**：六个决定都已拍板（#21 范式对照 / #23 竖屏优先、看+点词为主 / #24 选**乙·字幕入画** / #26 选**乙·跟读底部抽屉** / #27 选**乙·词卡贴画面下沿** / #28 选**乙·控制条点出**），逐条记在 #20 的 Decisions。**下一步是地图 Destination 的三节**：壳层最小改动清单、触控目标与可达性基线、真机验收清单与 e2e 补测点（**第一节已于 10-01 落地**：≤1023px 画面出血 375×210.9、顶边贴壳顶、标题画进画面、页头与动作行下移，见 INV-024 —— 此前四件乙零件装在没改的桌面外壳里，参考机型首屏露出画面只有 107.9px，正是「和乙原型完全不一样」的那处）。**Destination 三节**：壳层最小改动清单（**10-01 落地**，见 INV-024）、**触控目标与可达性基线（10-01 成文 + 量具落地）**、**真机验收清单与 e2e 补测点（10-01 成文 + 量具页落地）**。**#30 滚动与迷你窗（10-01 落地）**：形态定为**画面贴顶常驻**（不缩/不飞/不消失，右下角 160×90 迷你窗取消），判据换成零高度哨兵、被粘的是画框自己（左列移动端 `display: contents`），规则与两处实测代价记入 INV-023（**10-02 提交**：本地五道门 + knowledge-check + 34 条 e2e 全绿；`touch-targets.md` §6 那条「返回键点不动」的真缺陷在同一批修掉）。**待你定**：#25 全屏与方向策略、#29 手势集 —— 两份决策稿已出（`docs/design/mobile/destination/`，各含打勾栏与真机探针）；**待你跑**：`destination/device-acceptance.md` 的真机清单（V1–V18 + 量具页 `probe-device-check.html`）。**待复议**：#27 的默认卡口「贴画面下沿（露出 65px 控制条）」被 #28 撤销常驻控制条拿掉了理由 —— **复议已决（10-01）**：两个卡口本就同一条线（#28 之后入画字幕贴画框下沿），**默认卡口 = 画面下沿、0px 断层**（词卡顶边 = 画框底边，只覆盖画框以下内容，压不到刚点的那句），旧的「挂进画面」选项撤销。**已落进 app（10-01）**：**乙四条全部落地** —— #28 的两条毕业物（入画字幕落画框最下沿、3px 细进度常驻 + 点画面浮起 + 3s 自收）记进 INV-021；#27 的词卡浮层 + #26 的跟读底部抽屉记进 INV-022，读数与代价在 `knowledge/CHANGELOG.md` 的 Unreleased/Changed，回归在 `frontend/e2e/mobile-inline-subtitle.spec.ts`（实测 414 档可见画面 129.8px ≈ 决议里写的 129px；浮起时盖住字幕 82.1px —— app 现有控制条是 100px，不是原型那版 65px）与新增的 `frontend/e2e/mobile-wordcard-drawer.spec.ts`（词卡/抽屉几何、展开前后播放器逐像素不变、下拉 >64px 关闭、44px 动作行、假麦克风真跑到回放态）。
- **移动端视口收尾（09-30，wayfinder #22）**：底栏从 `fixed bottom-0` 改成壳 `h-dvh` 的常规流收尾行、安全区收归壳独占、全仓 `vh → dvh`，回归在 `frontend/e2e/viewport-height.spec.ts`（INV-019/020）。真机读数已齐：Safari 地址栏收放差 40px（`100vh` 恒 790 / 可视区 750↔790）、夸克不受影响、`cover` 在 Safari 浏览器模式下不生效（insets 恒 0，所以壳的 `env()` padding 在那里是 no-op，只在 standalone / 有 cutout 的 Android 上生效（standalone 那份未实测：项目无 manifest / `apple-mobile-web-app-capable`，别当死代码删）。**真机复测通过（09-30）**：改动落地后用户在真机上确认「地址栏展开时底栏贴住可视区底边」，不再被地址栏压住。**已知缺口**：非 shell 路由（login / onboarding / legal / admin）没有安全区归属，等哪天 insets 真的非 0 才会暴露
- **附录 B 全仓扫描收尾（09-28，DEC-059/060/061）**：235 个文件 1308 条 finding；critical/high 153 条已逐条核实（53 成立 / 75 降级 / 24 证伪），128 项修复落地
- **知识层分层重构（09-29，DEC-066/067）**：冷仓收敛为一个目录 `knowledge/`（99 个文件搬动、521 处路径引用重写），热层只余 `AGENTS.md` / `CONTEXT.md` / `.agent/` 的 README+state+invariants+owners；`knowledge/INDEX.md` 双向检查上线；字节上限与目标全删，改为只报不判的 `--size-report`；检查器改配置驱动（`scripts/check-knowledge/paths.json`，配置里的路径不存在即失败）。仍未机器化：热层行形状（S2）、stale 命中承重模块升级为失败（S6）
- **内测上线收尾**：proxy 代理播放实现（需求 §5.4 优先级 3）、海报视觉稿、内测反馈收集渠道

## Next Steps

1. **移动端 Destination §3 的 e2e 补测点：11 条已写（10-02）** —— `viewport-height` +2、`mobile-inline-subtitle` +2、`mobile-player-shell` +2、`mobile-wordcard-drawer` +6，四个文件 **26 条全绿**；逐条的落地修正（含「375×600 不触发落档」「抽屉那半必须先开再滚」）记在 `docs/design/mobile/destination/device-acceptance.md` §7「落地结果」。仍排队的：#12 横屏版式断言等 #25、#13 控制条 44px 口径等 §2 拍板（§2 已成文）
2. **新发现（10-02，交 #25 拍）**：词卡的 `min(画框下沿, 底栏顶 − 240)` 落档支只在**视口高 < ~560px** 时激活（375×600 实测不激活：555−240=315 > 画框底 274.9），而这一档与 INV-022「绝不压进画面」冲突 —— 375×480 卡片抬进画面 79.9px、整句入画字幕被盖。**但不能直接改成 `max`**：横屏 667×375 实测画框 64..439.2 比屏幕还高、底栏顶 330，压回画框下沿 = 卡片高 0。横屏要不要走移动版式正是 #25 的题 —— 决议前 `⑥b` 只锁当前行为并写明「按 INV-022 改会红，那是决议」
3. **§2 触控基线自认过时**：`docs/design/mobile/destination/touch-targets.md` 的快照声明点名「#30 落地后播放页那几行要重跑」—— 量具 `frontend/scripts/audit-touch-targets.mjs`（`--emit-md` 生成表、原始读数 3MB JSON 已入库）可直接复跑；顺带定 §6 那条 **AA 真缺陷**（控制条进度条 `input[type=range]` 2.5.8 fail）修不修
4. **审计残留：medium/low 未逐条核实**（674 + 481，连同降级/证伪项共约 1100 条原始 finding 未验证）——引用前先对代码求证，筛查问法见 `knowledge/wiki/problems/audit-verification-failure-modes.md`
5. **本地 dev uvicorn（:8000）未带 `--reload`**：仍跑旧代码，重启后才含本轮 `/videos/search`、WebSocket 认证、通知 `type` 过滤
6. **Catalog Phase 2/3（DEC-036 / ADR-0017）**：admin「内容目录」前端页；部署迁移 + 导入 772 条 + 端到端验证一条 promote；重抓脚本收进 `backend/scripts/`
7. 视频存储收尾：Docker cache prune 可随时做；**删源站 `_raw` 母带被阻塞**——未配 OSS，raw 是唯一副本，删=不可逆丢失
8. 集成测试 / e2e 覆盖新页面（/weekly-report、收藏、CoachMark、ShareCard、drill 选择题循环、集合详情两栏）
9. Recommendation 深度个性化 P2（ADR-0011）；ICP 解封后项：payment、前端单测、e2e
10. **词汇训练线收尾（DEC-053/056/057）**：T1 回填 09-28 生产已跑，0 候选（存量词行连 `context_sentence` 都没有）；追票：续轮次序精确化（`wrong_in_round` 改计数）、ECDICT 干扰项兜底、「全部单词」词行级 unmark；SM-2 旧文案清扫（`layout.tsx:7`、`practice/page.tsx:296`、`AuthCard.tsx:7`）

## Known Issues

- **线上 `ENV` 无法从仓库自证**（DEC-051 残留）：`env` 默认 development，漏配即 dev 形态运行（支付签名旁路 + mock 支付路由 + 无 HSTS/CSP）
- **catalog 并发 promote 的窄窗**（DEC-049 残留）：共享同一 `source_url` 的两个条目并发 promote 仍各播一次
- **非有限浮点的读路径未设防**（H24 残留）：写入侧已拦，已落库的值 / 裸 dict 响应 / 无 schema 的 JSONB 仍可能把 `nan` 交给 `json.dumps(allow_nan=False)`
- **静态基线不是「已验无害」**：`backend/.mypy-baseline` 里碰 ORM 属性/列名/跨模块签名的条目是待验运行时风险（见 `knowledge/wiki/problems/audit-verification-failure-modes.md`）
- **iPhone 真机验证待办**：内联播放 / 滚动跟随（#30 常驻形态）/ 字幕同步 / 跟读录音（局域网 http 非安全上下文，量具页量不了，两条路写在 `docs/design/mobile/destination/device-acceptance.md` §2）—— 清单与量具页已就绪，等一次真机轮次
- **滚动跟随已按 #30 定稿（10-01）**：形态 = 画面**贴顶常驻**（旧判据「画框跑出视口顶部 `bottom ≤ 0`」对应的是已被取消的右下角迷你窗那一态）。现在是零高度哨兵越过滚动容器顶边 → 画框自己 `sticky top-0`；**不能量被粘住的元素自己**（会自激振荡），**sticky 的活动范围是包含块**（挂在 490px 的左列上会在滚动上限前 ~72px 被推走）—— 两条代价与成对 e2e 都记在 INV-023
- **横屏没有决议（#25）**：667×375 实测画框 64..439.2 比屏幕还高（16:9 全宽 = 375），底栏顶 330 —— 画面本身就超出可视区；812×375 更夹在 768–1023 那个断点里：`isMobile`（≤1023）为真、`md:hidden` 的底栏却已隐藏（V18 点名的缺口）。词卡落档支与 INV-022 的冲突（Next Steps 2）也归这一题
- **本地要跑「播放中」类 e2e，`backend/media/<id>.mp4` 得是真文件**：CI seed 只写占位 SQL 行 + 假 URL（`/media/<id>.mp4` 404），`mobile-d1-d10.spec.ts` 与 `mobile-inline-subtitle.spec.ts` 会整条 skip。本地补法是往 `backend/media/` 放一个同名真 mp4（该目录已 gitignore）
- **本地 e2e 容易被限流打脸**：`/auth/sms/register` 是 3/minute（按 IP），一个 spec 文件注册几个用户就 429，看到 `API registration failed: 429` 先清 `LIMITS:LIMITER/127.0.0.1//api/v1/auth/sms/{register,send-code}*` 再跑
- **本地 dev SMS 发送 502**：待 `.venv`/镜像重装 Dypnsapi SDK 后复测；无凭据环境回退 dev-fake 码
- **E2E coverage 不完整**：播放 / 词汇复习 / 考试流程缺 e2e；`mobile-d1-d10.spec.ts` 的隐藏控件断言需真能播的视频，CI 会 skip
- **ICP compliance**：等个体营业执照才能全量部署（payment 保持禁用）
- **DEC-043 存量已是新算值**：勿再跑 `backfill_difficulty.py`
- **"本地绿"不等于绿**：提交前按 `knowledge/wiki/guides/release-checklist.md` 过四道本地门，且必须用 `.venv` 解释器
- **mypy 已钉版本**（09-27）：`requirements-dev.txt` 钉 `<2.4`；2.3.1 下 77 个实例收敛进基线 53 个唯一 `file:code` 对（实例数≠基线行数）；再升须重估基线
- **`get_user_local_date` 无 timezone 回退 UTC**（`knowledge/wiki/problems/local-date-basis-test-flake.md`）；改回退基准需 DEC
