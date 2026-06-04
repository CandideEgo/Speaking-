# 架构文档 — Speaking

> 本文档记录系统的关键设计决策及其后果，为后续开发提供决策上下文。

---

## 1. 系统全景

### 1.1 技术栈

| 层 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 后端框架 | FastAPI | 0.110+ | 异步 Python Web 框架 |
| ORM | SQLAlchemy | 2.0+ | 异步模式 |
| 任务队列 | Celery + Redis | 5.x / 7.x | 视频处理等长时任务 |
| 数据库 | PostgreSQL | 16 | 主数据存储 |
| 缓存 | Redis | 7 | Celery broker + API 缓存 |
| 前端框架 | Next.js | 14 | App Router |
| UI 库 | React | 18 | — |
| 样式 | Tailwind CSS | 3.4 | 无组件库，手写组件 |
| 状态管理 | Zustand | 4.x | 单 store（watch 页） |
| 语音识别 | faster-whisper | 1.x | 本地 CPU 推理，int8 量化 |
| AI 能力 | OpenAI 兼容 API | — | 当前使用 Kimi |
| 媒体处理 | yt-dlp + ffmpeg | — | 视频下载 + 转码 |
| 认证 | JWT | — | python-jose，7 天有效期 |

### 1.2 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Nginx (SSL 终结)                            │
│  - 反向代理 → Gunicorn                                          │
│  - 静态资源服务 (Next.js standalone)                             │
│  - /media 路径 → 本地文件系统                                    │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   Gunicorn    │     │  PostgreSQL   │     │    Redis      │
│ (4 workers)   │     │      16       │     │      7        │
│   Uvicorn     │     │               │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │
        ▼
┌───────────────┐     ┌───────────────┐
│   Celery      │     │  faster-      │
│   Worker      │────▶│  Whisper      │
│               │     │  (本地模型)    │
└───────────────�     └───────────────┘
        │
        ▼
┌───────────────┐
│  本地文件系统  │
│  ./media/     │
│  (或 OSS CDN) │
└───────────────┘
```

### 1.3 核心数据流

#### 视频处理管道

```
用户提交 URL → 后端检测重复 → 创建 Video 记录 (status: processing)
                              │
                              ▼
                    Celery 任务启动
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   YouTube 轻量模式      Bilibili 完整模式      其他平台
        │                     │                     │
        ▼                     ▼                     ▼
   yt-dlp 提取元信息     yt-dlp 下载视频       yt-dlp 下载视频
   下载字幕 (JSON3)      ffmpeg 转码多分辨率    ffmpeg 转码
        │                     │                     │
        ▼                     ▼                     ▼
   Whisper 生成字幕      Whisper 生成字幕      Whisper 生成字幕
   (如无原字幕)          (如无原字幕)          (如无原字幕)
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    AI 批量翻译 (英→中)
                              │
                              ▼
                    AI 语法标注 + 难度评估
                              │
                              ▼
                    更新 Video (status: ready)
                              │
                              ▼
                    前端轮询 → 展示视频 + 字幕
```

#### 口语练习管道

```
用户录音 → POST /speaking (multipart audio)
                    │
                    ▼
            保存临时文件 (.webm)
                    │
                    ▼
            faster-whisper 转写 (CPU, int8)
                    │
                    ▼
            AI 对比原文 vs 转写结果
                    │
                    ▼
            返回 { accuracy, fluency, completeness, feedback }
                    │
                    ▼
            保存 SpeakingAttempt 记录
```

#### 支付流程

```
用户点击升级 → POST /payments/orders → 创建 Order (status: pending)
                                          │
                                          ▼
                                   返回支付 URL
                                          │
                                          ▼
                                   用户跳转支付
                                          │
                                          ▼
                                   支付平台回调
                                          │
                                          ▼
                                   POST /payments/callback/{platform}
                                          │
                                          ▼
                                   验证签名 (当前为 HMAC 占位)
                                          │
                                          ▼
                                   更新 Order (status: paid)
                                   更新 User (plan: pro)
