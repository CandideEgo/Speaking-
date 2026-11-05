# 网关独立主机联调（2026-11-04）

状态：**通了**。整套网关跑在本机，生产 backend 容器经反向 SSH 隧道访问 adapter，端到端打通
真实 provider，超上限请求被拒。生产只动了一件事：为隧道单独开了一个受限账号，root 与 GPU
两把钥匙的 sshd 权限不变（已核对生效值）。

`TEACHING_RUNS_ENABLED` 与 `LLM_GATEWAY_GOVERNANCE_VERIFIED` 仍为 `false`，教学 run 仍然关着。
生产 `.env` 已指向这个网关（见「生产已指向网关」），但 V2 教学 API 尚未部署，所以目前没有消费者。

## 拓扑

```text
生产 backend 容器 ──► 172.19.0.1:4400 ──ssh -R──► 127.0.0.1:4400 adapter（本机）
                                                    └► LiteLLM ─► shim ─► Command Code
```

`172.19.0.1` 是生产 `speaking_default` 网络的网关地址（`docker0` 是 `172.17.0.1`，容器访问
宿主机 loopback 不通，所以监听地址必须是网桥网关）。

## 本机侧

`deploy/v2-gateway/docker-compose.gateway-host.yml`（新增）起 5 个容器：

```text
seeword-gateway-host-gateway-db-1        healthy   LiteLLM 账本（自有 Postgres，schema litellm）
seeword-gateway-host-gateway-redis-1     healthy   coordination Redis（自有，带密码）
seeword-gateway-host-gateway-1                     LiteLLM v1.106.6，2 worker
seeword-gateway-host-llm-gateway-shim-1            出站 usage shim
seeword-gateway-host-adapter-1           healthy   入站 adapter，只绑 127.0.0.1:4400
```

adapter 只发布到 `127.0.0.1:4400`，管理面 `/key/*` 只发布到 `127.0.0.1:4001`。密钥在
`~/.seeword/gateway-host.env`（仓库外，0600），`COMMANDCODE_*` 复用 `backend/.env`。

## 生产侧改动（唯一一处）

```text
# /etc/ssh/sshd_config.d/20-seeword-gateway-tunnel.conf
Match User gwtunnel
    AllowTcpForwarding remote
    GatewayPorts clientspecified
    PermitTTY no
    AllowAgentForwarding no
    X11Forwarding no
    PermitOpen none

# /home/gwtunnel/.ssh/authorized_keys
restrict,port-forwarding,permitlisten="172.19.0.1:4400",command="/bin/false" ssh-ed25519 ... seeword-gateway-tunnel
```

`gwtunnel` 是专用系统账号：没有可用 shell、不能开本地转发、只能监听一个地址一个端口、只能
开反向转发。生效值核对：

```text
sshd -T -C user=gwtunnel : AllowTcpForwarding remote / GatewayPorts clientspecified
sshd -T -C user=root     : AllowTcpForwarding local  / GatewayPorts no
```

`sshd -t` 通过后 `systemctl reload ssh`；原配置备份在 `/root/backups/`（首次改动前的
`sshd-forwarding.*.conf` 与本次的 `gateway-tunnel-sshd.*.conf`）。回滚 = 删掉该 drop-in 再 reload。

## 验证

本机自测：

| 检查 | 结果 |
| --- | --- |
| `/model/info` | 200，`teaching` → `openai/reflection/beam:free`，`api_base` 指向 shim |
| `bootstrap_gateway.py --create` | team `807777eb-4c42-4abf-a1ee-fb7f9aa57a18`，日预算 1.0 / 成员 0.1 |
| adapter 直连真实 provider（128） | 200，`{"intent":"show_analysis"}` |
| adapter 超上限（256） | 422 `output_cap_exceeded` |

跨机联调（从 `speaking-backend-1` 容器发起，经隧道走到本机 adapter）：

