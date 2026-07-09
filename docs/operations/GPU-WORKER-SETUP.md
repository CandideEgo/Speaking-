# GPU Worker 常驻设置（DEV-FLOW 2026-07 Phase B3）

本机（Windows + GPU）作为远程 GPU worker，消费云端 `transcription_gpu` 队列做 WhisperX 转录，结果 HTTP 回调云端。`start_gpu_worker.py`（Celery `--pool=solo` + 60s 心跳）已就绪；本 runbook 补"常驻层"：SSH 隧道保活 + 两个 Windows 服务（开机自启 + 崩溃重启）。

> 架构依据：`docs/adr/` GPU 转录拆分（head/GPU/tail）；prod Redis 绑 `127.0.0.1:6379`（loopback，专为隧道设计）。

## 拓扑

```
本机 GPU worker (Celery, .venv)
  ├── 读 Redis @ 127.0.0.1:16379  ──(ssh -L 16379:127.0.0.1:6379)──> 云端 Redis (Docker, loopback)
  ├── 消费 transcription_gpu 队列
  └── POST 转录结果 ──> https://seeword.top/api/v1/internal/transcription/callback ──> HK VPS (SSL) ──> 云端 backend
```

- 本地端口用 **16379**（不是 6379），避免与本机 dev Redis（`docker-compose.dev.yml` 暴露 6379）冲突。
- GPU worker **无 DB、无 OSS 凭证**（split 架构），只连 Redis + 回调云端。

## 前置条件

1. **SSH 免密**：本机能 `ssh seeword` 免密登录云端（`~/.ssh/config` 已配别名 `seeword` -> `admin@47.122.127.105`）。若未配密钥：
   ```powershell
   ssh-keygen -t ed25519            # 回车用默认，空 passphrase
   # 把公钥追加到云端 authorized_keys：
   type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh seeword "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
   ssh seeword "echo ok"            # 应免密输出 ok
   ```
2. **Python venv**（已存在 `backend/.venv`）：需装 cloud 依赖（无 torch/whisperx 在 cloud requirements？GPU worker 要 torch+whisperx）：
   ```powershell
   cd backend
   .venv\Scripts\pip install -r requirements-cloud.txt   # 或手动装 torch faster-whisper whisperx
   ```
   > 注：`requirements-cloud.txt` 排除 torch/whisperx（省体积）。GPU worker 本机需单独装 `torch`（CUDA）+ `faster-whisper` + `whisperx` + `pyannote.audio`。见 `backend/.env.example` Whisper 段。
3. **GPU + CUDA**：`nvidia-smi` 可用，torch 能识别 CUDA（`python -c "import torch; print(torch.cuda.is_available())"` -> True）。
4. **NSSM**（未预装）：下载放到固定目录：
   ```powershell
   mkdir C:\Tools -Force
   # 从 https://nssm.cc/release/nssm-2.24.zip 下载，解压 nssm.exe 到 C:\Tools\nssm\
   # 或：scoop install nssm   （若装了 scoop）
   C:\Tools\nssm\nssm.exe version   # 验证
   ```

## 步骤

### 1. 创建 `.env.gpu-worker`（填真实密钥，gitignored）

```powershell
cd backend
copy .env.gpu-worker.example .env.gpu-worker
# 从云端取两个密钥（不提交）：
ssh seeword "grep -E '^(REDIS_PASSWORD|TRANSCRIPTION_CALLBACK_SECRET)=' ~/seeword/.env"
# 把输出的值填进 .env.gpu-worker 的 CHANGE_ME_REDIS_PASSWORD / CHANGE_ME_CALLBACK_SECRET
notepad .env.gpu-worker
```

确认 `TRANSCRIPTION_CALLBACK_URL` 指向 `https://seeword.top/api/v1/internal/transcription/callback`（HK VPS 反代到云端）。

### 2. 先手动跑通（不注册服务前验证）

```powershell
# 终端 A：起隧道
powershell -ExecutionPolicy Bypass -File scripts\gpu_worker_tunnel.ps1
# 终端 B：起 worker
powershell -ExecutionPolicy Bypass -File scripts\run_gpu_worker.ps1
```

验证：
- `ssh seeword "docker exec seeword-db-1 redis-cli -a <pw> LLEN transcription_gpu"` 队列可读。
- 管理端 `/admin/worker-status` -> `worker_online: true`（心跳 `worker:gpu:heartbeat` TTL 90s）。
- 提交一个视频触发转录，看 worker 日志是否消费 + 回调成功。

### 3. 注册隧道服务（`SeeWordGpuTunnel`）

