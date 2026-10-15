# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目速览

**SeeWord** — 视频 + 字幕逐词点读的英语学习站。用户看视频、点单词查义、跟读练习、做词汇复习与四六级试卷。

- 后端：FastAPI(Python 3.12) + SQLAlchemy 2.0 async + Celery + Alembic，源码在 `backend/`
- 前端：Next.js 16 App Router + React 19 + Tailwind v4 + Zustand，源码在 `frontend/`
- 基础设施：Postgres 16 + Redis 7（Celery 的 broker 和 result backend 都用它）
- 部署：单机 docker compose + nginx 反代；转写另跑在一台无 DB 的 GPU 机器上

**仓库根没有 `package.json`，也没有 Makefile。** 所有命令都要先进 `backend/` 或 `frontend/`。子包各自的约定见 [`backend/CLAUDE.md`](backend/CLAUDE.md) 与 [`frontend/CLAUDE.md`](frontend/CLAUDE.md)。

## 命令速查

| 目的 | 命令 | 工作目录 |
|---|---|---|
| 全栈 dev（compose） | `docker compose up -d` | 根 |
| 只起 DB + Redis | `docker compose -f docker-compose.dev.yml up -d` | 根 |
| 后端 API | `uvicorn app.main:app --reload --port 8000` | `backend/` |
| Celery worker | `celery -A app.tasks.celery_app worker --loglevel=info` | `backend/` |
| Celery beat | `celery -A app.tasks.celery_app beat` | `backend/` |
| 跑迁移 | `alembic upgrade head` | `backend/` |
| 后端测试 | `pytest tests/ -v` | `backend/` |
| 跑单条后端测试 | `pytest tests/test_auth.py::test_login -v` | `backend/` |
| 后端 lint / 格式 | `ruff check app/ tests/` · `ruff format app/ tests/` | `backend/` |
| 前端 dev | `npm run dev` | `frontend/` |
| 前端单测 | `npm run test:unit` | `frontend/` |
| 跑单个前端单测 | `npx vitest run src/lib/api.test.ts` | `frontend/` |
| e2e | `npx playwright test` | `frontend/` |
| 跑单个 e2e | `npx playwright test e2e/watch.spec.ts`（或 `-g "标题关键词"`） | `frontend/` |
| 前端门禁 | `npm run check` | `frontend/` |
| e2e 数据播种 | `python scripts/seed_e2e.py` | `backend/` |

`npm run check` = design-system 检查 + 会话写入检查 + `tsc --noEmit` + ESLint + Prettier `--check`。后两个检查器都是「机器执行的不变量」，见 [`frontend/CLAUDE.md`](frontend/CLAUDE.md)。

## 架构大图

以下都是读多个文件才能拼出来的部分；单个文件的结构直接打开看即可。

### 后端装配与错误契约

`backend/app/main.py::create_app()` 是唯一入口，模块底部 `app = create_app()`（`main.py:322`）。三个自定义 `@app.middleware("http")`：request-id 注入、请求日志、安全头（生产才加 HSTS 与 CSP）。Prometheus 走 `Instrumentator`，`/health` 会真探 DB 与 Redis 并在任一不健康时返回 503。

**所有错误响应都是统一 envelope** `{code, message, detail?}`：

- 业务代码抛 `AppError(status_code, code, message, detail?)`，`code` 取 `backend/app/core/errors.py::ErrorCode`
- 存量 `HTTPException`（约 150 处）由全局 handler 兜底转 envelope，`code = HTTP_{status}`
- 422 校验错误 → `code = VALIDATION_ERROR`，`detail` 是 pydantic errors 数组
- `AIServiceError` → 502 + `AI_SERVICE_UNAVAILABLE`，绝不退化成 500 或静默假分值

前端 `lib/createApiClient.ts` 就是按这个 envelope 解析的，改 envelope 就同时改了前端。

### 路由

全部在 `backend/app/api/v1/*.py`，注册时统一加 `prefix="/api/v1"`。**唯一例外**是 `media.router` 挂在根——它是 Range-aware 的视频服务，因为 Starlette 的 `StaticFiles` 会吞掉 Range 头，导致 `<video>` 无法拖进度。另 `mock_payments` 只在 `env in (development, testing)` 时挂载。

`backend/app/api/dependencies.py` 提供鉴权依赖（见下）。

