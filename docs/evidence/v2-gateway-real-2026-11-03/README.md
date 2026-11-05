# 真实网关接入（2026-11-03）

状态：**生产形态的网关栈已接好，并已用同一份生产模板接合成 provider 跑通；真实供应商调用被
provider 的 401 阻塞**。`LLM_GATEWAY_GOVERNANCE_VERIFIED` 保持 `false`，教学 run 仍关闭。

## 已落地的接入面

| 位置 | 内容 |
| --- | --- |
| `docker-compose.prod.yml` | `llm-gateway` + `llm-gateway-shim` + `llm-gateway-adapter` + `llm-gateway-db-init`，统一 `profiles: [llm-gateway]`；网关只在内网，admin 端口仅 `127.0.0.1:4001` |
| `deploy/v2-gateway/config.prod.template.yaml` | 模型别名 `teaching`；provider 流量经 shim；`coordination_redis`；预算 reservation 与 fail-closed |
| `deploy/v2-gateway/entrypoint-gateway.sh` | 从环境渲染配置、要求 provider key / master key / DB / Redis 密码齐全后启动 |
| `deploy/v2-gateway/render_config.py` | 占位符替换；缺值或残留占位符直接失败 |
| `deploy/v2-gateway/bootstrap_gateway.py` | 幂等创建 V2 team：日预算 $1、成员日预算 $0.10、UTC 零点重置、模型 `teaching` |
| `deploy/redis/users.acl.template` | 新增独立 `gateway` ACL 身份（独立密码，DB 2），可单独撤销 |
| `backend/app/services/teaching_gateway.py` | 每轮先 `/user/new` 确保 team membership，再签发 per-run key；409 视为已存在 |

后端与 teaching worker 的 `LLM_GATEWAY_BASE_URL` 默认指向 `http://llm-gateway-adapter:4000`，
API/admin key 默认取 `LITELLM_MASTER_KEY`；`LLM_GATEWAY_V2_TEAM_ID` 由 bootstrap 输出后写入 `.env`。

## 已通过的验证

同一份 **生产模板**（不是 synthetic spike 配置）在本机 `docker-compose.real.yml` 上接合成 provider：

- LiteLLM 使用独立的 `litellm` schema 与带密码的 coordination Redis；
- `bootstrap_gateway.py --create` 创建 team `seeword-v2`：
  `team_id=9fbc8ff4-8eaf-4044-a536-834c8d9a228b`，日预算 1.0、成员 0.1、`budget_reset_at=2026-11-04T00:00:00Z`；
- `/model/info` 可见 `teaching`；
- 经 `adapter → LiteLLM → shim → provider` 的教学式请求返回 200，usage 10/80；
- 用测试计价 `input=0.00001`、`output=0.0001` 时，key spend 在约 4 秒后结算为 **0.0081**，
  与 `10×0.00001 + 80×0.0001` 一致；
- 不加测试计价（默认 0）时请求同样 200，这是免费模型的正确行为，但预算闸不产生约束。

接入时发现并修复了一个真实缺陷：`/key/generate` 会自建 user 行，但**不会**建立 team
membership；成员日预算检查因此无法验证 spend，`fail_closed_budget_enforcement` 直接 503。
`teaching_gateway` 现在先调用 `/user/new`（409 视为已存在）再签发 per-run key，并有单测覆盖。

## 免费模型测试（2026-11-03，新 key）

新 Command Code key 能看到 96 个模型、3 个免费模型；默认的
`minimax/minimax-m3.1-flash:free` 已不在网关列表（促销下线）。逐个跑 chat JSON / 词注 / 首页草稿 /
翻译：

| 模型 | 结果 |
| --- | --- |
| `stealth/glyph-cluster:free` | chat 400；翻译通过 |
| `reflection/beam:free` | **全部通过**（3 项 chat + 翻译） |
| `poolside/laguna-s-2.1-free` | chat 404；翻译结果不完整 |

因此本地 `.env` 已切到 `COMMANDCODE_MODEL=reflection/beam:free`，`check_llm_provider.py --test`
四项全过。用该 key + beam 跑真实网关链路：

```text
adapter_status=200
content_prefix={"intent":"show_analysis"}
usage: prompt 67, completion 48 (reasoning 39)
key_spend_usd=0.0
```

`key_spend=0` 是免费模型的正确计价；预算闸因此不产生约束，治理开关仍不能置真。

## 阻塞：生产侧仍未切换

本地已恢复。生产 `/opt/speaking/.env` 仍是旧的 DeepSeek 配置：

```text
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-v4-flash
[FAIL] chat_json default (deepseek-v4-flash): AI service error: 402
Translation engine 'custom' has no API key configured
```

