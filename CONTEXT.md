# CONTEXT.md — SeeWord 项目领域上下文

> 本文件为工程 skill（`/improve-codebase-architecture`、`/diagnosing-bugs`、`/tdd` 等）提供领域语言和核心概念。
> 术语定义以 [Glossary](docs/GLOSSARY.md) 为准；架构决策见 [docs/adr/](docs/adr/)。

## 产品定位

**视频词汇学习 + 社区 UGC**——面向中文母语者的英语学习 app。核心价值循环：

1. **视频词汇学习**：双语字幕（WhisperX ASR）→ ECDICT 考试词汇标注 → SM-2 间隔复习 → AI 词注释预热
2. **社区 UGC**：创作者中心提交视频 → 管理员审核 → 社区 feed 发布

口语录音降为"纯回放"小功能（录→回放→对比原声），零 API、零持久化、无 AI 评分。

## 核心术语

### 视频模型

| 术语 | 含义 | 注意 |
|------|------|------|
| **Official 视频** | 管理员 seed 的官方视频（`is_official=True`），出现在首页/browse | |
| **UGC 视频** | 用户提交的视频（`is_official=False`），审核后进社区 feed | |
| **标准版 (Standard Version)** | 某 `source_url` 首个处理至 `ready` 的视频，作为该 URL 共享编辑起点 | 与 `is_official` 正交；UGC 亦可成标准版 |
| **Fork（副本）** | 从标准版复制一份独立 Video 行（字幕+练习题快照），直接 ready、不触发 GPU | `forked_from` 记溯源 |
| **提议回写 (Propose-back)** | fork 持有者向标准版提 PR（按批字幕修改）；管理员审/合/驳 | 合并后按行传播到未动该行的 fork |
| **VideoStatus** | `pending_processing → processing → ready_subtitles → ready / error` | 处理状态机 |
| **VideoReviewStatus** | `draft → pending_review → published / rejected` | 审核状态机，UGC 必走 |

### 管线

| 术语 | 含义 |
|------|------|
| **process_video (head)** | 云端 worker：提取元数据 → OSS 暂存 → 入队 GPU 转录 |
| **transcribe_video_gpu** | GPU worker：WhisperX 转录（无 DB、无 OSS 凭证）→ HTTP callback 回云端 |
| **finalize_video (tail)** | 云端 worker：翻译 → 考试词汇标注 → AI 词注释预热 → 下载转码 → 标记 ready |
| **断点续传** | Redis `video:steps:{id}` 记录已完成步骤，重入时跳过 |

### 学习

| 术语 | 含义 |
|------|------|
| **SM-2 词汇复习** | 间隔重复算法，词汇模块核心。保留。 |
| **考试词汇标注** | ECDICT 本地标注（CET4/6、gaokao 等），按用户 `target_exam_level` 过滤高亮 |
| **AI 词注释预热** | `finalize_video` 中批量调 LLM 生成词注释，支持双引擎（agnes + qwen）并发 |
| **SpeakingAttempt 表（冻结）** | 历史口语评分记录，停止新写入，保留只读 |

### 前端

| 术语 | 含义 |
|------|------|
| **统一组件库** | 以 watch 页为风格锚点，保持 coral/cream/brand 色系 |
| **mediaUrl** | `api.ts` 的媒体 URL 解析 helper：相对路径→`${API_URL}${path}` |
| **落地页** | `/landing`，营销页，接为公开首页（未登录 `/` → 落地页） |
| **双 Auth 会话** | 用户端 `speaking_token` vs 管理端 `speaking_admin_*`，独立 localStorage |

### 推荐（ADR-0011，规划中）

| 术语 | 含义 |
|------|------|
| **learning_score** | 视频 0-100 质量分，6 因子加权（CTR/Retention/WatchTime/TopicMatch/Quality/Bonus） |
| **行为采集** | `behavior_events` 表 + 前端埋点，P0 阻塞项 |
| **推荐流** | 40/30/20/10 策略（高分/潜力/冷启动/长视频），替代 `created_at desc` |

## 已砍功能（勿再引入）

- **AI 口语评分**：`speaking_service.py`、`rubrics.py`、`speaking_alignment.py` 已删（ADR-0002）
- **跟读/Shadowing 模式**：watch 页"跟读"标签 + 首页 chip 已移除（ADR-0002）
- **口语 streak/目标/统计**：dashboard 口语指标已移除（ADR-0003）
- **自动 UGC 处理**：保持管理员触发，不自动 dispatch（ADR-0004）

## 技术栈速查

| 层 | 技术 |
|----|------|
| 后端 | Python FastAPI (async) + SQLAlchemy async + Celery + PostgreSQL + Redis |
| 前端 | Next.js 14 (App Router) + React 18 + Tailwind CSS + Zustand v5 |
| AI | OpenAI-compatible API（Agnes AI via Agnes Gateway） |
| 语音 | WhisperX + faster-whisper（本地 GPU） |
| 媒体 | yt-dlp + ffmpeg |
| 认证 | JWT（PyJWT），双会话模型 |

## 关键模式

- **Fail-open Redis**：缓存/黑名单/限流在 Redis 不可用时优雅降级
- **Lazy initialization**：DB engine、Redis client、AI service、Whisper model 均懒加载
- **Singleton**：`get_settings()` / `get_redis()` / `get_ai_service()` / `get_whisper_model()`
- **Celery async**：`run_async()` 共享事件循环，不用 `asyncio.run()` per task
- **翻译引擎可插拔**：agnes（默认）/ hy_mt2 / qwen / custom，可选 fallback
