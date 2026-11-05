# V2 独立模型网关

此目录包含四部分：

1. **synthetic E3a 验证环境**：LiteLLM 固定为 `image-lock.json` 中的完整 digest；网关、独立
   PostgreSQL、独立 Redis 和 OpenAI 兼容 stub 使用内部 Docker 网络，不接入真实供应商。
2. **薄适配层**：`adapter/`（入站上限/断线排空 + 出站 usage shim），见
   [`adapter/README.md`](adapter/README.md)。
3. **真实网关接入**：`config.prod.template.yaml`、`entrypoint-gateway.sh`、`render_config.py`、
   `bootstrap_gateway.py`，以及 `docker-compose.prod.yml` 的 `llm-gateway` profile。
   当前真实 provider key 返回 401，接入状态与复跑步骤见
   [`docs/evidence/v2-gateway-real-2026-11-03/README.md`](../../docs/evidence/v2-gateway-real-2026-11-03/README.md)。
4. **独立网关主机**：`docker-compose.gateway-host.yml` + `gateway_tunnel.sh` / `gateway_tunnel.ps1`，
   把整套网关连同自己的账本 DB / Redis 跑在非生产机器上，由生产通过反向 SSH 隧道访问 adapter。
   见下文「独立网关主机」。

主应用的 `llm_gateway_governance_verified` 保持 `false`；合成或模板验证通过不等于生产可放量。

## synthetic 验证

从仓库根启动：

```powershell
docker compose -f docker-compose.v2-gateway.yml up -d
```

在同一内部网络运行一次性 probe 容器。验收代码是 `backend/scripts/check_v2_gateway.py`，结果写回仓库证据目录：

```powershell
docker compose -f docker-compose.v2-gateway.yml --profile check run --rm probe
```

退出码 `1` 表示至少一项治理门禁失败。报告中的 `passed` 只代表该条 synthetic 场景；不能据此更改启用标记。停止这个独立栈：

```powershell
docker compose -f docker-compose.v2-gateway.yml down
```

所有服务都只连接此项目的内部网络，不发布 host 端口。账号和 master key 是配置中公开的 synthetic 测试值，不能用于其他环境。该栈不复用开发、UI、集成测试或生产数据库。

预算域使用 V2 专属 team，team 为 1 美元/UTC 日、team member 为 0.1 美元/日、run key 为 0.02 美元生命周期。没有代理级 `max_budget`，旧调用不加入此 team。probe 会创建独立 synthetic team/user/key，不修改已有账号。预算竞争场景临时提高同一测试 key 的并发，以单独检验预算原子性；这不证明应用端的每用户一个在途和全站四个在途，也不改变应用限制。

`config.synthetic.yaml` 开启预算 reservation 和锁版源码支持的 `general_settings.fail_closed_budget_enforcement`。不保存 prompt/response 日志。`1d` 不自动构成 UTC 日、跨午夜结算或用户生命周期的验收证据。

复现覆盖：在途预占与可靠 usage 结算、无 usage 的保守收费、run 最后额度竞争、member/team 跨 key 共享预算、客户端断线与上游继续工作、删除 user 后旧 key 失效、初始 UTC reset 时刻。跨午夜 late settle、故障下不确定槽位隔离、数据删除与匿名化还需独立通过，报告会明确保持失败/未证明状态。

官方锁版事实：