| 检查 | 结果 |
| --- | --- |
| 隧道监听 | `LISTEN 172.19.0.1:4400 users:(("sshd",...))` |
| 容器 → `GET /health` | `{"status":"ok"}` |
| 容器 → `/chat/completions`（128） | **200**，`content='{"intent":"show_analysis"}'`，usage 66/52（其中 reasoning 43） |
| 容器 → `/chat/completions`（256） | **422**，`max_tokens 256 exceeds the verified model output cap 128` |
| key spend | 0.0，`max_budget` 0.02，team 归属正确 |
| 隧道断开 | 监听消失，容器侧 `URLError [Errno 111] Connection refused` |

断开方向是 fail-closed：`teaching_gateway` 把 `httpx.HTTPError` 映射成 503
`SERVICE_UNAVAILABLE`（“教学模型连接中断，费用等待网关结算”），预算类错误映射成 429
`BUDGET_EXCEEDED`，其余非 2xx 映射成 502 `AI_SERVICE_UNAVAILABLE`，不会静默放行。

## 生产已指向网关

2026-11-04 19:31（本地）在生产执行，全部有备份：

- `/opt/speaking/docker-compose.prod.yml`：只在 `backend` 与 `celery` 的 environment 里补了
  `LLM_GATEWAY_BASE_URL` / `LLM_GATEWAY_API_KEY` / `LLM_GATEWAY_ADMIN_KEY` / `LLM_GATEWAY_V2_TEAM_ID`
  四行（备份 `/root/backups/compose-gateway.20261104192945.yml`）；
- `/opt/speaking/.env`：`LLM_GATEWAY_BASE_URL=http://172.19.0.1:4400`、`LITELLM_MASTER_KEY`、
  `LLM_GATEWAY_V2_TEAM_ID=807777eb-...`（备份 `/root/backups/env-gateway.20261104193110`）；
- `docker compose up -d` 重建 `backend` / `celery`，随后 `nginx -s reload`；`celery-beat` 未受影响。

验证：

```text
backend 容器 printenv: LLM_GATEWAY_BASE_URL=http://172.19.0.1:4400，GOVERNANCE_VERIFIED 未设（默认 false）
容器内 GET http://172.19.0.1:4400/health -> 200
/health -> {"status":"ok", database ok, redis ok}
login=200  api=200  backend healthy  celery Up
```

**这一步目前不改变任何线上行为**：V2 教学代码（`api/v1/teaching*`）尚未部署到生产，
`LLM_GATEWAY_GOVERNANCE_VERIFIED` 与 `TEACHING_RUNS_ENABLED` 都是默认 `false`，所以后端没有任何
调用会走到网关。网关配置属于提前就位。

## 隧道常驻

本机没有管理员权限，`schtasks` 创建计划任务被权限分类器拦下（属于持久化机制），所以采用
用户级启动项：

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SeeWord Gateway Tunnel.cmd
  -> powershell -WindowStyle Hidden -File deploy\v2-gateway\gateway_tunnel.ps1
```

脚本用 `C:\Windows\System32\OpenSSH\ssh.exe`、钥匙 `~/.ssh/gw_tunnel_ed25519`、日志
`~/.seeword/gateway-tunnel.log`，断线后 5 秒重连。当前进程已 detached 启动并验证：

```text
prod LISTEN 172.19.0.1:4400 users:(("sshd",...))
容器内 GET /health -> 200
本机 ssh 进程数（匹配 gwtunnel）: 1
```

局限：只在**登录后**启动，注销或重启需要重新登录；没有睡眠策略，合盖仍会断。

## 还没做

- `TEACHING_RUNS_ENABLED` 仍为 `false`，没有通过后端 `teaching_runs` 路径发起过真实 run；
- V2 教学 API 与迁移尚未部署，生产还没有消费者；
- 免费模型 spend 恒为 0，预算闸不产生约束，成本证据仍需付费模型 + 真实单价；
- 跨午夜 late settle、故障隔离、账本持久化仍未证明；
- 重启后的恢复链路：Docker Desktop 在 `HKCU:\...\Run` 里自启 → 网关容器 `restart: unless-stopped`
  自动起来 → 登录启动项拉起隧道。整条链只在**登录后**成立，没有睡眠策略。