生产需要写入 `COMMANDCODE_API_KEY`、`COMMANDCODE_MODEL=reflection/beam:free` 与
`COMMANDCODE_BASE_URL`，并补齐或切换翻译 `custom` 引擎。这会把生产所有 AI 任务从 DeepSeek
切到 Command Code beam，属于产品级切换，需在部署范围内确认。

## 生产资源阻塞

2026-11-03 只读检查生产机（2C / 1.6 GB）：

```text
Mem: 1613 total, 1520 used, 93 available, 4095 swap
backend 405 MiB · celery 238 MiB · celery-beat 94 MiB · db 160 MiB · frontend 68 MiB
```

现有服务已几乎占满内存。降配评估（1 worker / DB 池 5）实测：LiteLLM 本体 320–380 MiB、
shim 56 MiB、adapter 62 MiB，合计 **440–500 MiB**；256m 上限启动即 OOM。
生产可用 303 MiB，至少缺 250–300 MiB。详见
[`v2-gateway-capacity-2026-11-04`](../v2-gateway-capacity-2026-11-04/README.md)。
部署前需要先决定：

1. 把生产机升到 4 GB（2C/4GB）后再部署；
2. 把网关放到独立机器，并解决生产到网关的网络与 DB/Redis 访问；
3. 暂不部署网关，保持现有 provider 直连（已切到 Command Code beam）。

## 生产 provider 切换结果（2026-11-04）

按“先切 provider”执行，未部署网关：

- 备份：`/root/backups/env.20261104122507`；
- `/opt/speaking/.env` 写入 `COMMANDCODE_API_KEY`、`COMMANDCODE_BASE_URL=https://api.commandcode.ai/provider/v1`、
  `COMMANDCODE_MODEL=reflection/beam:free`；
- 发现 compose 只传 `TRANSLATION_ENGINE` / `TRANSLATION_FALLBACK_ENGINE`，不传
  `TRANSLATION_CUSTOM_*`，所以生产 `custom` 引擎一直读到空 key；改为
  `TRANSLATION_ENGINE=commandcode`、fallback 置空，复用已注入的 `COMMANDCODE_*`；
- 仅重建 `backend` / `celery` / `celery-beat`，未动 db/redis/nginx 配置，随后 `nginx -s reload`。

验证：

```text
check_llm_provider.py --test: 冒烟全部通过（EXIT=0）
chat_json / word_notes / editorial: reflection/beam:free
translate_batch: reflection/beam:free，3 句中译正常
容器: backend healthy, celery/celery-beat Up
/health: {"status":"ok", database/redis ok}
login=200  api=200
内存: used 1310/1613 MB, available 303 MB（backend 262 MiB, celery 185 MiB）
```

`available` 303 MB，仍不足以安全容纳预计 300–500 MB 的网关栈；网关继续不部署，
`TEACHING_RUNS_ENABLED` 与 `LLM_GATEWAY_GOVERNANCE_VERIFIED` 保持关闭。

## 部署前置（未满足）

`/deploy` skill 的前置是**工作树干净且 HEAD 在 `origin/master`**。当前工作区仍包含其他 agent
的 V2 未提交改动与两份新迁移；直接部署会把整批 V2 代码与迁移一起带上生产，超出“只接入网关”
的范围。部署前需要先决定：提交并发布整批 V2，还是只同步网关相关文件并单独启动
`llm-gateway` profile（同时把生产 provider 切到 beam）。

## 尚未证明

- 真实 provider 的可用性、计价与账单对账；
- 真实模型的 tool/JSON 能力与输出上限；
- 跨午夜 late settle、故障隔离与资源压测；
- 宿主 MCP 闭环。

在这些证据补齐前，不把 `LLM_GATEWAY_GOVERNANCE_VERIFIED` 置为 `true`，也不开 teaching run。

## 启动方式（生产）

```bash
# 一次性：渲染 Redis ACL（需要 REDIS_PASSWORD / REDIS_GPU_PASSWORD / REDIS_GATEWAY_PASSWORD）
python scripts/isolation/render_redis_acl.py --out deploy/redis/users.acl.generated

# 启动网关 profile（不会影响现有服务）
docker compose -f docker-compose.prod.yml --profile llm-gateway up -d

# 引导 team，把输出的 team_id 写进 .env 的 LLM_GATEWAY_V2_TEAM_ID
LITELLM_URL=http://127.0.0.1:4001 LITELLM_MASTER_KEY=... python deploy/v2-gateway/bootstrap_gateway.py --create
```

## 本地复现

```bash
LITELLM_MASTER_KEY='...' REDIS_GATEWAY_PASSWORD='local-gateway-only' \
  docker compose -f docs/evidence/v2-gateway-real-2026-11-03/docker-compose.real.yml \
  --env-file backend/.env up -d
```

本机 compose 默认把 shim 指向合成 provider；接真实 provider 时设置
`UPSTREAM_BASE_URL=https://api.commandcode.ai/provider/v1`。
