---
kind: dependency_management
name: 依赖管理：Python/Node.js 双栈依赖声明、锁定与 CI 集成
category: dependency_management
scope:
    - '**'
source_files:
    - backend/requirements.txt
    - backend/requirements-dev.txt
    - backend/requirements-cloud.txt
    - backend/pyproject.toml
    - frontend/package.json
    - frontend/package-lock.json
    - .pre-commit-config.yaml
    - .github/workflows/ci.yml
    - backend/.dockerignore
---

## 1. 使用的系统与工具
- **后端（Python/FastAPI）**：使用 `pip` + `requirements.txt` 声明运行时依赖，`requirements-dev.txt` 声明开发/测试依赖，`requirements-cloud.txt` 为云环境精简版依赖；通过 `pyproject.toml` 配置 ruff、mypy、pytest 等工具链。
- **前端（Next.js/React）**：使用 `npm` + `package.json` 声明依赖，`package-lock.json` 锁定精确版本。
- **CI/CD**：GitHub Actions (`github/workflows/ci.yml`) 在 Python 3.12 和 Node.js 20 环境下安装依赖并执行 lint/typecheck/test/build。
- **本地钩子**：`.pre-commit-config.yaml` 集成 ruff（Python）与 prettier（前端），保证提交前代码风格一致。

## 2. 关键文件与位置
- `backend/requirements.txt` — 生产运行时依赖（FastAPI、SQLAlchemy、Celery、OpenAI、WhisperX、阿里云 OSS/SMS 等）
- `backend/requirements-dev.txt` — 测试与开发工具（pytest、ruff、mypy、bandit、pip-audit、pre-commit、playwright）
- `backend/requirements-cloud.txt` — 云部署精简依赖（剔除 GPU/transcription 包）
- `backend/pyproject.toml` — ruff/mypy/pytest 配置，目标 Python 3.12
- `frontend/package.json` — Next.js/React/Tailwind/Playwright 等依赖声明
- `frontend/package-lock.json` — npm 锁文件，固定所有子依赖版本
- `.pre-commit-config.yaml` — pre-commit 钩子（ruff、prettier、trailing-whitespace、detect-private-key 等）
- `.github/workflows/ci.yml` — CI 中安装依赖、lint、typecheck、test、build 的完整流程
- `backend/.dockerignore` — Docker 构建排除 .venv/node_modules/tests 等，避免污染镜像

## 3. 架构与约定
- **分层依赖策略**：`requirements.txt`（运行）、`requirements-dev.txt`（开发/测试）、`requirements-cloud.txt`（云环境最小化）三者分离，确保不同部署场景只安装必要包。
- **版本锁定方式**：Python 侧对核心库使用 `==` 精确锁定（如 fastapi==0.111.0、uvicorn==0.29.0），对更新频繁的库使用 `>=` 宽松约束（如 yt-dlp>=2025.0.0、alibabacloud_dysmsapi20170525>=3.0.0）；前端使用 `^` 语义化版本 + `package-lock.json` 锁定。
- **无 vendoring**：未使用 pipenv/poetry 或 `vendor/` 目录，依赖直接由 pip/npm 从 PyPI/registry.npmmirror.com 拉取。
- **安全扫描集成**：`requirements-dev.txt` 包含 `pip-audit` 和 `bandit`，可在本地或 CI 中扫描已知漏洞。
- **Docker 隔离**：`Dockerfile` 与 `Dockerfile.cloud` 分别基于对应 requirements 安装依赖，`.dockerignore` 排除虚拟环境和 node_modules。

## 4. 开发者应遵循的规则
- **新增依赖**：仅添加到对应环境的 requirements 文件或 `package.json`，不要手动修改 lock 文件以外的版本；Python 核心库优先用 `==` 锁定，易变库用 `>=` 并加注释说明原因。
- **依赖更新**：先更新 `requirements*.txt` / `package.json`，再运行 `pip install -r backend/requirements-dev.txt` 或 `npm ci` 验证，必要时同步更新 `requirements-cloud.txt`。
- **提交前检查**：必须通过 pre-commit 钩子（ruff + prettier），CI 会再次执行 ruff check/format、mypy baseline 校验、tsc 类型检查与 npm build。
- **安全审计**：定期运行 `pip-audit -r backend/requirements*.txt` 与 `bandit -r backend/app`，发现漏洞及时升级或替换依赖。
- **环境变量隔离**：`.env` 文件已被 `.dockerignore` 排除，敏感配置（JWT_SECRET、DATABASE_URL、REDIS_URL 等）通过 CI 环境变量注入，不得硬编码到依赖文件中。
