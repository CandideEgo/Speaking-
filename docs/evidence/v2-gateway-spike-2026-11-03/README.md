# V2 独立模型网关 E3a 选型 spike（2026-11-03）

状态：**spike 已执行，结论为未通过治理验收**。`LLM_GATEWAY_GOVERNANCE_VERIFIED` 保持 `false`，
`TEACHING_RUNS_ENABLED` 不得开启。本文只记录合成环境实测，不含真实供应商调用、不含生产数据。

## 测什么

对齐 [V2 方向文档 §2.5 / §2.9](../../v2-direction-alignment-2026-11-02.md) 的硬门，验证 LiteLLM Proxy
作为独立网关能否在**发包前**预占可信上界、处理 unknown usage、取消/断线与跨 worker 预算并发。

- 镜像：`ghcr.io/berriai/litellm:v1.106.6@sha256:37e2dafb088a7723beb998590682957386dfc83ffea1848486f8e0e5cfac0b06`
- 拓扑：`docker-compose.v2-gateway.yml` 的 `synthetic` 内网（gateway + Postgres + Redis + 合成 provider），
  无公网、无真实 provider key。
- 探针：`backend/scripts/check_v2_gateway.py --container-network`，结果写入 `results.json`。

## 本轮修正的配置错误

首轮 `results.json` 只得到 `wait_ready` 失败；重启 Docker 后复跑暴露出真正原因：
`litellm_settings.redis_host` 在 v1.106.6 不被读取，启动日志明确警告
`Running 2 workers but Redis is not configured`，导致预占计数器只在单 worker 内存中。

正确配置是 `general_settings.coordination_redis`（或 `REDIS_*` 环境变量）：

```yaml
general_settings:
  coordination_redis:
    host: gateway-redis
    port: 6379
```

修正后跨 worker 预占与预算闸才真正生效；`reserve_then_reliable_settle`、
`member_budget_reservation`、`v2_team_budget_reservation`、`run_last_budget_race`
从失败转为通过。

## 结果（2026-11-03T11:19Z 本次复跑）

| 检查 | 结果 | 关键观测 |
| --- | --- | --- |
| 发包前预占 → 可靠结算 | 通过 | 在途 0.01292 USD，结算 0.0081 USD |
| unknown usage 保守计费 | **失败** | 上游无 usage 时结算为 0.0，预占被释放；违反「unknown 不得当零」 |
| 超额请求在预占前拒绝 | **失败** | `max_tokens=300`（估算 0.03 USD）对 0.02 USD run 额度仍被放行并发出 1 次上游请求 |
| 同 run 最后预算竞争 | 通过 | 2 并发只放行 1 个，另一个 422 |
| 成员日预算并发预占 | 通过 | 9 并发放行 7（输出上限 7），2 个 422 |
| 团队日预算并发预占 | 通过 | 96 并发放行 77（上限 78），19 个 422 |
| 客户端断线保留不确定预占 | **失败** | 断线后从 0.01292 降到 0.00022 USD；上游仍在执行并完成 |
| 断线后上游迟到完成 | 通过 | 合成 provider 记录 completed=1 / disconnected=1 |
| 删除用户撤销既有 run key | 通过 | 删除后旧 key 返回 401 |
| 团队预算重置时间为 UTC 午夜 | 通过 | `budget_reset_at=2026-11-04T00:00:00Z` |
| 午夜 late settle 与成员日桶一致性 | **未证明** | 有界探针无法证明，保持失败，不因日历通过 |

补充（2026-11-03 重新选型时复测）：key `max_budget=0.01`、请求预占 0.01288 时，
LiteLLM 在发包前返回 `422 budget_exceeded`，合成 provider 收到 0 次请求。说明「剩余不足拒绝」
本身是有效的；探针里失败的是「请求 max_tokens 应驱动预占」这一条，LiteLLM 改用模型声明上限。

## 薄适配层结果（2026-11-03）

在网关前后各加一个无状态中继（`deploy/v2-gateway/adapter/`）：

- 入站代理拒绝 `max_tokens > 模型输出上限`，并在调用方断线时继续排空 LiteLLM 请求；
- 出站 shim 在上游缺少 usage 时注入保守上界，让 LiteLLM 走正常结算。

同一探针复跑（`checked_at=2026-11-03T15:52:40Z`）：

| 检查 | 结果 |
| --- | --- |
| reserve_then_reliable_settle | 通过 |
| unknown_usage_conservative_charge | 通过（结算 0.01353 ≥ 预占 0.01292） |
| reject_estimate_above_run_remaining | 通过（适配层 422，上游 0 次） |
| run_last_budget_race | 通过 |
| member / team budget reservation | 通过 |
| cancel_retains_uncertain_upper_bound | 通过（断线后 0.0138 ≥ 预占 0.01292） |
| synthetic_late_work / user delete / UTC reset | 通过 |
| midnight_late_settle_and_member_utc_day | 未证明（探针固有限制，不因日历通过） |

`LLM_GATEWAY_GOVERNANCE_VERIFIED` 仍为 `false`：真实供应商计价、输出上限、账单对账、
午夜 late settle 与资源压测都还没有运行证据。合成探针通过不等于生产可放量。


## 结论

LiteLLM v1.106.6 在上述 pinned 配置下**不能原生满足 V2 的两条硬门**：

1. **unknown usage 被写成 0**，预算会低估；
2. **客户端断线时释放输出预占**，上游仍可能完成并计费，预算会低估；
3. 额外发现：预占上界取 `min(请求 max_tokens, 配置 max_output_tokens)`，
   但请求仍会原样转发；声明上限必须由供应商实测确认，不能只靠配置。

因此按方向文档 §2.8 的规则处理，**不退回进程内封装、不放宽要求**：

- 继续在网关侧评估薄适配层（保守计费 unknown、断线 quarantine、late settle、输出上限实测）；
- 或重新选型（New API / Portkey / Bifrost）；
- 在任一方案通过同一探针前，教学 run 保持关闭，`LLM_GATEWAY_GOVERNANCE_VERIFIED=false`。

## 复跑方式

```bash
docker compose -f docker-compose.v2-gateway.yml up -d
docker compose -f docker-compose.v2-gateway.yml --profile check run --rm probe
```

探针默认写 `docs/evidence/v2-gateway-spike-2026-11-03/results.json`；退出码 1 是治理门失败，
不是可以放宽的信号。
