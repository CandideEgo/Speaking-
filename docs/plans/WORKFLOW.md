# 开发工作流 — Speaking

> 独立开发者全生命周期工作流：从想法到上线
>
> 关联文档：[CONTRIBUTING.md](../../CONTRIBUTING.md) · [PRODUCTION.md](../operations/PRODUCTION.md) · [RUNBOOK.md](../operations/RUNBOOK.md) · [SECURITY.md](../operations/SECURITY.md)

---

## 1. 功能开发流程

### 三种开发模式

| 模式 | 触发条件 | 流程 | 耗时 |
|------|---------|------|------|
| **快速提交** | < 20 行，非关键路径（typo、config、docs） | 直接 commit master | 5 min |
| **标准开发** | 20-200 行，或涉及新 API/组件 | 分支 → 自检 → squash merge | 1-4 h |
| **对抗开发** | > 200 行，或涉及 auth/payment/跨模块 | `/adversarial-dev` 双 agent 审查 | 半天+ |

### 决策树

```
变更规模?
├─ < 20 行, 非关键路径 → 快速提交
│   └─ git commit -m "fix(scope): ..." → git push
├─ 20-200 行, 或新 API/组件 → 标准开发
│   └─ 分支 → 开发 → 自检清单 → squash merge → push
└─ > 200 行, 或 auth/payment/跨模块 → 对抗开发
    └─ /adversarial-dev → Builder 实现 → Gatekeeper 5 门审查 → 提交
```

### 标准开发流程

1. **影响分析** — `gitnexus_impact({target, direction: "upstream"})` 检查要修改的符号。HIGH/CRITICAL → 考虑改用对抗开发
2. **创建分支** — `git checkout -b feat/short-description`
3. **开发** — 遵循 CONTRIBUTING.md 规范。用 `gitnexus_query` 查找已有工具函数，避免重复
4. **自检清单**（合并前必做）：
   - [ ] `gitnexus_detect_changes({scope: "all"})` — 无意外影响
   - [ ] `cd backend && pytest tests/ -v` — 后端测试通过
   - [ ] `cd frontend && npm run check` — 前端检查通过
   - [ ] 无 CONTRIBUTING.md 第 6 节反模式
   - [ ] 提交信息含 scope + 需求 ID
   - [ ] diff 中无 .env 或密钥
5. **合并** — `git checkout master && git merge --squash feat/short-description && git commit`
6. **推送** — `git push origin master`

### 对抗开发流程

触发条件见第 6 节。完整流程见 `.claude/skills/adversarial-dev/SKILL.md`。

---

## 2. 代码质量门禁

### Pre-commit Hooks（自动执行）

| 门禁 | 时机 | 工具 | 阻断? |
|------|------|------|-------|
| Python lint | pre-commit | ruff | 是（auto-fix + 残留报错阻断） |
| Python format | pre-commit | ruff format | 是 |
| 前端 format | pre-commit | prettier | 是（auto-fix） |
| 行尾空白/大文件 | pre-commit | pre-commit-hooks | 是 |
| 私钥检测 | pre-commit | detect-private-key | 是 |
| 禁止直推 master | pre-commit | no-commit-to-branch | 是（`--no-verify` 绕过） |

### CI 门禁（push 后）

| 门禁 | 工具 | 阻断? |
|------|------|-------|
| Python lint | ruff check | 是 |
| Python format | ruff format --check | 是 |
| Python type check | mypy | 否（初期仅警告） |
| 后端测试 + 覆盖率 | pytest --cov | 是 |
| 前端 format | prettier --check | 是 |
| 前端 type check | tsc --noEmit | 是 |
| 前端 lint | next lint | 是 |
| 前端 build | next build | 是 |
| E2E 测试 | Playwright | 是 |

### 覆盖率策略

- 目标：30%（当前基线），逐步提升至 50%
- 重点覆盖：auth、payment、speaking evaluation、video pipeline
- CI 命令：`pytest --cov=app --cov-report=term-missing`

---

## 3. 提交与分支策略

### 分支命名

| 模式 | 示例 | 用途 |
|------|------|------|
| `feat/<desc>` | `feat/sm2-vocab-review` | 新功能 |
| `fix/<desc>` | `fix/jwt-expired-401` | Bug 修复 |
| `refactor/<desc>` | `refactor/speaking-service` | 重构 |
| `chore/<desc>` | `chore/add-ruff-linting` | 工具/CI/依赖 |
| `docs/<desc>` | `docs/deployment-workflow` | 文档 |

