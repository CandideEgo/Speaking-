# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `decisions-index.md`, `CHANGELOG.md` or `archive/`. Keep this file small — it is read every
> session, and `knowledge-budget.json` caps it.

Last Updated: 2026-09-27

## Current Focus

- **登录墙收尾项**（09-25 起）：`/contact` 不在 `proxy.ts` 的 `PUBLIC_PATHS`，未登录用户从登录页点「联系我们」（`login/page.tsx:144`）会被弹回；`frontend/src/hooks/**` 不匹配 `modules.json` 任何 glob，`useRequireAuth.ts` 无印章覆盖
- **知识层**：Phase 0-3 已落地；09-27 棘轮第一轮（DEC-054/055）+ 本轮 /knowledge-verify 热层收缩；归档轮见 `knowledge-budget.json` 的 `_history`
- **内测上线收尾**：proxy 代理播放实现（需求 §5.4 优先级 3）、海报视觉稿、内测反馈收集渠道

## Next Steps

1. **AI 审计收尾**（DEC-049/050/051，修复已提交）：报告附录 B 续跑剩余 176 文件；「夸大/条件性」项需先决策——H12（`payment_verify_signature` 默认 False）、H17 的 payload 无上限、H1 的 refresh 不查封禁；C6 复习竞态需运行时实证
2. **Catalog Phase 2/3（DEC-036 / ADR-0017）**：admin「内容目录」前端页；部署迁移 + 导入 772 条 + 端到端验证一条 promote；重抓脚本收进 `backend/scripts/`
3. 视频存储收尾：稳定后删源站文件 + Docker cache prune（~17.5GB）
4. 集成测试 / Playwright e2e 覆盖新页面（/weekly-report、收藏、CoachMark、ShareCard）
5. Recommendation 深度个性化 P2（ADR-0011）
6. ICP 解封后项：payment、前端单测、e2e 覆盖
7. **词汇训练剩余（S1/S2b/S2f/S3/S7a/S7b 已落地）**：方案见 `docs/plans/词汇训练与播放页返回-*.md`。待开票 S4/S5/S6/S8（S8 前置 S7 已通、与 S3 同文件须排其后；S5 依赖 `correct_streak`、S6 依赖 `wrong_count`）。**DEC 仍欠 S5/S6**；**S7a 回填脚本部署时跑**（先 dry-run，见 handoff 2026-09-27-s7a）

## Known Issues

- **mypy 基线漂移（09-27 发现）**：venv mypy 升 2.3.1，干净树 77 errors（旧 53），与改动无关；需单独决策钉版本或重生成基线
- **`get_user_local_date` 无 timezone 回退 UTC**（`wiki/problems/local-date-basis-test-flake.md`）；改回退基准需 DEC
- **线上 `ENV` 无法从仓库自证**（DEC-051 残留）：`env` 默认仍是 `development`，漏配即 dev 形态运行（dev 支付签名旁路 + mock 支付路由 + 无 HSTS/CSP）
- **catalog 并发 promote 的窄窗**（DEC-049 残留）：两个不同条目共享同一 `source_url` 并发 promote 仍各播一次（属 schema 决策）
- **非有限浮点的读路径未设防**（H24 残留）：写入侧已拦，但已落库的值、不经 Pydantic 的裸 dict 响应、无 schema 的 JSONB payload 仍可能把 `nan` 交给 `json.dumps(allow_nan=False)`
- **iPhone 真机验证待办**：内联播放 / 滚动 PiP / 字幕同步
- **本地 dev SMS 发送 502**：待 `.venv`/镜像重装 Dypnsapi SDK 后复测；无凭据环境回退 dev-fake 码
- **E2E coverage 不完整**：播放 / 词汇复习 / 考试等关键流程缺 e2e；`mobile-d1-d10.spec.ts` 的「控件自动隐藏」断言需要**真能播**的本地视频（合成 seed 只写占位 URL），CI 里会 skip
- **ICP compliance**：等个体营业执照才能全量部署（payment 保持禁用）
- **DEC-043 存量已是新算值**：勿再跑 `backfill_difficulty.py`
- **"本地绿"不等于绿**：提交前按 `wiki/guides/release-checklist.md` 过四道本地门，且必须用 `.venv` 解释器（裸 `pytest`/`mypy` 会给出假的失败）
