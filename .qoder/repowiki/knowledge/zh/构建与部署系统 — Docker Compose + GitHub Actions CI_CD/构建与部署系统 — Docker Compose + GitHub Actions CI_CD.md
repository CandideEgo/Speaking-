---
kind: build_system
name: 构建与部署系统 — Docker Compose + GitHub Actions CI/CD
category: build_system
scope:
    - '**'
source_files:
    - docker-compose.yml
    - docker-compose.prod.yml
    - backend/Dockerfile
    - backend/Dockerfile.cloud
    - frontend/Dockerfile
    - frontend/Dockerfile.prod
    - .github/workflows/ci.yml
    - nginx.conf
    - nginx.ssl.conf
    - .pre-commit-config.yaml
    - backend/pyproject.toml
    - backend/requirements.txt
    - backend/requirements-dev.txt
    - backend/requirements-cloud.txt
    - frontend/package.json
---

## 1. 构建系统与工具链

本项目采用 **多容器编排 + 分层镜像** 的构建方式，核心工具如下：
- **后端（Python/FastAPI）**：Docker 多阶段构建（`backend/Dockerfile`），使用 `python:3.12-slim` 基础镜像，预缓存 faster-whisper 和 WhisperX 模型以加速启动。
- **前端（Next.js）**：`frontend/Dockerfile` 基于 `node:20-alpine`，生产构建使用 `frontend/Dockerfile.prod`。
- **编排**：根目录 `docker-compose.yml`（开发）、`docker-compose.prod.yml`（生产）统一编排 PostgreSQL、Redis、后端、Celery worker、Flower、Nginx、前端。
- **CI/CD**：GitHub Actions（`.github/workflows/ci.yml`）在 push/PR 到 master/main 时触发，包含后端 lint/format/mypy/pytest、前端 typecheck/lint/build、以及端到端 Playwright 测试。
- **反向代理**：Nginx（`nginx.conf` / `nginx.ssl.conf`）统一对外暴露 80/443，转发 `/api` 到后端、`/media` 带缓存、`/` 到前端。

## 2. 关键文件与职责

| 文件 | 作用 |
|---|---|
| `docker-compose.yml` | 开发环境：Postgres + Redis + backend(dev) + celery + frontend(dev) |
| `docker-compose.prod.yml` | 生产环境：Gunicorn + Celery worker/beat + Flower + Nginx + 静态资源卷 |
| `backend/Dockerfile` | 后端完整镜像（含 whisper/whisperx 模型预下载） |
| `backend/Dockerfile.cloud` | 轻量镜像（不含 GPU 依赖，用于无 GPU 的云服务器） |
| `frontend/Dockerfile` / `frontend/Dockerfile.prod` | 前端开发与生产镜像 |
| `.github/workflows/ci.yml` | CI 流水线：lint → format → mypy → pytest → e2e |
| `nginx.conf` / `nginx.ssl.conf` | 反向代理、限流、WebSocket、媒体缓存 |
| `.pre-commit-config.yaml` | pre-commit 钩子：ruff + prettier + 通用检查 |
| `backend/pyproject.toml` | Ruff、Mypy、Pytest 配置 |
| `backend/requirements*.txt` | Python 依赖（标准版与 cloud 精简版） |
| `frontend/package.json` | Node 依赖与脚本（dev/build/start/lint/typecheck/format/test:e2e） |

## 3. 架构与约定

### 镜像分层策略
- 后端采用双阶段构建：builder 安装依赖并预下载 AI 模型，runtime 仅拷贝必要文件，显著减小最终镜像体积。
- 提供两套后端镜像：`Dockerfile`（含 GPU/Whisper 依赖，适合本地或 GPU 节点）与 `Dockerfile.cloud`（剔除 torch/whisperx，节省 ~1GB+ 镜像大小与构建时间）。

### 服务编排约定
- 所有服务通过环境变量注入敏感信息（JWT_SECRET、DB_*、REDIS_PASSWORD、OPENAI_API_KEY 等），禁止硬编码。
- 数据库与 Redis 均配置 healthcheck，确保依赖就绪后再启动上层服务。
- 生产环境使用 Gunicorn + UvicornWorker 运行 FastAPI，Celery worker 仅消费默认队列，GPU 转录由远程 worker 通过 SSH 隧道连接 Redis broker。

### CI 质量门禁
- 后端：Ruff lint/format + Mypy baseline（`.mypy-baseline` 记录已知类型错误，新增错误直接阻断 PR）+ Pytest（含覆盖率）。
- 前端：TypeScript 类型检查 + ESLint + Prettier 格式检查 + Next.js 构建。
- E2E：启动真实 Postgres/Redis + 后端 uvicorn + 前端 next dev，用 Playwright 执行浏览器自动化测试。

### 代码提交前检查
- pre-commit 自动执行 ruff（后端）与 prettier（前端），并检查尾随空格、YAML 语法、大文件与私钥泄露。

## 4. 开发者应遵循的规则

1. **依赖管理**：后端依赖变更需同步更新 `requirements.txt` 与 `requirements-dev.txt`；cloud 环境使用 `requirements-cloud.txt`。
2. **镜像构建**：新增系统依赖需在两个 Dockerfile 中分别声明（builder 与 runtime 阶段）。
3. **环境变量**：所有密钥通过 `.env` 或 shell 环境变量注入，参考 `.env.example`。
4. **迁移**：生产镜像入口 `entrypoint.sh` 会在启动时自动执行 `alembic upgrade head`，无需手动迁移。
5. **CI 门禁**：提交前确保 `ruff check/format`、`mypy`、`pytest`、`npm run check` 全部通过；新增 mypy 错误需同步更新 `.mypy-baseline`。
6. **Nginx 路由**：新增 API 路径需在 `nginx.conf` 中配置对应 location，注意 WebSocket 升级头与限流规则。
7. **前端脚本**：使用 `package.json` 中定义的脚本进行开发/构建/测试，不要绕过 npm scripts。
