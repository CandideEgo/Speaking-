# 网关降配容量评估（2026-11-04）

结论：**在现有 2C / 1.6 GB 生产机上，降配到 1 worker 也放不下网关**。网关三个组件的最小
稳态占用约 **440–490 MiB**，而切换 provider 后生产只剩 **303 MiB** 可用。需要扩内存或独立
网关机器；不建议靠 4 GB swap 硬跑。

## 测量方法

本机用 `docker-compose.eval.yml` 起与生产同构的 1-worker LiteLLM + shim + adapter，
接合成 provider，不接真实供应商；只改 worker 数、DB 连接池与内存上限。

| 配置 | 结果 |
| --- | --- |
| LiteLLM 1 worker，`mem_limit=256m` | 启动阶段 OOM（exit 137），未到 ready |
| LiteLLM 1 worker，`mem_limit=320m` | ready，RSS **319.8 / 320 MiB**（贴着上限） |
| LiteLLM 1 worker，`mem_limit=384m` | ready，RSS **371.5 / 384 MiB** |
| 同上 + `MALLOC_ARENA_MAX=2` + 本地计价表 | 仍 383.8 / 384 MiB，无可感知下降 |
| shim（uvicorn/FastAPI） | **56.2 MiB**（64m 上限的 88%） |
| adapter（uvicorn/FastAPI） | **62.3 MiB**（64m 上限的 97%） |
| 合成 provider / 评估用 db / redis | 9.8 / 73.8 / 7.8 MiB（生产复用现有 db/redis，不新增） |

生产实测（2026-11-04，provider 切换后）：

```text
Mem: 1613 total, 1310 used, 303 available, 4095 swap
backend 262 MiB · celery 185 MiB · celery-beat 92 MiB · db 146 MiB · frontend 70 MiB
```

## 结论

- 即使 LiteLLM 只开 1 worker、DB 连接池降到 5，网关本体仍需 **320–380 MiB**；
  加上 shim/adapter 约 **120 MiB**，合计 **440–500 MiB**。
- 生产可用 303 MiB，扣掉安全余量后至少缺 **250–300 MiB**。
- 两个适配层进程每个已接近 64 MiB 上限；正式部署应各给 ≥96 MiB。
- 把 shim 与 adapter 合并成一个进程最多省 ~50 MiB，仍不够。
- 256 MiB 会在启动阶段 OOM，说明不能靠压上限硬塞。

## 建议

1. **首选**：把生产机内存升到 4 GB（2C/4GB），网关仍按 2 worker 部署，留出安全余量；
2. 或把网关放到独立主机，并解决生产到网关的网络与 DB/Redis 访问；
3. 不建议在 1.6 GB 机器上开 swap 硬跑：模型调用与迁移期间会明显抖动，且 OOM 会拖垮同机
   backend/celery。

如果换到更小的机器，部署参数应为：

```text
GATEWAY_WORKERS=1
LITELLM_DB_POOL_LIMIT=5
gateway mem_limit >= 512m
shim/adapter mem_limit >= 96m each
```

`entrypoint-gateway.sh` 与 `config.prod.template.yaml` 已支持
`GATEWAY_WORKERS` / `LITELLM_DB_POOL_LIMIT`，无需改代码。

## 复跑

```bash
GATEWAY_WORKERS=1 LITELLM_DB_POOL_LIMIT=5 GATEWAY_MEM_LIMIT=384m \
  docker compose -f docs/evidence/v2-gateway-capacity-2026-11-04/docker-compose.eval.yml up -d
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep seeword-v2-gateway-eval
docker compose -f docs/evidence/v2-gateway-capacity-2026-11-04/docker-compose.eval.yml down -v
```

评估栈已停止，未接真实 provider，未改生产服务。
