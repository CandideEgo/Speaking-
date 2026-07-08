# 贡献指南 — SeeWord

> AI 驱动的英语口语学习应用

感谢你对 SeeWord 项目的关注！本文档介绍如何参与项目开发。

---

## 1. 开发环境搭建

### 1.1 前置依赖

- Python 3.10+
- Node.js 18+ & npm
- Docker & Docker Compose
- PostgreSQL 16（或使用 Docker）
- Redis 7（或使用 Docker）
- ffmpeg（视频/音频处理）

### 1.2 启动基础设施

数据库和 Redis 通过 Docker 运行，应用服务在本地原生运行：

```bash
docker compose -f docker-compose.dev.yml up -d   # 仅启动 DB + Redis
```

### 1.3 启动应用服务

分别在不同的终端中运行：

```bash
# 后端 API
cd backend && uvicorn app.main:app --reload --port 8000

# 前端
cd frontend && npm run dev

# Celery 异步任务（视频处理、字幕生成等）
cd backend && celery -A app.tasks.celery_app worker --loglevel=info
```

### 1.4 环境变量

复制 `.env.example` 并填写实际值：

```bash
cp backend/.env.example backend/.env
```

**绝对不要提交 `.env` 文件**——它已被 `.gitignore` 忽略，包含 API 密钥等敏感信息。

### 1.5 全栈 Docker（可选）

如需在 Docker 中运行完整开发环境：

```bash
docker compose up -d
```

---

## 2. 代码风格

### 2.1 后端（Python / FastAPI）

- **全异步**：所有数据库操作和 API 路由必须使用 `async/await`，使用 SQLAlchemy async session
- **路由模块化**：新增 API 路由放在 `backend/app/api/v1/` 下，按功能模块拆分文件（如 `auth.py`、`videos.py`、`speaking.py`）
- **类型注解**：所有函数参数和返回值必须有类型注解
- **依赖注入**：使用 FastAPI 的 `Depends` 机制（如 `get_current_user`、`get_db`）
- **模型层**：SQLAlchemy 模型放在 `backend/app/models/`，按业务实体拆分

### 2.2 前端（Next.js / React / TypeScript）

- **函数式组件**：只使用函数式组件 + Hooks，不使用 class 组件
- **Tailwind CSS**：只使用 Tailwind 工具类进行样式编写，**禁止 CSS-in-JS**（styled-components、emotion 等）
- **状态管理**：跨组件共享状态使用 Zustand（`frontend/src/stores/`），局部状态使用 `useState` / `useReducer`
- **App Router**：使用 Next.js 14 App Router，页面放在 `app/` 目录下
- **组件组织**：组件放在 `frontend/src/components/` 下，按功能分类

---

## 3. 提交格式

### 3.1 Conventional Commits

从现在起采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>
```

**type 类型**：

| 类型 | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变功能） |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响逻辑） |
| `test` | 测试相关 |
| `chore` | 构建、依赖、CI 等辅助变更 |
| `perf` | 性能优化 |

**scope 范围**（按模块）：

| scope | 说明 |
|---|---|
| `auth` | 用户认证 |
| `video` | 视频处理 |
| `subtitle` | 字幕系统 |
| `speaking` | 口语练习 |
| `ai` | AI 功能 |
| `vocab` | 词汇本 |
| `payment` | 支付与变现 |
| `browse` | 浏览与社区 |
| `mode` | 学习模式 |
| `ui` | 前端界面/交互 |
| `api` | 后端 API 层 |
| `db` | 数据库/模型 |
| `infra` | 基础设施/CI/部署 |

### 3.2 需求 ID 引用

提交信息应引用 `docs/api/REQUIREMENTS.md` 中的需求 ID，以便追踪：

```
feat(speaking): add auto-switch to next subtitle after scoring (W-09)
fix(video): handle duplicate source_url race condition (V-06)
refactor(ai): extract shared prompt builder for pronunciation feedback (P-04, P-06)
```

需求 ID 前缀对照：

| 前缀 | 模块 |
|---|---|
| `U-` | 用户系统 |
| `V-` | 视频处理 |
| `S-` | 字幕系统 |
| `P-` | 口语练习 |
| `A-` | AI 功能 |
| `L-` | 学习记录 |
| `M-` | 学习模式 |
| `B-` | 内容发现 |
| `PAY-` | 支付与变现 |
| `H-` | 页面与交互 |
| `W-` | 观看页交互 |
| `N-` | 非功能需求 |

### 3.3 示例

```bash
# 好的提交
feat(vocab): add SM-2 spaced repetition review endpoint (L-02)
fix(auth): return 401 instead of 500 on expired JWT (N-05)
refactor(speaking): extract scoring logic into SpeakingService (P-04)
test(video): add integration tests for Celery video processing (V-01)
chore(infra): upgrade faster-whisper to latest version

