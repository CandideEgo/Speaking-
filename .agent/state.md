# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `knowledge/decisions-index.md`, `knowledge/CHANGELOG.md` or `knowledge/archive/`. Nothing in the
> knowledge layer is size-capped: sizes are reported (`--size-report`) and never gated (DEC-067).

Last Updated: 2026-09-30

## Current Focus

- **移动端视口收尾（09-30，wayfinder #22）**：底栏从 `fixed bottom-0` 改成壳 `h-dvh` 的常规流收尾行、安全区收归壳独占、全仓 `vh → dvh`，回归在 `frontend/e2e/viewport-height.spec.ts`（INV-019/020）。**待真机复测两件**：① 地址栏展开时底栏是否贴住可视区底边；② `fit=cover` 下 `env(safe-area-inset-bottom)` 在 Safari 上到底给不给 34 —— 量具页 cover 截图的读数 OCR 不可信，未确认；若为 0，底栏会落进 Home indicator 条
- **附录 B 全仓扫描收尾（09-28，DEC-059/060/061）**：235 个文件 1308 条 finding；critical/high 153 条已逐条核实（53 成立 / 75 降级 / 24 证伪），128 项修复落地
- **知识层分层重构（09-29，DEC-066/067）**：冷仓收敛为一个目录 `knowledge/`（99 个文件搬动、521 处路径引用重写），热层只余 `AGENTS.md` / `CONTEXT.md` / `.agent/` 的 README+state+invariants+owners；`knowledge/INDEX.md` 双向检查上线；字节上限与目标全删，改为只报不判的 `--size-report`；检查器改配置驱动（`scripts/check-knowledge/paths.json`，配置里的路径不存在即失败）。仍未机器化：热层行形状（S2）、stale 命中承重模块升级为失败（S6）
- **内测上线收尾**：proxy 代理播放实现（需求 §5.4 优先级 3）、海报视觉稿、内测反馈收集渠道

## Next Steps

1. **审计残留：medium/low 未逐条核实**（674 + 481，连同降级/证伪项共约 1100 条原始 finding 未验证）——引用前先对代码求证，筛查问法见 `knowledge/wiki/problems/audit-verification-failure-modes.md`
2. **本地 dev uvicorn（:8000）未带 `--reload`**：仍跑旧代码，重启后才含本轮 `/videos/search`、WebSocket 认证、通知 `type` 过滤
3. **Catalog Phase 2/3（DEC-036 / ADR-0017）**：admin「内容目录」前端页；部署迁移 + 导入 772 条 + 端到端验证一条 promote；重抓脚本收进 `backend/scripts/`
4. 视频存储收尾：Docker cache prune 可随时做；**删源站 `_raw` 母带被阻塞**——未配 OSS，raw 是唯一副本，删=不可逆丢失
5. 集成测试 / e2e 覆盖新页面（/weekly-report、收藏、CoachMark、ShareCard、drill 选择题循环、集合详情两栏）
6. Recommendation 深度个性化 P2（ADR-0011）；ICP 解封后项：payment、前端单测、e2e
7. **词汇训练线收尾（DEC-053/056/057）**：T1 回填 09-28 生产已跑，0 候选（存量词行连 `context_sentence` 都没有）；追票：续轮次序精确化（`wrong_in_round` 改计数）、ECDICT 干扰项兜底、「全部单词」词行级 unmark；SM-2 旧文案清扫（`layout.tsx:7`、`practice/page.tsx:296`、`AuthCard.tsx:7`）

## Known Issues

- **线上 `ENV` 无法从仓库自证**（DEC-051 残留）：`env` 默认 development，漏配即 dev 形态运行（支付签名旁路 + mock 支付路由 + 无 HSTS/CSP）
- **catalog 并发 promote 的窄窗**（DEC-049 残留）：共享同一 `source_url` 的两个条目并发 promote 仍各播一次
- **非有限浮点的读路径未设防**（H24 残留）：写入侧已拦，已落库的值 / 裸 dict 响应 / 无 schema 的 JSONB 仍可能把 `nan` 交给 `json.dumps(allow_nan=False)`
- **静态基线不是「已验无害」**：`backend/.mypy-baseline` 里碰 ORM 属性/列名/跨模块签名的条目是待验运行时风险（见 `knowledge/wiki/problems/audit-verification-failure-modes.md`）
- **iPhone 真机验证待办**：内联播放 / 滚动 PiP / 字幕同步
- **本地 dev SMS 发送 502**：待 `.venv`/镜像重装 Dypnsapi SDK 后复测；无凭据环境回退 dev-fake 码
- **E2E coverage 不完整**：播放 / 词汇复习 / 考试流程缺 e2e；`mobile-d1-d10.spec.ts` 的隐藏控件断言需真能播的视频，CI 会 skip
- **ICP compliance**：等个体营业执照才能全量部署（payment 保持禁用）
- **DEC-043 存量已是新算值**：勿再跑 `backfill_difficulty.py`
- **"本地绿"不等于绿**：提交前按 `knowledge/wiki/guides/release-checklist.md` 过四道本地门，且必须用 `.venv` 解释器
- **mypy 已钉版本**（09-27）：`requirements-dev.txt` 钉 `<2.4`；2.3.1 下 77 个实例收敛进基线 53 个唯一 `file:code` 对（实例数≠基线行数）；再升须重估基线
- **`get_user_local_date` 无 timezone 回退 UTC**（`knowledge/wiki/problems/local-date-basis-test-flake.md`）；改回退基准需 DEC
