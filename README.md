# SeeWord - 用真实视频学英语

> 双语字幕 + 生词标注 + AI 学习计划 + SM-2 间隔复习，一段视频完成完整学习闭环

## 项目简介

SeeWord 是面向中文母语者的英语学习应用。用户粘贴 YouTube/Bilibili 视频链接，系统自动生成双语字幕并标注考试词汇（CET/高考等），配合 AI 学习计划与 SM-2 间隔复习，形成“看-查-懂”三位一体的学习链路。

**核心特色：**

- 真实语料 - YouTube/Bilibili 视频而非教材录音
- 双语字幕 - WhisperX 自动转录 + AI 翻译，逐词可查
- 考试词汇 - ECDICT 本地标注 CET4/6、高考等层级，按目标层级高亮
- 间隔复习 - SM-2 算法驱动的词汇本 + 多题型练习
- AI 学习计划 - 每日计划生成（规则/AI）+ 学习事件追踪 + 连续学习激励（ADR-0012）

> 注：AI 口语发音评分（ADR-0002/0003）与社区 UGC（ADR-0012）均已下线；产品定位为视频词汇学习 + AI 学习计划。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python FastAPI (async) + SQLAlchemy async + Celery |
| 前端 | Next.js 16 (App Router) + React 19 + Tailwind CSS v4 (CSS-first) + Zustand v5 |
| 数据库 | PostgreSQL 16 + Redis 7 |
| 语音识别 | WhisperX + faster-whisper（本地 GPU worker） |
| AI 能力 | OpenAI 兼容 API（Agnes AI / GLM） |
| 媒体处理 | yt-dlp + ffmpeg |
| 认证 | JWT (PyJWT) + 短信验证码（无邮件） |
| 部署 | Docker Compose + Nginx |

---

## 项目结构

```
Speaking/
├── backend/
│   ├── app/
│   │   ├── api/v1/           # API 路由（auth/videos/vocabulary/recommendations/...）
│   │   ├── core/             # 配置、数据库、安全、限流
│   │   ├── models/           # SQLAlchemy 模型
│   │   ├── schemas/          # Pydantic 请求/响应
│   │   ├── services/         # 业务逻辑（ai/video/vocabulary/learning_plan/transcription/...）
│   │   └── tasks/            # Celery 任务（视频管线 head/tail + GPU 转录）
│   ├── scripts/              # seed/运维脚本
│   └── tests/                # pytest 测试
├── frontend/
│   └── src/
│       ├── app/              # Next.js App Router（(main)/(admin)/(landing) 路由组）
│       ├── components/       # React 组件（ui/common/layout/landing/...）
│       ├── stores/           # Zustand（auth/adminAuth/feed/watch/vocabulary/plan）
│       ├── lib/              # API 客户端、工具、设计 token
│       ├── hooks/            # 自定义 Hooks
│       └── types/            # TypeScript 类型
├── docs/                     # 架构/进度/API/计划文档
├── docker-compose.dev.yml    # 仅基础设施 (DB + Redis)
├── docker-compose.prod.yml   # 生产环境 (Nginx + Gunicorn)
└── .github/workflows/ci.yml  # CI/CD
```

> 完整架构见 [AGENTS.md](AGENTS.md)、`.agent/system-map.md` 与 [wiki/](wiki/INDEX.md)。

---

## 快速开始

```bash
docker compose -f docker-compose.dev.yml up -d   # 1. PostgreSQL + Redis
cd backend && cp .env.example .env               # 2. 编辑 .env 填 API Key
cd backend && uvicorn app.main:app --reload --port 8000   # 3. 后端
cd backend && celery -A app.tasks.celery_app worker --pool=solo -Q celery   # 4. 云 Celery
cd backend && python scripts/start_gpu_worker.py          # 5. 本地 GPU 转录 worker
cd frontend && npm install && npm run dev                 # 6. 前端 -> http://localhost:3000
```

> Windows 一键启动：`/speaking-dev`（含端口清理、迁移、4 服务编排）。详见 `.claude/skills/speaking-dev/`。

---

## 变现

- Free / Pro 两级会员：**¥9.9/月**（兑换码 30 天/码，无月/年之分）
- 兑换码系统：批量生成、导出 CSV、防重放、4 态生命周期（ADR-0007）
- 个体户合规：站内不收款，微信小商店购买后用兑换码激活

---

## API 概览

完整端点以后端 Swagger（`GET /docs`）为准。健康检查 `GET /health` -> `{"status":"ok"}`。

主要模块：auth（手机验证码/手机号+密码） / users / videos / subtitles / vocabulary / recommendations / comments / notifications / browse / learning / plan / ai / redeem-codes / feedback / admin。

---

## 测试

```bash
cd backend && pytest tests/ -v                    # 后端
cd frontend && npx tsc --noEmit && npm run check  # 前端 typecheck + lint + format
```

CI 在每次 push/PR 时自动运行（GitHub Actions）。

---

## 生产部署

```bash
cp backend/.env.example backend/.env   # 填生产值
docker compose -f docker-compose.prod.yml up -d
```

生产架构：Nginx (SSL/反代) -> Gunicorn (4 workers) / Next.js / Celery 云 worker -> PostgreSQL + Redis；远程 GPU worker 走 transcription_gpu 队列。详见 [docs/operations/](docs/operations/)。

---

## 开发进度

总体进度 **100%**（92/92 项完成）。详见 [docs/progress/PROGRESS.md](docs/progress/PROGRESS.md)。

---

## 关键文档

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) | Agent 工作约定 + 知识层规则（CLAUDE.md 为其重定向） |
| [.agent/context.md](.agent/context.md) | 产品定位、技术栈、领域术语、已砍功能 |
| [.agent/system-map.md](.agent/system-map.md) | 系统模块地图与关键不变量 |
| [wiki/INDEX.md](wiki/INDEX.md) | 长期工程知识库（架构/指南/问题） |
| [docs/progress/PROGRESS.md](docs/progress/PROGRESS.md) | 开发进度快照（冻结于 2026-07-20） |
| [CHANGELOG.md](CHANGELOG.md) | 现行变更记录 |

---

## License

Private - All rights reserved.