```

---

## 2. 架构决策记录 (ADR)

### ADR-1: faster-whisper 本地语音识别

**状态**: 已采纳 (2025-06)

**背景**

系统需要语音识别能力用于：
1. 视频字幕生成（如原视频无字幕）
2. 用户口语练习转写

可选方案：
- **云端 API**: OpenAI Whisper API、阿里云语音识别、腾讯云语音识别
- **本地推理**: openai-whisper (官方)、faster-whisper (CTranslate2 优化)

**决策**

采用 **faster-whisper 本地推理**，配置：
- 模型路径: `/mnt/c/Users/Administrator/local-model/faster-whisper`
- 设备: CPU
- 精度: int8 量化

**理由**

1. **成本**: 云端 API 按秒计费，视频字幕生成和口语练习都是高频场景，长期成本高
2. **延迟**: 本地推理无需网络往返，口语练习反馈延迟 < 3 秒
3. **隐私**: 用户录音不离开服务器
4. **可用性**: 不依赖外部服务 SLA

**后果**

**正面**:
- 无 API 调用成本
- 低延迟、高可用
- 数据隐私合规

**负面**:
- 单进程瓶颈: Whisper 模型加载为全局单例，并发请求排队处理
- 内存占用: int8 模型约 1.5GB 常驻内存
- 部署约束: Celery worker 必须与 Whisper 模型同机部署
- 硬件依赖: CPU 推理速度受服务器性能影响

**缓解措施**:
- 高并发场景可迁移至 GPU 推理
- 可水平扩展 Celery worker（每节点加载独立模型）

---

### ADR-2: JWT 无状态认证

**状态**: 已采纳 (2025-05)

**背景**

用户认证方案选择：
- **Session + Redis**: 服务端存储 session，客户端持 session_id
- **JWT 无状态**: 客户端持 token，服务端无状态验证

**决策**

采用 **JWT 无状态认证**，配置：
- 算法: HS256
- 有效期: 7 天
- 存储: 客户端 localStorage (key: `speaking_token`)

**理由**

1. **简单**: 无需维护 session 存储
2. **水平扩展**: 任何后端实例可独立验证 token
3. **移动端友好**: 原生 App 可直接使用相同机制

**后果**

**正面**:
- 后端无状态，易于水平扩展
- 实现简单，无额外基础设施

**负面**:
- 无法主动吊销 token（需等待过期）
- Token 泄露后风险窗口为 7 天
- 无法实现"踢出所有设备"功能

**缓解措施**:
- 生产环境强制 HTTPS
- 敏感操作（支付、修改密码）可要求重新验证
- 未来可引入 token 黑名单（Redis）实现即时吊销

---

### ADR-3: Celery + Redis 异步任务处理

**状态**: 已采纳 (2025-05)

**背景**

视频处理是长时任务（下载 + 转码 + 字幕生成），需异步执行。可选方案：
- **asyncio BackgroundTasks**: FastAPI 内置，适合短任务
- **Celery + Redis**: 成熟任务队列，支持重试、监控、分布式
- **Dramatiq + Redis**: 轻量替代方案

**决策**

采用 **Celery + Redis**。

**理由**

1. **成熟**: Celery 是 Python 生态标准方案，文档完善
2. **重试**: 内置重试机制，网络失败自动重试
3. **监控**: Flower 等工具可监控任务队列
4. **分布式**: 未来可扩展至多 worker 节点

**后果**

**正面**:
- 可靠的任务执行（重试、持久化）
- 可观测性（任务状态、队列长度）
- 水平扩展能力

**负面**:
- 额外基础设施（Redis）
- 部署复杂度增加（需运行 worker 进程）
- 调试难度高于同步代码

---

### ADR-4: OpenAI 兼容 API 抽象层

**状态**: 已采纳 (2025-05)

**背景**

系统需要 LLM 能力用于：
- 字幕翻译
- 语法分析
- 发音评分反馈
- 词汇释义
- 学习建议

可选 LLM 提供商：OpenAI、Kimi (月之暗面)、DeepSeek、智谱、本地模型

**决策**

采用 **OpenAI 兼容 API 抽象层**，通过配置切换提供商：
- `openai_api_key`: API 密钥
- `openai_base_url`: API 端点（如 Kimi 的 `https://api.moonshot.cn/v1`）
- `openai_model`: 模型名称

当前配置: **Kimi** (moonshot-v1-8k)

**理由**

1. **灵活性**: 切换提供商只需修改环境变量，无需改代码
2. **成本**: Kimi 国内访问稳定，价格低于 OpenAI
3. **合规**: 数据不出境（如使用国内模型）

**后果**

**正面**:
- 提供商可热切换
- 代码与具体 LLM 解耦
- 可 A/B 测试不同模型效果

**负面**:
- 不同模型能力差异（Kimi 在某些任务可能不如 GPT-4）
- 需处理不同模型的响应格式差异（如 JSON 提取）

---

### ADR-5: 单 Zustand Store 管理 Watch 页状态

**状态**: 已采纳 (2025-06)

**背景**

Watch 页面是应用核心交互界面，包含：
- 8 种学习模式切换
- 视频播放控制
- 字幕显示与交互
- 口语练习面板
- 词汇查询弹窗

状态管理方案：
- **纯 useState**: 每个组件独立管理状态
- **Zustand 单 store**: 全局状态集中管理
- **Context + useReducer**: React 原生方案
- **多 Zustand store**: 按功能域拆分

**决策**

采用 **单 Zustand Store**，当前仅存储 `subtitleMode`。

**理由**

1. **简单**: Zustand API 极简，无 Provider 包裹
2. **跨组件共享**: 学习模式切换需影响多个组件（字幕列表、播放控制、模式面板）
3. **可扩展**: 未来可添加更多全局状态

**后果**

**正面**:
- 学习模式切换逻辑清晰
- 组件间通信无需 prop drilling
- 状态可持久化（如需要）

**负面**:
- 当前 store 仅 1 个状态，部分过度设计
- Watch 页面仍有 16 个 useState，状态分散

**改进方向**:
- 考虑将 `currentSubtitleIndex`、`isPlaying` 等移入 store
- 或保持现状，仅在跨组件共享时使用 store

---