### 数据层

SQLAlchemy 2.0 async。`backend/app/core/database.py` 里有两点值得知道：

- engine 与 session maker 都 `@lru_cache` **懒建**，不在 import 时建。这是为了让没有 `DATABASE_URL` 的 GPU worker 也能 import 这些模块。
- FastAPI 路由用 `get_db()` 依赖；Celery 任务等非依赖场景用 `get_async_session_maker()`——后者同时是测试 monkeypatch 的缝。

模型在 `backend/app/models/`，必须由 `app/models/__init__.py` 按依赖序 re-export（`create_app` 会先 import 它们，好让 SQLAlchemy 在任何 `create_all`／Alembic autogenerate 前把 `Base.metadata` 填全）。迁移 75 个 revision 在 `backend/migrations/versions/`。

核心实体：`User` 拥有 `Video` / `Vocabulary` / `LearningRecord` / `Order` / `UserFavorite` / `UserNote` / `UserVideoUnlock` / `LearningPlan` / `Notification`；`Video` 拥有 `Subtitle`（按 `sentence_index` 排序，含 `text_en` / `text_zh` / 逐词时间戳 `words` / `word_levels`），并冗余 `like_count` / `favorite_count` / `view_count` / `score`，以及管线状态 `status` + `processing_step` + `step_started_at`。

### 鉴权

手机号 + 短信验证码，**没有邮箱**。`app/core/security.py` 用 PyJWT HS256 签 token（access 30 分钟、refresh 7 天，带 `jti`/`type`）。`app/api/dependencies.py` 的 `get_current_user` 会解 token、校验类型、查 token 黑名单、拒绝早于 `password_changed_at` 的 token、拒绝被封禁用户。另有 `get_optional_user` / `get_admin_user` / `require_pro_user`。

**GPU worker 的回调不走 JWT**，走共享密钥（见下）。

### 视频管线：head / GPU / tail 三段切分

全在 `backend/app/tasks/video_processing.py`。这个切分是整个仓库最需要先理解的东西——中间一段跑在**另一台机器**上。

1. **head** `process_video`：yt-dlp 取元信息，本地上传的素材先 stage 到 OSS，然后入队 `transcribe_video_gpu` 并释放锁
2. **GPU 段** `transcribe_video_gpu`：路由到 `transcription_gpu` 队列，在 GPU 机器上跑 `TranscriptionService._sync_transcribe`（WhisperX = VAD → 批量 ASR → wav2vec2 强制对齐，失败回退 faster-whisper），完事后 POST 回云端
3. **回调** `app/api/v1/internal.py::transcription_callback`：验共享密钥 + Redis 去重锁 → 质量门 → 写 `Subtitle` → 置 `ready_subtitles` → 入队 tail
4. **tail** `finalize_video`：翻译（`TranslationService`）→ 质量门 → ECDICT 本地查词注释 → 预热词注 → 分类 → 下载 → 转码 → `ready`，随后注册标准、自动发布、评分、难度与语速指标

`watchdog_stale_pipeline` 每 10 分钟把卡过各步骤超时的视频标失败，覆盖 `processing` 与 `ready_subtitles` 两个相位。

### Celery

`backend/app/tasks/celery_app.py` 定义 `celery_app`，两个队列：云端默认的 `celery` 与远端 `transcription_gpu`。**只有 `transcribe_video_gpu` 路由到 GPU 队列**，其余（管线首尾、本地化、订单过期等）都在云端跑。beat 里挂着订单过期与对账、管线看门狗、失败下载重试、评分（小时/天）、榜单快照、每小时提醒、周报、注销账号清理。

Windows 上这些以 NSSM 服务托管（`backend/scripts/run_celery_worker.ps1`、`run_gpu_worker.ps1`）。

### 前端装配

Next.js 16 App Router，源码在 `frontend/src`。路由组 `(main)`（用户壳）与 `(admin)`（管理壳），另有裸路由 `login` / `register` / `forgot-password` / `set-password` / `onboarding` / `upgrade` / `terms` / `privacy`。