```powershell
# 用管理员 PowerShell
$nssm = "C:\Tools\nssm\nssm.exe"
& $nssm install SeeWordGpuTunnel powershell.exe -ExecutionPolicy Bypass -NoProfile -File "C:\Users\Administrator\Speaking\backend\scripts\gpu_worker_tunnel.ps1"
& $nssm set SeeWordGpuTunnel AppDirectory "C:\Users\Administrator\Speaking\backend"
& $nssm set SeeWordGpuTunnel Start SERVICE_AUTO_START
& $nssm set SeeWordGpuTunnel AppStdout "C:\Users\Administrator\Speaking\backend\logs\gpu-tunnel.log"
& $nssm set SeeWordGpuTunnel AppStderr "C:\Users\Administrator\Speaking\backend\logs\gpu-tunnel.log"
& $nssm set SeeWordGpuTunnel AppRotateFiles 1
& $nssm set SeeWordGpuTunnel AppRotateBytes 5242880
Start-Service SeeWordGpuTunnel
Get-Service SeeWordGpuTunnel     # Status = Running
```

### 4. 注册 worker 服务（`SeeWordGpuWorker`）

```powershell
& $nssm install SeeWordGpuWorker powershell.exe -ExecutionPolicy Bypass -NoProfile -File "C:\Users\Administrator\Speaking\backend\scripts\run_gpu_worker.ps1"
& $nssm set SeeWordGpuWorker AppDirectory "C:\Users\Administrator\Speaking\backend"
& $nssm set SeeWordGpuWorker Start SERVICE_AUTO_START
& $nssm set SeeWordGpuWorker DependOnService SeeWordGpuTunnel   # 隧道先起
& $nssm set SeeWordGpuWorker AppStdout "C:\Users\Administrator\Speaking\backend\logs\gpu-worker.log"
& $nssm set SeeWordGpuWorker AppStderr "C:\Users\Administrator\Speaking\backend\logs\gpu-worker.log"
& $nssm set SeeWordGpuWorker AppRotateFiles 1
& $nssm set SeeWordGpuWorker AppRotateBytes 5242880
Start-Service SeeWordGpuWorker
Get-Service SeeWordGpuWorker     # Status = Running
```

### 5. 验证常驻

```powershell
Get-Service SeeWordGpuTunnel, SeeWordGpuWorker   # 两个都 Running
# 管理端 /admin/worker-status -> worker_online: true
# /admin/stats -> gpu_queue_depth 反映队列；videos_by_status 看 processing->ready
# 故意杀 worker 进程，NSSM 应自动重启：
Stop-Process -Name python -Force     # 谨慎：会杀所有 python（含 dev 后端）
```

## 运维

- **日志**：`backend/logs/gpu-tunnel.log`、`backend/logs/gpu-worker.log`（NSSM 轮转 5MB）。
- **改配置**：编辑 `.env.gpu-worker` 后 `Restart-Service SeeWordGpuWorker`。
- **停服**：`Stop-Service SeeWordGpuWorker, SeeWordGpuTunnel`。
- **卸载**：`& $nssm remove SeeWordGpuWorker confirm`、`& $nssm remove SeeWordGpuTunnel confirm`。

## 排错

| 现象 | 排查 |
|---|---|
| `worker_online: false` | worker 服务没起 / 心跳没写到云端 Redis。查 `gpu-worker.log`；确认隧道在跑（`Get-Service SeeWordGpuTunnel`）且 `127.0.0.1:16379` 通（`Test-NetConnection 127.0.0.1 -Port 16379`）。 |
| 隧道起不来 | 本地 16379 被占（`netstat -ano | findstr 16379`）；或 SSH key 未免密。`ExitOnForwardFailure=yes` 会让 ssh 立即退出，看 `gpu-tunnel.log`。 |
| 回调 401/403 | `TRANSCRIPTION_CALLBACK_SECRET` 与云端 `.env` 不一致；或 URL 不对（应走 `seeword.top`，云端 `/api/v1/internal/transcription/callback` 校验 secret）。 |
| 回调连不上 | 本机到 `seeword.top` 不通（DNS/网络）；可临时直连云端 IP 调试：`TRANSCRIPTION_CALLBACK_URL=http://47.122.127.105/api/v1/internal/transcription/callback`（仅调试，明文传 secret 不安全）。 |
| torch 看不到 CUDA | `nvidia-smi` 驱动版本与 CUDA 不匹配；重装匹配的 `torch`（`pip install torch --index-url https://download.pytorch.org/whl/cu121`）。 |
| OOM | `WHISPERX_BATCH_SIZE` 降到 1-2；`WHISPERX_COMPUTE_TYPE=int8`（约半 VRAM，小幅掉点）；`WHISPER_MAX_CONCURRENT_CHUNKS=1`。 |

## 后续迁移触发条件（DEV-FLOW B3 rationale）

prod 转录依赖个人 Windows 机器是已知脆性。当**转录量日均 > N 且常驻不稳定**，或**个人机无法 24h 在线**时，迁 Linux GPU VPS + systemd（`start_gpu_worker.py` 同一套代码，换 systemd unit + 直连 Redis，免隧道）。当前为分阶段决策，未达 ADR"难逆转"门槛。