- [v1.106.6 LICENSE](https://github.com/BerriAI/litellm/blob/v1.106.6/LICENSE)：`enterprise/` 以外为 MIT，enterprise 内容另受其许可约束。
- [v1.106.6 budget_reservation.py](https://github.com/BerriAI/litellm/blob/v1.106.6/litellm/proxy/spend_tracking/budget_reservation.py)：strict reserve、usage 结算和取消释放的实际实现。
- [v1.106.6 user_api_key_auth.py](https://github.com/BerriAI/litellm/blob/v1.106.6/litellm/proxy/auth/user_api_key_auth.py)：`fail_closed_budget_enforcement` 配置传递。
- [预算 reset 文档](https://docs.litellm.ai/docs/proxy/budget_reset_and_tz)：这是在线文档，不能替代镜像实测或锁版源码。

## 独立网关主机（本机 / GPU 机）

生产机只有 1.6 GB，放不下网关（实测见
[`docs/evidence/v2-gateway-capacity-2026-11-04/`](../../docs/evidence/v2-gateway-capacity-2026-11-04/README.md)）。
这条路线把**整套网关**连同自己的 LiteLLM 账本 DB 与 coordination Redis 跑在另一台机器上。

### 拓扑

```text
生产 backend ──► <compose 网桥 IP>:4400 ──ssh -R──► 127.0.0.1:4400 adapter
                                                   └► LiteLLM ─► shim ─► provider
```

本机在家用 NAT 后面，因此**由网关主机主动连生产**，用 `ssh -R` 让生产的 sshd 在
`speaking_default` 网桥地址上开一个监听端口；容器能到宿主机网桥，宿主机 127.0.0.1 容器到不了，
所以监听地址必须是网桥网关（部署时为 `172.19.0.1`）。

`LLM_GATEWAY_BASE_URL` 目前只有 teaching run 一个消费者，`require_gateway()` 是 fail-closed 的，
所以隧道断掉只会让 V2 教学 run 返回 503，不影响词注 / 翻译 / 首页草稿等直连 provider 的功能。

### 网关主机侧

```bash
# 1) 密钥只放一次，不进仓库
#    LITELLM_MASTER_KEY / GATEWAY_DB_PASSWORD / REDIS_GATEWAY_PASSWORD
#    -> ~/.seeword/gateway-host.env（或 GPU 机上等价的 NSSM 环境）

# 2) 起栈（adapter 只绑 127.0.0.1:4400，不对外）
docker compose --env-file backend/.env --env-file ~/.seeword/gateway-host.env \
  -f deploy/v2-gateway/docker-compose.gateway-host.yml up -d

# 3) 引导 team，把 team_id 记下来
LITELLM_URL=http://127.0.0.1:4001 LITELLM_MASTER_KEY=... \
  python deploy/v2-gateway/bootstrap_gateway.py --create

# 4) 反向隧道（常驻：见下面的开机自启）
GATEWAY_ADAPTER_PORT=4400 deploy/v2-gateway/gateway_tunnel.sh
```

Windows 上没有管理员权限也能做到登录自启：把下面这个 `.cmd` 放进
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`，它会隐藏窗口启动
`gateway_tunnel.ps1`（脚本自己负责重连与日志 `~/.seeword/gateway-tunnel.log`）。

```bat
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\Fuwei\speaking\deploy\v2-gateway\gateway_tunnel.ps1"
```

有管理员权限时换成 NSSM 更稳（SYSTEM 账号没有用户 profile，需要把钥匙放到
`%ProgramData%\seeword\gateway_tunnel_ed25519` 并设 `GATEWAY_TUNNEL_KEY`）。

隧道账号用独立的 `gwtunnel`，`authorized_keys` 上带
`restrict,port-forwarding,permitlisten="172.19.0.1:4400"`，sshd 侧是只对该账号生效的
`Match User gwtunnel`（`AllowTcpForwarding remote` + `GatewayPorts clientspecified`）。
现有 `AllowTcpForwarding local` 与 root/GPU 两把钥匙都不受影响。

### 生产侧

```bash
# .env
LLM_GATEWAY_BASE_URL=http://<compose 网桥 IP>:4400
LLM_GATEWAY_API_KEY / LLM_GATEWAY_ADMIN_KEY = LITELLM_MASTER_KEY
LLM_GATEWAY_V2_TEAM_ID=<bootstrap 输出的 team_id>
```

改完只需重建 `backend` / `celery` / `celery-beat` 并 `nginx -s reload`；网关不部署在生产的
`llm-gateway` profile，也不要再启用它。

### 这套形态的边界

- 账本 DB 和 Redis 都在网关主机上。**机器丢失 = 预算账本丢失**，在它还只是试点网关时接受，
  正式放量前要么把 DB 换成生产库的独立 schema（经正向隧道），要么把网关迁到常驻主机。
- 网关主机不是服务器：休眠、重启、断网都会让 teaching run 直接 503。当前本机是登录自启的
  启动项 + 脚本内重连，**注销或重启后需要重新登录**才会恢复；关掉睡眠才谈得上常驻。
- 免费模型 `reflection/beam:free` 的 spend 恒为 0，预算闸不产生约束；要拿成本证据必须换付费模型
  并填真实单价。
