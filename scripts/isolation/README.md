# 隔离环境脚本

只给基础设施改造的隔离验收用（当前：A07 Redis 恢复契约；A10 GPU ACL 之后加在这里）。
环境边界、用例矩阵与放量/回滚步骤的唯一家是
[`docs/iteration-3-isolation-validation-2026-10-30.md`](../../docs/iteration-3-isolation-validation-2026-10-30.md)。

## 环境边界

| 项 | 取值 |
| --- | --- |
| compose 项目 | `seeword-isolation`（[`docker-compose.isolation.yml`](../../docker-compose.isolation.yml)） |
| Redis | `127.0.0.1:16379`，命名卷 `seeword-isolation_redisdata` |
| Postgres（profile `pg`） | `127.0.0.1:15432/seeword_isolation` |
| 密码 | 一次性值，默认 `isolation-only`，可用 `ISOLATION_REDIS_PASSWORD` / `ISOLATION_PG_PASSWORD` 覆盖 |

**不要**在隔离环境里填生产凭据；**不要**用 `docker system prune` 清理——用
`docker compose -p seeword-isolation -f docker-compose.isolation.yml --profile pg down -v`
（只回收本项目）。脚本每次开跑前也会先 `--profile pg down -v`，避免上一轮残留污染 T1。

## A07：Redis 恢复契约

本机 Docker 在 WSL 里，脚本默认用 `wsl -d Ubuntu-24.04 -- docker` 驱动容器；Linux 上直接
`docker`。可用 `A07_DOCKER` 覆盖（例如 `A07_DOCKER=docker`）。

```bash
PYTHONUTF8=1 backend/.venv/Scripts/python.exe scripts/isolation/test_a07_redis_recovery.py
```

- 全量约 2 分钟；结果写 `docs/evidence/iteration-3/a07-<日期>.json`。
- `--cases A07-T3,A07-T6` 只跑指定用例（T6/T7 会自己拉起 `pg` profile）。
- `--keep` 保留现场（Redis/PG 容器与卷），排查后手动 `--profile pg down -v`。
- 退出码：全部 PASS 为 0，有 FAIL 为 1。

脚本会做真事：重启/删除容器、删命名卷、SIGKILL、写一次性 PG 库。不要把它指向开发栈或生产
（端口与项目名都写死在脚本里，改之前先读
[`test_a07_redis_recovery.py`](test_a07_redis_recovery.py) 顶部的常量说明）。
