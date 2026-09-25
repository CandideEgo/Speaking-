# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `decisions-index.md`, `CHANGELOG.md` or `archive/`. Keep this file small — it is read every
> session, and `knowledge-budget.json` caps it.

## Last Updated

Date: 2026-09-25

- **S2b / S3 已落地（09-25，已提交）**：S2b 首页 feed 加「收藏最多 / 本周收藏」排序（DEC-052）；S3 训练轮次落库 + 每日配额 + 加练（DEC-053，`study_sessions`/`study_session_items` + 迁移 `k6l7m8n9o0p1`）。全量后端 **917 passed / 12 skipped / exit 0**。**门禁陷阱已定位并修文档**：裸 `pytest`/`mypy` 走 PATH 落到系统 Python（starlette 0.37.2 / mypy 2.1.0），生出 5 条幻影 `test_profile` 失败与 mypy 基线错配；`.venv` 下分别是 19 passed 与 53=53。命令已钉住解释器，见 `wiki/guides/testing.md`

- **AI 全仓审计两轮修复完成（09-25，已提交）**：open-code-review 扫了 203/379 个源文件（覆盖率 53%）。第一轮修 6 critical + 4 high（DEC-049/050/051）；第二轮修 H11（`cache_set_json` 的 `json.dumps` 移入 try，fail-open 契约补齐）、H19（`position_seconds` 拒负值与非有限值）、H21（`UserUpdate.name` 补 `max_length=100`）、H6/H7（WS 广播遍历快照 + `disconnect` 幂等）。修 H19 时浮出**新的 H24**：422 envelope 回显裸 `NaN` 时自身崩成 500，已加 `json_safe_non_finite`。全量 892 passed / 0 skipped；ruff、mypy 基线 53=53、前端 56 单测全绿
- **已部署**：09-25 01:05 前端 `116e892dc069`（回滚 `050de8864a37`）401 不再被当成会话过期；09-23 `f2c48fdcf1f3`/`7f9d9dffee31` 词库一键已掌握 + 播放页去 `ChannelEntry`；09-22 `1db6f136def5` `users.gender`（DEC-046/048）。DEC-043 存量已是新算值，**不需再跑 `backfill_difficulty.py`**

## Current Focus

- **登录墙收尾项**（09-25 起）：`/contact` 不在 `proxy.ts` 的 `PUBLIC_PATHS`，未登录用户从登录页点「联系我们」（`login/page.tsx:144`）会被弹回；`frontend/src/hooks/**` 不匹配 `modules.json` 任何 glob，`useRequireAuth.ts` 无印章覆盖
- **知识层**（2026-09-19 起）：Phase 0-3 主体已落地。`stale` 现有 6 个模块待 `/knowledge-verify` + 刷印章：`api-v1`、`backend-services`、`env-config`、`frontend-app`、`frontend-components`、`pytest-suite`
- **知识层归档轮已完成（09-25）**：见 `knowledge-budget.json` 的 `_history`
- **多 Agent 协议已落地**（`owners.md` + `handoffs/`）；部署密钥均为 env / `.env` 引用
- **内测上线收尾**：proxy 代理播放实现（需求 §5.4 优先级 3）、海报视觉稿、内测反馈收集渠道

## Next Steps

1. 提交审计修复批次（跨 5 个模块；`/knowledge-maintain` 已完成，`gitnexus_detect_changes()` 因本会话无该 MCP 工具**未跑**）；要更高覆盖率用报告附录 B 续跑剩余 176 个文件
2. 报告里剩余的「夸大/条件性」项需先决策：H12（`payment_verify_signature` 默认 False）、H17 的 payload 无上限、H1 的 refresh 不查封禁；C6 复习竞态需运行时实证
3. **Catalog Phase 2/3（DEC-036 / ADR-0017）**：admin「内容目录」前端页；部署迁移 + 导入 772 条 + 端到端验证一条 promote；重抓脚本收进 `backend/scripts/`
4. 视频存储收尾：稳定后删源站文件 + Docker cache prune（~17.5GB）
5. 集成测试 / Playwright e2e 覆盖新页面（/weekly-report、收藏、CoachMark、ShareCard）
6. Recommendation 深度个性化 P2（ADR-0011）
7. ICP 解封后项：payment、前端单测、e2e 覆盖
8. **词汇训练 + 播放页返回（09-25 定稿；S1/S2b/S3 已落地）**：设计与执行方案见 `docs/plans/词汇训练与播放页返回-*.md`（八片 S1-S8 + 门禁 + 同文件串行约束）。待开票 S2f/S4/S5/S6/S8；S5 依赖 S3 的 `correct_streak`、S6 依赖 `wrong_count`、S8 与 S3 同文件须排其后。**DEC 条目仍欠 S5 与 S6**

## Known Issues

- **线上 `ENV` 无法从仓库自证**（DEC-051 残留）：`env` 默认仍是 `development`，漏配即 dev 形态运行（dev 支付签名旁路 + mock 支付路由 + 无 HSTS/CSP）
- **catalog 并发 promote 的窄窗**（DEC-049 残留）：两个不同条目共享同一 `source_url` 并发 promote 仍各播一次（属 schema 决策）
- **非有限浮点的读路径未设防**（H24 残留）：写入侧已拦，但已落库的值、不经 Pydantic 的裸 dict 响应、无 schema 的 JSONB payload 仍可能把 `nan` 交给 `json.dumps(allow_nan=False)`
- **iPhone 真机验证待办**：内联播放 / 滚动 PiP / 字幕同步
- **本地 dev SMS 发送 502**：待 `.venv`/镜像重装 Dypnsapi SDK 后复测；无凭据环境回退 dev-fake 码
- **E2E coverage 不完整**：播放 / 词汇复习 / 考试等关键流程缺 e2e；`mobile-d1-d10.spec.ts` 的「控件自动隐藏」断言需要**真能播**的本地视频（合成 seed 只写占位 URL），CI 里会 skip
- **ICP compliance**：等个体营业执照才能全量部署（payment 保持禁用）
- **"本地绿"不等于绿**：提交前按 `wiki/guides/release-checklist.md` 过四道本地门，且必须用 `.venv` 解释器（裸 `pytest`/`mypy` 会给出假的失败）
