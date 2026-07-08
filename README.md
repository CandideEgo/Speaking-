# SeeWord — AI 英语口语练习平台

> 通过真实视频素材 + AI 实时评分，实现沉浸式英语口语学习

## 项目简介

SeeWord 是一个面向中文母语者的 AI 英语口语练习应用。用户粘贴 YouTube/Bilibili 视频链接，系统自动生成双语字幕，用户逐句跟读，AI 对发音进行多维度评分并给出中文反馈。8 种学习模式覆盖从听力理解到主动输出的完整学习链路。

**核心特色：**
- 真实语料 — 使用 YouTube/Bilibili 视频而非教材录音
- 即时反馈 — faster-whisper 本地语音识别 + AI 发音评分
- 多维练习 — 双语字幕、听写、填空、闪卡、翻译等 8 种学习模式
- 间隔复习 — SM-2 算法驱动的词汇本

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python FastAPI + SQLAlchemy async + Celery |
| 前端 | Next.js 14 (App Router) + React 18 + Tailwind CSS + Zustand |
| 数据库 | PostgreSQL 16 + Redis 7 |
| 语音识别 | faster-whisper (本地运行, int8 量化, base 模型) |
| AI 能力 | OpenAI 兼容 API（当前使用 Agnes AI via Agnes Gateway） |
| 媒体处理 | yt-dlp + ffmpeg |
| 认证 | JWT (PyJWT) + bcrypt |
| 部署 | Docker Compose + Nginx |

---

## 功能概览

### 视频处理
- 提交 YouTube/Bilibili 链接，Celery 异步处理
- YouTube 视频轻量模式：先嵌入播放，后台下载高清版
- faster-whisper 自动生成英文字幕 + AI 翻译中文字幕
- 语法标注、难度评估 (CEFR A1-C2)
- 重复链接自动复用、YouTube 搜索

### 口语练习
- 逐句跟读，浏览器 MediaRecorder 录音
- faster-whisper 识别用户语音，AI 多维评分
- 评分维度：准确度 / 流利度 / 完整度 (0-100)
- 中文反馈建议、练习历史、统计看板
- 免费用户每日 3 次限制

### 8 种学习模式
| 模式 | 说明 |
|---|---|
| 双语字幕 | 中英文字幕同时显示（默认） |
| 纯英文 | 仅显示英文字幕 |
| 纯中文 | 仅显示中文字幕 |
| 阅读模式 | 隐藏字幕，专注听力理解 |
| 听写模式 | SpeechSynthesis 播放，用户听写校对 |
| 填空模式 | 随机挖空关键词，用户填写 |
| 闪卡模式 | 卡片翻转，中英互译 |
| 翻译模式 | 英译中/中译英双向练习 |

### AI 功能 (Pro)
- 单词查询：音标 + 上下文释义 + 例句
- 每日学习总结
- 学习推荐
- 视频测验

### 词汇本
- 保存查过的单词，SM-2 间隔重复复习
- 到期提醒，支持筛选

### 变现
- Free / Pro 两级会员（¥39/月 或 ¥299/年）
- 兑换码系统：批量生成、导出 CSV、防重放
- 订单持久化，状态流转

---

## 项目结构