# 不好的提交
update stuff
fix bug
WIP
```

---

## 4. 分支与 PR 流程

### 4.1 分支命名

```
<type>/<short-description>
```

示例：

- `feat/sm2-vocab-review`
- `fix/jwt-expired-401`
- `refactor/speaking-service`

### 4.2 开发流程

1. 从 `master` 创建功能分支
2. 在功能分支上开发，遵循提交格式
3. 确保所有测试通过
4. 推送分支并创建 Pull Request
5. 代码审查通过后合并

### 4.3 PR 描述模板

```markdown
## 变更说明
<!-- 简要描述本 PR 做了什么 -->

## 关联需求
<!-- 引用 REQUIREMENTS.md 中的 ID，如 W-09, P-04 -->

## 测试
<!-- 说明如何测试本变更 -->

## 检查清单
- [ ] 后端测试通过 (`pytest tests/ -v`)
- [ ] 前端检查通过 (`npx tsc --noEmit && npm run lint && npm run build`)
- [ ] 无 `.env` 或敏感信息提交
- [ ] 提交信息符合 Conventional Commits 规范
```

---

## 5. 测试要求

### 5.1 后端测试

```bash
cd backend && pytest tests/ -v
```

- 新增 API 端点必须附带测试
- 使用 `httpx.AsyncClient` 进行异步 API 测试
- 测试文件放在 `backend/tests/` 下，结构与 `app/api/v1/` 对应

### 5.2 前端测试

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

- TypeScript 类型检查必须通过
- ESLint 检查必须通过
- 构建必须成功

### 5.3 CI

每次 push / PR 自动运行 CI（`.github/workflows/ci.yml`），请确保本地测试通过后再推送。

---

## 6. 反模式清单

以下模式在代码库中已被识别为技术债务，新代码**必须避免**：

### 6.1 禁止静默吞掉错误

```typescript
// 错误 — 静默吞掉异常
catch (() => {})

// 正确 — 记录错误或展示给用户
catch ((error) => {
  console.error('Failed to fetch video:', error);
  toast.error('加载视频失败，请稍后重试');
});
```

### 6.2 禁止 `as` 类型断言（TypeScript）

```typescript
// 错误 — 使用 as 绕过类型检查
const data = response.json() as VideoDetail;

// 正确 — 使用类型守卫或运行时校验
const data: VideoDetail = validateVideoDetail(await response.json());
```

### 6.3 禁止提交 `.env` 文件

- `.env` 已在 `.gitignore` 中
- 敏感信息（API 密钥、数据库密码等）只通过环境变量或 `.env.local` 注入
- 变量变更需同步更新 `.env.example`

### 6.4 禁止同步数据库操作

```python
# 错误 — 同步查询
session.query(Video).filter_by(id=video_id).first()

# 正确 — 异步查询
await session.execute(select(Video).filter_by(id=video_id))
```

### 6.5 禁止硬编码 UI 文字

- UI 文字集中管理，便于后续国际化
- 避免在组件中分散写死中文文案

### 6.6 禁止忽略支付安全

- 支付回调必须验证签名
- 当前 Alipay/WeChat 回调为占位实现，生产环境前必须完成签名验证

---

## 7. 项目结构速查

```
Speaking/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # API 路由模块
│   │   ├── models/           # SQLAlchemy 数据模型
│   │   ├── services/         # 业务逻辑层
│   │   └── tasks/            # Celery 异步任务
│   ├── tests/                # pytest 测试
│   └── .env.example          # 环境变量模板
├── frontend/
│   └── src/
│       ├── app/              # Next.js 页面路由
│       ├── components/       # React 组件
│       └── stores/           # Zustand 状态管理
├── docker-compose.dev.yml    # 开发基础设施
├── docker-compose.yml        # 全栈开发环境
├── docker-compose.prod.yml   # 生产环境
├── docs/                     # 项目文档
│   ├── api/                  # API 约定 + 需求文档
│   ├── architecture/         # 架构决策 + 前端架构
│   ├── operations/           # 运维手册 + 生产指南 + 安全策略
│   ├── progress/             # 开发进度 + 变更日志
│   ├── design/               # 设计系统 + 未来设计
│   ├── reports/              # 技术研究报告
│   └── plans/                # 改进计划 + 管线文档 + 开发工作流
├── .pre-commit-config.yaml   # Pre-commit hooks (ruff + prettier + 通用检查)
├── nginx.conf                # Nginx 配置 (HTTP, 开发用)
├── nginx.ssl.conf            # Nginx 配置 (HTTPS, 生产用)
└── logs/                     # 运行时日志 (gitignored)
```

---

*最后更新：2026-06-19*

---

> 📋 完整开发工作流见 [WORKFLOW.md](docs/plans/WORKFLOW.md) — 包含功能开发流程、代码质量门禁、AI 辅助开发等
