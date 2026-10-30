# 隔离环境脚本

只给基础设施改造的隔离验收用（当前：A07 Redis 恢复契约、A10 GPU 权限边界）。
环境边界、用例矩阵与放量/回滚步骤的唯一家是
[`docs/iteration-3-isolation-validation-2026-10-30.md`](../../docs/iteration-3-isolation-validation-2026-10-30.md)。

## 环境边界

| 项 | 取值 |
| --- | --- |
| compose 项目 | `seeword-isolation`（[`docker-compose.isolation.yml`](../../docker-compose.isolation.yml)） |
| Redis | `127.0.0.1:16379`，命名卷 `seeword-isolation_redisdata`，启动时加载渲染后的 ACL |
| Postgres（profile `pg`） | `127.0.0.1:15432/seeword_isolation` |
| 口令 | 一次性值：`ISOLATION_REDIS_PASSWORD`（default/cloud）、`ISOLATION_REDIS_GPU_PASSWORD`（gpu）、`ISOLATION_PG_PASSWORD` |

**不要**在隔离环境里填生产凭据；**不要**用 `docker system prune` 清理——用
`docker compose -p seeword-isolation -f docker-compose.isolation.yml --profile pg down -v`
（只回收本项目）。脚本每次开跑前也会先 `--profile pg down -v`，避免上一轮残留。

Redis 从 [`deploy/redis/users.acl.template`](../../deploy/redis/users.acl.template) 渲染出的
ACL 文件启动（密码不入库）。两个演练脚本会自动渲染；手工启动隔离栈前先跑：

```bash
REDIS_PASSWORD=isolation-only REDIS_GPU_PASSWORD=isolation-gpu-only \
  python scripts/isolation/render_redis_acl.py
```

本机 Docker 在 WSL 里，脚本默认用 `wsl -d Ubuntu-24.04 -- docker` 驱动容器；Linux 上直接
`docker`。可用 `A07_DOCKER` / `A10_DOCKER` 覆盖（例如 `A10_DOCKER=docker`）。

## A07：Redis 恢复契约

```bash
PYTHONUTF8=1 backend/.venv/Scripts/python.exe scripts/isolation/test_a07_redis_recovery.py
```

- 全量约 2 分钟；结果写 `docs/evidence/iteration-3/a07-<日期>.json`。
- `--cases A07-T3,A07-T6` 只跑指定用例（T6/T7 会自己拉起 `pg` profile）。
- `--keep` 保留现场，排查后手动 `--profile pg down -v`。
- 退出码：全部 PASS 为 0，有 FAIL 为 1。

## A10：GPU 服务端权限边界

```bash
PYTHONUTF8=1 backend/.venv/Scripts/python.exe scripts/isolation/test_a10_gpu_acl.py
```

- 全量约 2 分钟；结果写 `docs/evidence/iteration-3/a10-<日期>.json`。
- `--cases A10-T4,A10-T6` 只跑指定用例；`--keep` 保留现场。
- T2/T3/T8 需要回调接收器，脚本在 `127.0.0.1:18081` 自带一个；桩 worker 是
  [`gpu_stub_worker.py`](gpu_stub_worker.py)，只加载 Celery/kombu 与 `gpu_worker` 的纯配置，
  不加载 torch/whisperx。
- **T9（SSH 隧道限制）会记为 SKIP**：它验证的是生产宿主 sshd 的 `authorized_keys` /
  `PermitOpen`，隔离栈没有 sshd，D6 又禁止引入新镜像。脚本会把配置清单写进证据，
  放量窗口按清单在宿主上执行。

脚本会做真事：重启/删除容器、删命名卷、杀 worker、写一次性 PG 库。不要把它指向开发栈或
生产（端口与项目名都写死在脚本里）。