### ADR-6: 本地文件存储 + OSS CDN 分发

**状态**: 已采纳 (2025-05)

**背景**

视频和音频文件存储方案：
- **纯本地文件系统**: 简单，但无 CDN 加速
- **纯对象存储 (OSS/S3)**: CDN 加速，但增加复杂度
- **混合**: 本地存储 + OSS CDN 回源

**决策**

采用 **混合方案**：
- 默认: 本地文件系统 (`./media/`)
- 可选: 阿里云 OSS + CDN（配置 `oss_*` 环境变量）

**理由**

1. **开发简单**: 本地开发无需配置 OSS
2. **生产灵活**: 可按需启用 OSS CDN
3. **成本控制**: 小规模可纯本地，大规模再迁移 OSS

**后果**

**正面**:
- 开发环境零配置
- 生产环境可平滑迁移至 CDN
- 无强制云厂商绑定

**负面**:
- 本地存储无自动备份
- 单机磁盘容量限制
- 无 CDN 时跨地域访问慢

---

## 3. 关键约束

### 3.1 Whisper 单进程瓶颈

**约束**: faster-whisper 模型为全局单例，同一进程内并发请求串行处理。

**影响**:
- 高并发口语练习场景可能排队
- 视频字幕生成任务耗时较长

**缓解**:
- 口语练习: 单次推理 < 3 秒，可接受
- 视频处理: 已在 Celery 任务中执行，不阻塞 API
- 扩展: 可部署多 worker 节点，每节点独立加载模型

### 3.2 Celery Worker 部署约束

**约束**: Celery worker 必须与 Whisper 模型同机部署（模型路径为本地路径）。

**影响**:
- 无法使用托管 Celery 服务（如 AWS SQS + Lambda）
- Worker 扩展需完整部署（含模型文件）

**缓解**:
- 使用 Docker 镜像打包模型
- 或将模型路径改为共享存储（如 NFS）

### 3.3 JWT 无法即时吊销

**约束**: JWT 无状态，服务端无法主动吊销。

**影响**:
- Token 泄露后风险窗口为 7 天
- 无法实现"踢出所有设备"

**缓解**:
- 敏感操作要求重新验证
- 未来可引入 Redis 黑名单

### 3.4 支付回调签名验证未完成

**约束**: 支付宝/微信支付回调签名验证为占位实现（HMAC 开发验证）。

**影响**:
- 生产环境存在支付欺诈风险

**缓解**:
- 生产上线前必须实现真实签名验证
- 当前 `payment_verify_signature: False` 仅用于开发

---

## 4. 模块职责

### 4.1 后端模块

| 模块 | 路径 | 职责 |
|---|---|---|
| auth | `api/v1/auth.py` | 注册、登录、JWT 签发 |
| users | `api/v1/users.py` | 用户信息查询与修改 |
| videos | `api/v1/videos.py` | 视频提交、查询、状态、测验 |
| speaking | `api/v1/speaking.py` | 口语练习提交、历史、统计 |
| vocabulary | `api/v1/vocabulary.py` | 词汇本 CRUD、SM-2 复习 |
| ai | `api/v1/ai.py` | AI 词汇查询、学习建议（Pro） |
| payments | `api/v1/payments.py` | 订单创建、支付回调 |
| invite | `api/v1/invite.py` | 兑换码生成、兑换、导出 |
| browse | `api/v1/browse.py` | 分类浏览、官方内容 |
| community | `api/v1/community.py` | 社区推荐内容 |
| youtube | `api/v1/youtube.py` | YouTube 搜索 |

### 4.2 前端模块

| 模块 | 路径 | 职责 |
|---|---|---|
| pages | `app/(main)/` | 页面路由（home, watch, dashboard 等） |
| components | `components/` | 可复用组件（Sidebar, TopBar, 学习模式组件等） |
| stores | `stores/watchStore.ts` | Watch 页全局状态 |
| lib | `lib/api.ts` | API 客户端封装 |
| hooks | `hooks/useTheme.ts` | 主题切换 |

---

## 5. 扩展指引

### 5.1 添加新学习模式

1. 在 `frontend/src/components/` 创建新组件（如 `NewMode.tsx`）
2. 组件接收 props: `{ subtitles, currentSubtitle, onSpeak, ... }`
3. 在 `SubtitleModeTabs.tsx` 添加模式按钮
4. 在 `watchStore.ts` 的 `SubtitleMode` 类型添加新模式
5. 在 `watch/[id]/page.tsx` 的 switch 语句添加渲染分支

### 5.2 添加新 API 端点

1. 在 `backend/app/api/v1/` 创建或修改路由文件
2. 定义 Pydantic schema（如需要）
3. 添加路由到 `main.py` 的 `include_router`
4. 编写测试用例

### 5.3 切换 LLM 提供商

修改 `.env`:
```
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1  # 或其他兼容端点
OPENAI_MODEL=gpt-4o  # 或其他模型名
```

### 5.4 启用 OSS CDN

修改 `.env`:
```
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY=xxx
OSS_SECRET_KEY=xxx
```

修改 `video_processing.py` 上传逻辑（当前未实现）。