```
Speaking/
├── backend/
│   ├── app/
│   │   ├── api/v1/           # API 路由
│   │   │   ├── auth.py       # 注册/登录
│   │   │   ├── users.py      # 用户信息
│   │   │   ├── videos.py     # 视频管理 + 测验
│   │   │   ├── speaking.py   # 口语练习
│   │   │   ├── ai.py         # AI 单词查询/总结/推荐
│   │   │   ├── vocabulary.py # 词汇本 CRUD + SM-2
│   │   │   ├── browse.py     # 浏览页 API
│   │   │   ├── community.py  # 社区页 API
│   │   │   ├── rubrics.py    # 评分量规
│   │   │   ├── youtube.py    # YouTube 搜索
│   │   │   ├── payments.py   # 支付/订单
│   │   │   └── invite.py     # 兑换码
│   │   ├── core/             # 配置、数据库、安全、限流
│   │   ├── models/           # SQLAlchemy 模型
│   │   ├── schemas/          # Pydantic 请求/响应
│   │   ├── services/         # 业务逻辑
│   │   │   ├── ai_service.py       # AI 翻译/评分/分析
│   │   │   ├── speaking_service.py # faster-whisper 语音识别
│   │   │   ├── sr_service.py       # SM-2 间隔重复算法
│   │   │   └── youtube_service.py  # YouTube 元数据
│   │   └── tasks/
│   │       └── video_processing.py # Celery 视频处理任务
│   ├── tests/                # pytest 测试
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router 页面
│   │   │   ├── (main)/       # 主布局页面
│   │   │   │   ├── page.tsx          # 首页
│   │   │   │   ├── dashboard/        # 仪表盘
│   │   │   │   ├── watch/[id]/       # 观看页
│   │   │   │   ├── browse/           # 浏览页
│   │   │   │   ├── community/        # 社区页
│   │   │   │   ├── vocabulary/       # 词汇本
│   │   │   │   ├── redeem/           # 兑换码
│   │   │   │   └── admin/            # 管理后台
│   │   │   ├── login/        # 登录
│   │   │   └── register/     # 注册
│   │   ├── components/       # React 组件
│   │   │   ├── video/        # 视频相关 (Library, Status, Search, Submit, AIStats)
│   │   │   ├── speaking/     # 口语相关 (SpeakingPanel, QuizPanel)
│   │   │   ├── subtitle/     # 字幕相关 (SubtitleList, WordTooltip)
│   │   │   ├── DictationMode.tsx
│   │   │   ├── FillBlankMode.tsx
│   │   │   ├── FlashcardMode.tsx
│   │   │   ├── ReadingMode.tsx
│   │   │   ├── TranslateMode.tsx
│   │   │   ├── SubtitleModeTabs.tsx
│   │   │   ├── PlaybackControls.tsx
│   │   │   └── YouTubePlayer.tsx
│   │   ├── stores/           # Zustand 状态管理
│   │   │   └── watchStore.ts # 观看页状态（字幕模式等）
│   │   ├── lib/              # API 客户端、工具函数
│   │   ├── hooks/            # 自定义 Hooks
│   │   └── types/            # TypeScript 类型
│   └── Dockerfile.prod
├── docker-compose.yml        # 全栈开发环境
├── docker-compose.dev.yml    # 仅基础设施 (DB + Redis)
├── docker-compose.prod.yml   # 生产环境 (Nginx + Gunicorn)
└── .github/workflows/ci.yml  # CI/CD
```

---

## 快速开始

### 环境要求

- Docker & Docker Compose
- Node.js 18+
- Python 3.10+
- ffmpeg & yt-dlp（视频处理）

### 1. 启动基础设施

```bash
docker compose -f docker-compose.dev.yml up -d   # 仅 PostgreSQL + Redis
```

### 2. 启动后端

```bash
cd backend
cp .env.example .env   # 编辑 .env 填入 API Key
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

另开终端启动 Celery Worker：

```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 4. 一键启动（Docker 全栈）

```bash
docker compose up -d
```

访问 http://localhost:3000

---

## API 概览

共 42 个 API 端点，全部已实现。

| 模块 | 端点数 | 路径前缀 |
|---|---|---|
| 认证 | 2 | `/api/v1/auth` |
| 用户 | 2 | `/api/v1/users` |
| 视频 | 8 | `/api/v1/videos` |
| 口语 | 3 | `/api/v1/speaking` |
| AI | 3 | `/api/v1/ai` |
| 词汇 | 4 | `/api/v1/vocabulary` |
| 浏览 | 2 | `/api/v1/browse` |
| 社区 | 2 | `/api/v1/community` |
| 量规 | 2 | `/api/v1/rubrics` |
| YouTube | 1 | `/api/v1/youtube` |
| 支付 | 5 | `/api/v1/payments` |
| 兑换码 | 4 | `/api/v1/invite-codes` |
| Bilibili | 1 | `/api/v1/bilibili` |
| 抖音 | 1 | `/api/v1/douyin` |
| 评论 | 2 | `/api/v1/comments` |

