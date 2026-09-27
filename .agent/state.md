# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `decisions-index.md`, `CHANGELOG.md` or `archive/`. Keep this file small — it is read every
> session, and `knowledge-budget.json` caps it.

Last Updated: 2026-09-27

## Current Focus

- **知识层**：Phase 0-3 已落地；09-27 棘轮第一轮（DEC-054/055）+ 本轮 /knowledge-verify 热层收缩；归档轮见 `knowledge-budget.json` 的 `_history`。**`decisions-index.md`/`context.md` 已 RED（>95%）**：前者随 DEC 机械增长，下轮 maintain 按归档流程收缩，不许手抬 ceiling
- **内测上线收尾**：proxy 代理播放实现（需求 §5.4 优先级 3）、海报视觉稿、内测反馈收集渠道

## Next Steps

1. **AI 审计收尾**（DEC-049/050/051，修复已提交）：报告附录 B 续跑剩余 176 文件；「夸大/条件性」项需先决策——H12（`payment_verify_signature` 默认 False）、H17 的 payload 无上限、H1 的 refresh 不查封禁；C6 复习竞态需运行时实证
2. **Catalog Phase 2/3（DEC-036 / ADR-0017）**：admin「内容目录」前端页；部署迁移 + 导入 772 条 + 端到端验证一条 promote；重抓脚本收进 `backend/scripts/`
3. 视频存储收尾：Docker cache prune 可随时做；**删源站 `_raw` 母带被阻塞**——当前未配 OSS（09-27 确认），raw 是唯一副本，删除=不可逆丢失；需先配对象存储/离线备份，或明确放弃母带只留成品
4. 集成测试 / Playwright e2e 覆盖新页面（/weekly-report、收藏、CoachMark、ShareCard、drill 选择题循环、集合详情两栏）
5. Recommendation 深度个性化 P2（ADR-0011）
6. ICP 解封后项：payment、前端单测、e2e 覆盖
7. **词汇训练线收尾（S1–S8 已落地，DEC-053/056/057）**：T1 回填脚本下次部署跑（先 dry-run，见 archive/handoffs/2026-09-27-s7a）；T2 e2e 已补跑通过（09-27：88 过 / 9 skip 均为「无可播视频」预期类；顺手修 helpers 手机号并行撞号）；可选追票：续轮次序精确化（`wrong_in_round` 改计数）、每日循环 ECDICT 干扰项兜底（需 API 透传）、「全部单词」词行级 unmark；SM-2 旧文案清扫（`layout.tsx:7`、`practice/page.tsx:296`、`AuthCard.tsx:7`）

## Known Issues

- **线上 `ENV` 无法从仓库自证**（DEC-051 残留）：`env` 默认仍是 `development`，漏配即 dev 形态运行（dev 支付签名旁路 + mock 支付路由 + 无 HSTS/CSP）
- **catalog 并发 promote 的窄窗**（DEC-049 残留）：两个不同条目共享同一 `source_url` 并发 promote 仍各播一次（属 schema 决策）
- **非有限浮点的读路径未设防**（H24 残留）：写入侧已拦，但已落库的值、不经 Pydantic 的裸 dict 响应、无 schema 的 JSONB payload 仍可能把 `nan` 交给 `json.dumps(allow_nan=False)`
- **iPhone 真机验证待办**：内联播放 / 滚动 PiP / 字幕同步
- **本地 dev SMS 发送 502**：待 `.venv`/镜像重装 Dypnsapi SDK 后复测；无凭据环境回退 dev-fake 码
- **E2E coverage 不完整**：播放 / 词汇复习 / 考试等关键流程缺 e2e；`mobile-d1-d10.spec.ts` 的「控件自动隐藏」断言需要**真能播**的本地视频（合成 seed 只写占位 URL），CI 里会 skip
- **ICP compliance**：等个体营业执照才能全量部署（payment 保持禁用）
- **DEC-043 存量已是新算值**：勿再跑 `backfill_difficulty.py`
- **"本地绿"不等于绿**：提交前按 `wiki/guides/release-checklist.md` 过四道本地门，且必须用 `.venv` 解释器（裸 `pytest`/`mypy` 会给出假的失败）
- **mypy 已钉版本**（09-27 决策，T4 收账）：`requirements-dev.txt` 钉 `<2.4`；2.3.1 下 77 个错误实例恰好收敛进基线 53 个唯一 file:code 对（实例数≠基线行数，勿误判漂移）；再升 mypy 主/次版本须重估基线
- **`get_user_local_date` 无 timezone 回退 UTC**（`wiki/problems/local-date-basis-test-flake.md`）；改回退基准需 DEC