### 直接提交 master（允许）

- typo 修复（1-3 行）
- 文档更新
- 配置微调（.env.example、.gitignore）
- 紧急 hotfix（用 `--no-verify` 绕过 hook，事后手动验证）

### 提交信息格式

```
type(scope): description (REQ-ID)
```

- type: feat / fix / refactor / chore / docs / config
- scope: auth / video / subtitle / speaking / ai / vocab / payment / browse / mode / ui / api / db / infra
- REQ-ID: 需求 ID（feat/fix 必需，其他可选）

示例：
```
feat(vocab): add SM-2 review endpoint (L-02)
fix(auth): handle expired JWT in api.ts (U-02)
chore(infra): add ruff linting to CI
```

### Squash vs Preserve

- Feature 分支：**始终 squash merge** — 保持 master 线性历史
- Squash 后的 commit 信息应概括分支目的，不逐条罗列

### 版本标签

```bash
git tag -a v1.X.0 -m "release: description"
git push origin --tags
```

---

## 4. 测试策略

### 何时写测试

| 变更类型 | 测试要求 |
|---------|---------|
| 新 API 端点 | **必须**有至少 1 个测试（happy path） |
| Bug 修复 | **必须**有回归测试 |
| Service 层变更 | **应该**有单元测试 |
| 前端 hook/store | **应该**有单元测试（Vitest 配置后） |
| UI 组件变更 | E2E 测试（影响用户流程时） |
| 重构 | 现有测试必须仍通过 |
| 配置/infra 变更 | 无需测试 |

### 测试层级

| 层级 | 工具 | 当前状态 | 覆盖目标 |
|------|------|---------|---------|
| 后端单元 | pytest + aiosqlite | ~45 用例 | 60% services |
| 后端 API | pytest + httpx.AsyncClient | 部分 | 每个 endpoint |
| 前端单元 | Vitest（待配置） | 0 用例 | 关键 hooks/stores |
| 前端 E2E | Playwright | 6 spec 文件 | 5 核心流程 |

### 测试数据库

- 单元测试：SQLite in-memory（速度快）
- CI E2E：PostgreSQL（与生产一致）
- 未来可加 `pytest --pg` 标志对 PostgreSQL 运行

---

## 5. 部署流程

### 环境

| 环境 | Compose 文件 | 用途 | 数据 |
|------|-------------|------|------|
| 本地开发 | `docker-compose.dev.yml` | DB + Redis，应用原生运行 | 开发数据，可丢弃 |
| 全栈验证 | `docker-compose.yml` | 所有服务 Docker 化运行 | 开发数据，可丢弃 |
| 生产 | `docker-compose.prod.yml` | Nginx + Gunicorn + standalone | 真实数据，持久 |

### 发布流程

```bash
# 1. 本地验证
git checkout master && git pull
cd backend && pytest tests/ -v
cd frontend && npm run check
cd frontend && npx playwright test

# 2. 版本标记
git tag -a v1.X.0 -m "release: description"
git push origin master --tags

# 3. 部署到生产
ssh production-server
cd /opt/speaking
git pull
git checkout v1.X.0
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 4. 数据库迁移（如有）
docker exec -it $(docker ps -qf "name=backend") alembic upgrade head

# 5. 健康检查
curl https://api.your-domain.com/health

# 6. 监控确认
# - Sentry: 无新错误激增
# - Flower: Celery 任务正常
# - /metrics: Prometheus 指标正常
```

### 回滚

详见 [RUNBOOK.md](../operations/RUNBOOK.md) 第 1.2 节。

---

## 6. AI 辅助开发

### 工具选择

| 场景 | 工具 | 原因 |
|------|------|------|
| "X 怎么工作的？" | `gitnexus_query` + `gitnexus_context` | 找执行流，不只是文件匹配 |
| "改 X 会影响什么？" | `gitnexus_impact({target, direction: "upstream"})` | 修改前看影响范围 |
| "重命名 X" | `gitnexus_rename` | 理解调用图，比 find-replace 安全 |
| "调试 X 失败" | `/gitnexus-debugging` | 追踪执行流找根因 |
| "重构 X" | `/gitnexus-refactoring` | 影响感知重构 |
| "审查我的改动" | `/simplify-gitnexus` | 4 维度清理 + 风险评估 |
| "开发关键功能" | `/adversarial-dev` | 双 agent Builder/Gatekeeper 审查 |
| "验证改动生效" | `/verify` | 运行应用观察行为 |
| "重启前端" | `/dev-restart` | 清缓存 + 重启 |

