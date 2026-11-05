# P01.3 隔离网关回归证据

日期：2026-11-05。仅合成供应商，真实 provider 调用 0。本目录不是生产治理通过证明，签名协议与配置见[网关说明](../../../deploy/v2-gateway/adapter/README.md)，本批其他检查见[实施记录](../../docs/implementation.md)。

- [gateway-readiness-failure.json](gateway-readiness-failure.json)：首次未在既有 90 秒内就绪，检查失败；随后 Docker 引擎 API 返回 500。没有足够证据认定 OOM 原因。
- [results.json](results.json)：恢复引擎并暂停此前自动恢复的本地 host 网关后，在同一独立合成项目重试；10 项通过，午夜 late settle/member UTC day 未证明，probe exit 1，governance=false。未修改检查器、并发数、预算、超时或未证明项。
- [synthetic.override.yaml](synthetic.override.yaml)：侧车使用本次新镜像，移除主机端口，将 probe 挂载到本目录；不读取真实 provider 凭据、不使用已有 host 的 DB/Redis。

运行项目名为 `seeword-receipt-check-20261105`，服务与网络已用该精确 project 的 compose down 清除，没有清理其他项目或已有数据卷。原 host 五个容器恢复为运行状态后，Docker Desktop 再关闭回本批开始时状态；未重建 host 服务或更换其镜像。

复跑前需先构建 adapter 镜像并标记为 `seeword-content-receipt-adapter:local-check`，再从仓库根运行下列命令。请换独立项目名并保留自己的初始运行状态；probe 会在该项目的账本写入合成测试主体，不能指向实际网关。

```powershell
docker compose -p seeword-receipt-check-20261105 -f docker-compose.v2-gateway.yml -f refactor-blueprint/evidence/content-receipts/synthetic.override.yaml up -d --no-build
docker compose -p seeword-receipt-check-20261105 -f docker-compose.v2-gateway.yml -f refactor-blueprint/evidence/content-receipts/synthetic.override.yaml --profile check run --rm --no-deps probe
# 核对该项目仅含本次测试资源后清理；会停止并移除该项目资源。
docker compose -p seeword-receipt-check-20261105 -f docker-compose.v2-gateway.yml -f refactor-blueprint/evidence/content-receipts/synthetic.override.yaml down --volumes
```

该探针验证侧车运行时替换与原治理行为，未直接验证收据 endpoint 在真实 LiteLLM 上的模型核验产物；收据 endpoint 的实际 HTTP 检查采用临时密钥与合成上游，后端签名→发布桥接回归采用合成调用缝。两者均不等于真实模型族、供应商费用或内容授权验收。
