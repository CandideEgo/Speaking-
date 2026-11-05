# V2 教学与外部连接 UI 验收（2026-11-03）

状态：**私测入口 UI 已在本机跑通，默认关闭的开关语义未改动**。本文记录的是人工走查（ego-browser）
与截图证据，不是自动化回归的替代；生产未部署、未放量。

## 环境

- 独立一次性 Postgres `127.0.0.1:15433`（库 `seeword_v2_ui`，迁移 head `d9e0f1a2b3c4`）与 Redis `127.0.0.1:16380`；
- 后端 `ENV=testing`、`TEACHING_ENABLED=true`、`TEACHING_RUNS_ENABLED=false`（网关治理未通过，按设计关闭）；
- 种子账号 `13900009991` 持有 `teaching_access_grants` 行；内容为合成原创 fixture（`content-inventory.json`），不冒充真题；
- 前端 `next dev`，经 `next.config.js` 的 dev rewrite 访问后端 `:8000`。

## 本轮走查（接手后复跑）

1. 密码登录 → `/practice` 出现「单题教学 · 私测」目录，含「继续教学」与一条自动核验内容；
2. 打开既有教学会话，题面、提示 level 1、答案与解析、原文证据均按已提交状态恢复；
3. 新开一道题：出现「开始这道题的教学」，创建会话后进入初答界面；
   - 注：同一用户对同一 `content_revision_id` 已揭晓过答案时，新会话会直接显示解析。这是
     `user_question_disclosures` 的设计口径（答案可见按用户+内容版本，不按会话），不是泄漏；
4. `/profile?tab=account` → 「已连接 AI · 私测」：既有 Codex 连接可更新凭据；撤销需二次确认，
   撤销后显示「已撤销」、凭据输入框不再存在（`#external-token` 缺失）；
5. 390px 宽度下页面无横向溢出；此前「导出 / 注销」按钮被压成竖排单字，已在
   `AccountLifecycleSettings.tsx` 给三个操作按钮加 `shrink-0 whitespace-nowrap`，修复后按钮为单行
   （52×34 / 70×34 px）。

## 截图

| 文件 | 内容 |
| --- | --- |
| `desktop-before.png` | 教学题面初始态（1440） |
| `desktop-hint-1440.png` | 初答错误后的分级提示（1440） |
| `mobile-restored-390.png` | 复答揭晓后刷新恢复（390） |
| `mobile-connections-390.png` | 连接撤销后的账号页（390） |
| `mobile-account-buttons-390.png` | 导出/注销按钮换行修复后的账号页（390） |

## 未覆盖

- `TEACHING_RUNS_ENABLED` 的模型回合与 SSE 流：被 E3a 网关治理门阻塞（见
  [`v2-gateway-spike-2026-11-03`](../v2-gateway-spike-2026-11-03/README.md)）；
- MCP 宿主端到端：`MCP_SDK_ENABLED=false`，SDK 依赖门未通过，`test_mcp_adapter.py` 按设计 skip；
- 公开放量：仍等 A12 真实样本与独立发布决定。
