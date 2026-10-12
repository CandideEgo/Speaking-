# AGENTS.md — backend

> 后端（`backend/`）专属操作约束。根 [`AGENTS.md`](../AGENTS.md) 管路由与跨域规则，本文件只管
> 「在这台机器上怎么把后端跑对」——就近分层，不复制根文件。
> 单个对象的身份、契约和改动后果由项目的对象认知 skill 按需提供，不复制到本文件。

## 环境与运行

| 约束 | 原因 |
|---|---|
| 每个 Python 服务都带 `PYTHONUTF8=1`（backend / celery / GPU worker） | Windows Python 对未显式传 `encoding` 的 `open()` 走 OS locale（中文 Windows 上是 GBK），而应用假设 UTF-8（生产跑 Linux）。缺了它后端**启动即崩**：slowapi 的 `Limiter` 经 starlette `Config` 按 locale 读 `.env`，撞上 UTF-8 的 em-dash 与中文 `ALIYUN_SMS_SIGN_NAME`，报 `UnicodeDecodeError: 'gbk' codec` |
| 显式用 `backend/.venv/Scripts/python.exe` | 只有这个 venv 装了 whisperx 与 torch+CUDA；GPU worker 共用它。系统 Python 跑不起来，也不代表代码有问题 |
| 解释器不可用时如实报告，不要换一个猜 | 本机沙箱常无可用 Python；跑不了的检查就写「未执行」，不写成通过 |

启动 / 停止 / 端口清理的完整步骤见 [`.agents/skills/speaking-dev/SKILL.md`](../.agents/skills/speaking-dev/SKILL.md)。

## 测试与检查

| 约束 | 原因 |
|---|---|
| pytest 配置**只**写在 `pytest.ini`；不要在 `pyproject.toml` 里加 `[tool.pytest.ini_options]` | `pytest.ini` 优先。两边同时存在时 pytest 只警告一句「ignoring pytest config in pyproject.toml」就**静默丢掉** `addopts`，`--timeout=60` 一丢，一个卡在断连 TCP 上的测试会烧掉整个 CI job 预算。真要挪回去，就在同一次改动里删掉 `pytest.ini` |
| ruff 口径：`line-length = 120`、`target-version = py312`；AI 调用必须走 service 层 | `TID251` 的 `banned-api` 禁掉直接 `import openai`（INV-005）。白名单只有 `services/ai_service.py`、`services/translation/*` 与一个一次性运维脚本 |
| mypy 是 **baseline 门，不是无错门** | CI 只拦 `backend/.mypy-baseline` 之外的**新增** `file:code` 对。修掉存量要顺手把基线调低；不要为了让新错误过门而往基线里加行 |
| 覆盖率门 `--cov-fail-under=60`；`integration` 标记的测试真连 Postgres | `test_celery_tasks_pg.py` 用真库验 `with_for_update` / `skip_locked` 行锁语义——SQLite 会**静默忽略**行锁，所以那条路径不能只靠默认的 SQLite 套件 |
| `pip-audit` 是硬门，豁免要带复核日期 | 豁免写在 `backend/.pip-audit-ignore`，日期过期即失败：被接受的公告必须**重新论证**，不能继承 |

## 迁移与部署

| 约束 | 原因 |
|---|---|
| **迁移只由 backend 容器跑**：celery 与 celery-beat 是 `RUN_MIGRATIONS=0` | 三容器并发 `alembic upgrade head` 会撞唯一约束（[deploy-failure-modes](../knowledge/wiki/problems/deploy-failure-modes.md) 第 1 条）。容器入口按 `RUN_MIGRATIONS` 门控，默认不迁移 |
| 生产 `ENV` 漏配即按 dev 形态运行 | `ENV` 默认 `development`：支付签名旁路 + mock 支付路由 + 无 HSTS/CSP。部署后必须核对（`.agent/state.md` 的 DEC-051 残留） |

## 与根文件的分工

- 根 [`AGENTS.md`](../AGENTS.md) 的「代码域 → 该读的冷仓叙述」表**保留**（它服务全部任务）；
  本文件只承接后端专属的操作约束，不复制那张表。
- 后端切片、跨 owner 契约文件与并行协议：[`.agent/owners.md`](../.agent/owners.md)。
- 后端服务层的设计意图：[backend-services](../knowledge/wiki/architecture/backend-services.md)。
- 怎么跑、怎么测、已知陷阱：[testing](../knowledge/wiki/guides/testing.md)。