**手写 fetch 封装，没有 React Query 也没有 SWR。** `frontend/src/lib/createApiClient.ts` 是工厂，提供：仅对 GET/HEAD 的 5xx 重试（1s/2s 退避）、发请求前的 JWT 过期预检、401 单次刷新、解析上面的错误 envelope、GET 在途去重与可选 `cacheTtlMs` TTL 缓存。用户端实例是 `lib/api.ts`，管理端是 `lib/adminApi.ts`——**两套 token、两套会话**。

**token 双重存放**：真身在 Zustand `authStore` 的 localStorage，请求时带 `Authorization: Bearer`；同时镜像到 cookie `seeword_token`，让 `frontend/src/proxy.ts`（Next 16 把 middleware 改名 proxy）的边缘登录墙能读到。**登录墙只查 cookie 是否存在**，不解析 JWT、不查库，所以它挡的是"完全未登录"，真正鉴权仍在后端。因为 `<video>`/`<audio>` 发不了请求头，`mediaUrl()` 用 `?token=` 附 token（跟读/字幕音频走这条路）。

**样式**：Tailwind v4 CSS-first，**没有 `tailwind.config`**。token 定义在 `frontend/src/app/globals.css` 的 `@theme {}`，语义色（`--color-canvas` / `surface-*` / `ink` / `body` / `muted` / `hairline` / `brand-*`）靠 `:root` 与 `.dark` 两套变量切换，所以暗色模式是"换变量"而不是"改类名"。`hooks/useTheme.ts` + `layout.tsx` 里的内联脚本负责防闪烁。

### 配置

`backend/app/core/config.py::Settings`（pydantic-settings，`get_settings()` 带 `@lru_cache`，读 `backend/.env`）。`model_post_init` **fail-closed**：`development` 给 localhost 与开发密钥默认值；其它环境强制要 `JWT_SECRET` + `DATABASE_URL`；`production` 还要 `OPENAI_API_KEY` + `REDIS_URL` + `TRANSCRIPTION_CALLBACK_SECRET`。

运行时开关有两层：env 布尔（`sms_login_enabled`、`payments_enabled`、`oss_upload_enabled`、`jwt_blacklist_enabled` 等）与 DB 里的单行 `AdminSetting`（看门狗、注册开关、质量门阈值等，任务里按调用时刻读 `_effective_*`）。

## 常驻规则

- 与用户交流用中文。
- **代码是事实源。** 注释、文档、快照都可能过期；冲突时以代码为准。
- 先验证再下结论。跑不了的检查明确写「未执行」，不写成通过。
- **永不为让检查变绿而放宽检查器、基线或豁免。** 具体指 `backend/.mypy-baseline`、`backend/.pip-audit-ignore`、`frontend/scripts/check-design-system.mjs`。先处理真实违规。
- 一条事实只放一个家，不跨文件复制规则。
- 用户授权只覆盖当前任务，不自动延伸到生产、删除、发布或额外系统。
- 高影响改动（契约、迁移、部署配置、不可逆操作）先理清消费者与退路再动手。

## 失效指针：这些路径已不存在

2026-10-15 的提交 `a7d9d45` / `ec9688e` / `c3cbed2` 删除了整个文档与知识层——`docs/`、`knowledge/`、`wiki/`、`.agent/`、`CONTEXT.md`、根 `AGENTS.md`、`README.md`、`CONTRIBUTING.md` 以及各子包的 `AGENTS.md`。**代码里仍有指向它们的引用，不要去找那些文件。** 具体地：

- `backend/tests/test_architecture_invariants.py` 的 docstring 指向 `.agent/invariants.md`（已删）。**那个测试文件本身是活权威**（比如 INV-003：视频处理只由管理员/catalog 触发，没有用户投稿路径）——以测试代码为准。
- `backend/pyproject.toml` 与 `app/**` 注释里的 `INV-005` 是**活规则**：AI 调用必须走 `app.services.ai_service` 或 `app.services.translation`，由 ruff 的 `TID251 banned-api` 强制。但那份带编号的清单文件已不存在。
- `.github/workflows/ci.yml` 开头提到的「本仓审查原则第 N 条」清单已删。
- `scripts/release.sh` 里指向 `knowledge/CHANGELOG.md` 的步骤现在是断的。
- `.mcp.json` 仍指向 `C:/Users/Administrator/Tools/aoci/aoci.exe`，该 server 已在 `.claude/settings.local.json` 里禁用。

改这些注释里的失效指针不属于当前任务；遇到时按上面说明处理即可。
