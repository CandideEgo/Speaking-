# 后续开发流程 - 2026-07-09

> 基于 [FRONTEND-AUDIT-2026-07.md](FRONTEND-AUDIT-2026-07.md)（Phase A 审计）+ [ADR-0007](../adr/0007-redemption-code-lifecycle.md)（兑换码生命周期）。
> 审计结论：**是"修复+清理"不是"70-80% 重设计"**-31 页 0 死按键，真问题是 ~14 执行问题 + 5 断链 + 5 砍功能文案遗留。

## 流程总览

| Phase | 内容 | 依赖 | 产出 |
|---|---|---|---|
| **A. 审计** ✅ | 31 页全量审计：交互元素状态 + 六类分级 + 执行问题 | 无 | `FRONTEND-AUDIT-2026-07.md` |
| **B. 后端·基建（三线并行）** | B1 兑换码子系统 · B2 后台指标 · B3 GPU worker 常驻 | 无前端依赖 | 端点+迁移+ops |
| **C. 前端修复+重做（依审计，执行层打磨，ADR-0005 保留）** | C1 上线阻塞 · C2 执行修复 punch-list · C3 Pro 前端 · C4 管理端指标消费 | A 审计 + B 端点 | 修复+重做页面 |
| **D. QA + 上线** | pre-commit + pytest + tsc + build + `gitnexus_detect_changes`；部署收尾 | C | 上线 |

**依赖逻辑**：B 三线互相独立、不依赖前端，可与 C 并行先行；C 必须等 A（知道改什么）+ B（有端点可消费）。B3（GPU）多是 ops，几乎不占开发带宽。

---

## Phase A - 审计 ✅（2026-07-09 完成）

见 `FRONTEND-AUDIT-2026-07.md`。核心：31 页 0 死按键；5 坏（landing 锚点断链）；5 砍遗留（多为文案）；2 实际占位；~14 UX/执行问题。

## Phase B - 后端·基建（三线并行）

### B1. 兑换码子系统（ADR-0007）

- 迁移：`invite_codes` 加 `status`/`revoked_reason`/`expires_at`；`InviteCode`->`RedeemCode` 改名（表 + 端点路径）。
- 改 `redeem`：判 `status==unused`（替代 `is_used`）。
- 新端点：`POST /invite-codes/{id}/revoke`（未用作废）、`POST /invite-codes/{id}/refund`（退款撤销，原子全额追回）。
- 新 beat：到期主动降级（`plan_expires_at < now` -> `plan=free`，每小时）+ 未用码过期（`unused` 超 180 天 -> `expired`，每天）。
- 验证：`gitnexus_impact`（redeem/require_pro_user/change_user_plan）+ pytest。

### B2. 后台指标

- `POST /presence/heartbeat`（auth + rate-limit；前端 tab 可见时 60s 一次，Redis `presence:{uid}` TTL 5min）。
- `get_admin_stats` 扩展：实时在线计数（SCAN `presence:*`）+ transcription_gpu 队列深度 + 视频状态分布（已有 `videos_by_status`，补 error count）+ 今日注册 + 今日兑换数。
- 复用：`/admin/worker-status`（GPU 在线）、`/videos/admin/pending-count`（UGC 待处理）已有。
- 验证：`gitnexus_impact`（get_admin_stats）+ pytest。

### B3. GPU worker 常驻（本机 Windows 起步）

- **现状**：`start_gpu_worker.py`（Celery `--pool=solo` + 心跳）+ prod compose loopback Redis + SSH 隧道设计已就绪。缺常驻层。
- **实现**：NSSM 注册 `start_gpu_worker.py` 为 Windows 服务（开机自启 + 崩溃重启）+ autossh 保活 SSH 隧道（`ssh -L 6379:127.0.0.1:6379 cloud`）+ 本机 `.env`（`REDIS_URL` 指隧道、`WHISPER_*`、`TRANSCRIPTION_CALLBACK_*`）。
- **迁移触发条件**（量大再迁 GPU 服务器）：转录量日均 > N 且常驻不稳定，或个人机无法 24h 在线 -> 租 Linux GPU VPS + systemd。
- rationale：prod 转录依赖个人 Windows 机器是已知脆性；分阶段决策（设计为可逆），不达 ADR"难逆转"门槛，记于此。

## Phase C - 前端修复+重做（依审计）

### C1. 上线阻塞（先做）

| # | 页面 | 修法 |
|---|---|---|
| 1 | landing | 5 锚点断链：各 `<section>` 加 `id` |
| 2 | pricing | features/comparison 删"AI评测/逐词评分/学习总结/推荐"等砍功能承诺 |
| 3 | privacy | "邮箱""口语评分"->手机号+学习记录 |
| 4 | terms | 删"AI评测"承诺 |
| 5 | stats | 2 KPI 假数据接真数据 |

### C2. 执行修复 punch-list

见审计文档"修复 Punch-list"#6-#23：search 迁统一原语（疑 Tailwind4 回归）、vocabulary 按钮去重、community following 差异化、history 迁 `<Link>`、NotificationPreferences 本地化、admin `confirm()`->`ConfirmDialog`、users placeholder 改手机号、3 处列表加分页、stats range toggle 修 refetch、landing CTA 分登录态等。

### C3. Pro 前端

- `PricingSection` 三档 -> 两档（Free + Pro ¥9.9/月）。
- `/redeem` UX：显示新到期日、revoked/expired 友好报错。
- 管理端"兑换码管理页"（消费 B1：生成/列表/作废/退款撤销/导出，对齐统一组件库）。

### C4. 管理端指标消费

- `/admin` 取消 redirect，改为概览 dashboard：4 组指标 StatCard（实时在线/管线健康/用户结构/UGC待处理）+ 跳转链接。
- stats 页 KPI grid 调 4×2 或独立 SectionCard 容纳"实时在线"。
- videos 页顶部加"管线健康"SectionCard（worker 状态 + queue depth + error count）。

## Phase D - QA + 上线

- `pre-commit run --all-files`、`pytest tests/`、`npx tsc --noEmit`、`npm run build`。
- 每个符号改动前 `gitnexus_impact`，提交前 `gitnexus_detect_changes`。
- 部署收尾（上线阻塞清单）：HTTPS、ICP、GPU worker 常驻、`.env`、seed。