健康检查：`GET /health` → `{"status": "ok"}`

---

## 数据模型

共 9 个核心模型：

| 模型 | 说明 |
|---|---|
| User | 用户（email, name, level, plan: free/pro） |
| Video | 视频（source_url, platform, status, youtube_video_id, is_official） |
| Subtitle | 字幕（start_time, end_time, text_en, text_zh, grammar_note） |
| SpeakingAttempt | 口语练习记录（transcript, accuracy, fluency, completeness, feedback） |
| LearningRecord | 学习记录（words_learned, speaking_attempts, quiz_score） |
| Vocabulary | 词汇本（word, context_sentence, SM-2 复习调度字段） |
| InviteCode | 兑换码（code, plan, duration_days, is_used） |
| Order | 订单（order_number, amount, status: pending/paid/expired/cancelled） |
| SpeakingRubric / RubricCriterion | 评分量规及标准 |

---

## 前端页面

| 路由 | 页面 | 权限 |
|---|---|---|
| `/` | 首页（精选视频） | 公开 |
| `/login` | 登录 | 公开 |
| `/register` | 注册 | 公开 |
| `/dashboard` | 仪表盘 | 登录 |
| `/watch/[id]` | 观看页 | 半公开 |
| `/browse` | 浏览页 | 公开 |
| `/community` | 社区页 | 公开 |
| `/vocabulary` | 词汇本 | 登录 |
| `/redeem` | 兑换码 | 登录 |
| `/admin` | 管理后台 | 管理员 |

---

## 测试

```bash
# 后端单元测试
cd backend && pytest tests/ -v

# 前端类型检查 + lint + 构建
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

CI 在每次 push/PR 时自动运行（GitHub Actions）。

---

## 生产部署

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 .env，填入生产值（JWT_SECRET、OPENAI_API_KEY 等）

# 2. 启动生产环境
docker compose -f docker-compose.prod.yml up -d

# 3. 数据库迁移
docker exec -it $(docker ps -qf "name=backend") alembic upgrade head

# 4. 配置 SSL
certbot --nginx -d api.your-domain.com -d your-domain.com
```

生产架构：Nginx (SSL/反向代理) → Gunicorn (4 workers) / Next.js / Celery Worker → PostgreSQL + Redis

详见 [PRODUCTION.md](docs/operations/PRODUCTION.md)。

---

## 开发进度

总体进度 **100%**（92/92 项完成）。

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 1 | 基础框架 | ✅ |
| Phase 2 | 视频处理管道 | ✅ |
| Phase 3 | 口语练习 | ✅ |
| Phase 4 | 变现 | ✅ |
| Phase 5 | 用户体验 | ✅ |
| Phase 6 | 完善（测试/学习模式/词汇本） | ✅ |
| Phase 7 | 安全与监控 | ✅ |
| Phase 8 | 前端架构 | ✅ |
| Phase 9 | 业务逻辑加固 | ✅ |
| Phase 10 | 运维与文档 | ✅ |

详见 [PROGRESS.md](docs/progress/PROGRESS.md)。

---

## 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `OPENAI_API_KEY` | 是 | AI 功能 API Key |
| `OPENAI_BASE_URL` | 否 | OpenAI 兼容 API 地址（默认 OpenAI） |
| `OPENAI_MODEL` | 否 | 使用的模型（默认 gpt-4o） |
| `DATABASE_URL` | 否 | PostgreSQL 连接串 |
| `REDIS_URL` | 否 | Redis 连接串 |
| `JWT_SECRET` | 否 | JWT 签名密钥（生产必须修改） |
| `OSS_ENDPOINT` | 否 | 对象存储端点 |
| `OSS_BUCKET` | 否 | 对象存储桶名 |
| `SENTRY_DSN` | 否 | Sentry 错误监控 |

---

## License

Private — All rights reserved.
