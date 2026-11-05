# V2 模型网关重新选型（E3a，2026-11-03）

状态：**重新选型完成，没有候选原生通过硬门**。LiteLLM 仍是最接近的底座，但它缺的正是
unknown usage 与取消保留两项；New API / Bifrost 在预占与并发上更差。结论与逐项数字如下，
`LLM_GATEWAY_GOVERNANCE_VERIFIED` 继续保持 `false`，教学 run 不开。

本文替代 `docs/evidence/v2-gateway-spike-2026-11-03/` 中「LiteLLM 未通过」的单一候选结论；
LiteLLM 的原始结果仍以那份 `results.json` 为准。

## 候选与锁定

| 候选 | 版本 / 镜像 | 许可 | 结论 |
| --- | --- | --- | --- |
| LiteLLM Proxy | `ghcr.io/berriai/litellm:v1.106.6@sha256:37e2dafb…0b06` | MIT | 保留为底座候选，但需薄适配层 |
| New API | `calciumion/new-api:v1.0.0-rc.47`（digest `sha256:938fa271…1026`） | AGPL-3.0（含 Section 7 附加条款） | 不采用 |
| Bifrost | `maximhq/bifrost:v2.4.0`（digest `sha256:a1c90607…5c57`） | Apache-2.0 | 不采用 |
| Portkey Gateway | 未实测 | MIT（OSS） | 文档明确 Budget Limits 仅 Enterprise，先排除 |

New API 与 Bifrost 的镜像都经本机可达的镜像代理拉取；digest 为拉取到的 manifest digest。

## 方法

- 统一使用同一个合成 OpenAI 兼容 provider（`provider_stub.py`），不发真实供应商调用；
  它支持 `delay` / `hold` / `unknown_usage` 与 started/completed 计数。
- 每次请求的合成成本：input 10 tokens、output 80 tokens。
  - LiteLLM：模型目录价 `input 0.00001`、`output 0.0001` USD/token → 每请求 **$0.0081**。
  - New API：`model_ratio=5`、`completion_ratio=4`、50 万配额=$1 → 每请求 **1,650 配额 = $0.0033**。
  - Bifrost：pricing override 同上 → 每请求 **$0.0081**。
- 每个场景使用独立的 key / token / virtual key，避免上一个请求的异步结算污染基线。
- 自动化探针：`spike_newapi.py`、`spike_bifrost.py`；LiteLLM 用 `backend/scripts/check_v2_gateway.py`
  并补了一个「剩余额度低于预占」的手工用例。

## 结果

| 硬门 | LiteLLM | New API | Bifrost |
| --- | --- | --- | --- |
| 发包前预占 | **通过**：在途 0.01292 | 部分：预扣 60 配额（仅输入 token） | **失败**：在途 usage 0 |
| 预占覆盖实际成本 | 通过（0.01292 ≥ 0.0081） | **失败**：60 < 1650 | **失败**：0 |
| 剩余不足时发包前拒绝 | **通过**：422 `budget_exceeded`，上游 0 次 | **失败**：仍放行，余额 -650 | 未单独测；并发已超额 |
| 并发争最后预算不超额 | **通过**：2 并发只放行 1 个（422） | **失败**：2 个都 200，余额 -1300 | **失败**：2 个都 200，usage 0.0162 > 0.01 |
| unknown usage 不写 0 | **失败**：结算 0 | 通过：本地估算 200 配额 | **失败**：usage 0 |
| unknown 按保守上界计费 | **失败** | **失败**：200 < 1650 | **失败**：0 |
| 取消/断线不退款到 0 | **失败**：0.01292 → 0.00022 | 通过：保留预扣 60 | **失败**：0 |
| 取消按上界计费 | **失败** | **失败**：60 < 1650 | **失败**：0 |
| 删除 key/token/连接后失效 | 通过（401） | 通过（401） | 无效 key 401；真实删除未测 |
| 多节点/高可用 | 支持（2 worker + Redis 协调） | 支持（DB 配额） | OSS 明确不支持多节点 |

补充：LiteLLM 的「请求 max_tokens 超过模型声明上限」用例未通过，但原因是它按
`min(请求 max_tokens, model_info.max_output_tokens)` 预占并原样转发请求；这不是缺额度放行，
而是「可信输出上界必须由模型配置与供应商实测保证」。教学路径固定 `max_tokens=128` 与声明上限一致，
但上线前仍需供应商实测。

## 结论

1. **没有候选原生满足 V2 硬门。**
2. **LiteLLM 是唯一通过「预占 / 不足拒绝 / 并发不超额」的底座**；它的缺口集中在
   unknown usage 与取消/断线保留，且这两项在 LiteLLM 源码中是有意行为
   （`release_budget_reservation_on_cancel` 会释放输出预占）。
3. New API 的预扣只算输入 token（`relay/helper/price.go: preConsumedTokens = promptTokens × multiplier`），
   余量可为负；Bifrost 先查已用再事后扣费，且 unknown usage 记 0。两者都不能作为硬闸。
4. Portkey OSS 的 Budget Limits 属 Enterprise，不满足「许可允许自托管私用」的前提。
5. **已实现薄适配层**：在 LiteLLM 前后各加一个无状态中继（入站拒绝超出输出上限并在断线后继续排空；
   出站缺少 usage 时注入保守上界）。同一硬门探针复跑 **10/11 通过**，唯一失败项是
   `midnight_late_settle_and_member_utc_day`（有界探针明确标注未证明）。实现与边界见
   [`deploy/v2-gateway/adapter/README.md`](../../../deploy/v2-gateway/adapter/README.md)，
   结果见 [`v2-gateway-spike-2026-11-03`](../v2-gateway-spike-2026-11-03/README.md)。
   真实供应商计价、输出上限、账单对账与午夜 late settle 仍未有运行证据，
   `LLM_GATEWAY_GOVERNANCE_VERIFIED` 保持 `false`。

## 未验证

- 真实供应商能力、账单对账、模型输出上限与计价语义；
- 宿主实测、生产镜像构建、压测与多节点故障演练；
- New API 的正式版（当前为 rc）与 AGPL 合规评估；
- Bifrost 的真实 key 删除/匿名化接口（OSS 管理 API 未启用鉴权，未做破坏性操作）。

## 复跑

```bash
# LiteLLM
docker compose -f docker-compose.v2-gateway.yml up -d
docker compose -f docker-compose.v2-gateway.yml --profile check run --rm probe

# New API
docker compose -f docs/evidence/v2-gateway-reselection-2026-11-03/docker-compose.newapi.yml up -d
python docs/evidence/v2-gateway-reselection-2026-11-03/spike_newapi.py docs/evidence/v2-gateway-reselection-2026-11-03/newapi-results.json

# Bifrost
docker compose -f docs/evidence/v2-gateway-reselection-2026-11-03/docker-compose.bifrost.yml up -d
python docs/evidence/v2-gateway-reselection-2026-11-03/spike_bifrost.py docs/evidence/v2-gateway-reselection-2026-11-03/bifrost-results.json
```

Bifrost 需要 `network_config.allow_private_network: true` 才能访问内网合成 provider；
New API 预扣是输入 token 乘以 `quota_setting.pre_consume_multiplier`，不是输出上界。