### GitNexus-first 规则

1. 修改任何符号前，先运行 `gitnexus_impact` — 这是 CLAUDE.md 的强制规则
2. 提交前运行 `gitnexus_detect_changes` — 确认只影响预期符号
3. 探索不熟悉的代码，用 `gitnexus_query` 而不是 grep

### 对抗开发触发条件

**必须使用** `/adversarial-dev`：
- 修改 `backend/app/core/security.py`（auth）
- 修改 `backend/app/api/v1/payments.py`（payment）
- 修改 `backend/app/api/dependencies.py`（auth middleware）
- 变更涉及 > 3 个 API 路由文件
- 数据库迁移删除或重命名列

**推荐使用**：
- 新 API 端点处理用户输入
- Celery 任务逻辑变更
- 跨切面重构

---

## 7. 任务与问题管理

### 系统：GitHub Issues + 最小标签

| 标签 | 颜色 | 用途 |
|------|------|------|
| `bug` | 红 | 确认的 bug |
| `feature` | 蓝 | 新功能/增强 |
| `refactor` | 紫 | 代码质量改进 |
| `security` | 橙 | 安全相关 |
| `blocked` | 黄 | 等待外部依赖 |

### 任务流程

```
1. 创建 Issue
   标题: [scope] 简述 (如 "[speaking] add auto-switch to next subtitle")
   添加标签 + 引用需求 ID

2. 本地开发
   分支名: feat/desc-42 (42 = Issue 编号)
   提交: feat(scope): description (L-02, #42)

3. 完成时
   提交含 "Closes #42" 或 "Fixes #42"
   Push 后 GitHub 自动关闭 Issue
```

### 周回顾（5 分钟）

- 检查 open Issues — 关闭过期的
- 更新 PROGRESS.md（如有进展）
- 检查 Sentry 新错误

---

## 附录 A: 工具配置清单

### Step 1: Python 工具（15 min）

```bash
cd backend
pip install -r requirements-dev.txt

# 验证
ruff check app/ tests/ --statistics
ruff format app/ tests/ --check
mypy app/ --ignore-missing-imports
```

### Step 2: 前端工具（10 min）

```bash
cd frontend
npm install --save-dev prettier
npm run format
npm run format:check
```

### Step 3: Pre-commit hooks（10 min）

```bash
# 项目根目录
pip install pre-commit
pre-commit install
pre-commit install --hook-type pre-push
pre-commit run --all-files    # 验证
```

### Step 4: Git 配置（5 min）

```bash
# 统一行尾
git config --global core.autocrlf input

# GitHub 仓库设置（Web UI）:
# - master: 要求 status checks (backend, frontend)
# - 允许 owner force push（hotfix 需要）
# - 无 PR 审查要求（solo dev）
```

---

## 附录 B: 快速参考卡

```
═══════════════════════════════════════
  Speaking 开发快速参考
═══════════════════════════════════════

开发模式:
  < 20 行, 非关键 → 直接提交 master
  20-200 行       → feat/ 分支 + 自检清单
  > 200 行 或 auth/payment → /adversarial-dev

提交前必做:
  1. gitnexus_impact → 检查影响范围
  2. pre-commit 自动运行 (ruff, prettier)
  3. pytest tests/ -v (后端)
  4. npm run check (前端)

提交格式:
  type(scope): description (REQ-ID)
  例: feat(vocab): add SM-2 review (L-02)

部署:
  git tag → ssh prod → git pull → build → up -d
  alembic upgrade head (如有 DB 变更)

回滚:
  git checkout <prev-tag> → build → up -d
  alembic downgrade -1 (如需)

AI 工具:
  /adversarial-dev    关键功能
  /simplify-gitnexus  代码审查
  gitnexus_impact     修改前检查
  gitnexus_detect     提交前验证
═══════════════════════════════════════
```
