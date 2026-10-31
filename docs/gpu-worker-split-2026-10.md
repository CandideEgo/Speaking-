# GPU 转录 worker 拆分：`gpu-worker/` 独立组件（2026-10 实施记录）

> 2026-10-29。本文记录「把 GPU 转录 worker 从 `backend/` 拆成独立组件」这次结构性重构的边界、契约、验证与运维变更。
> 运行/操作细节的唯一事实源是 [`gpu-worker/README.md`](../gpu-worker/README.md)，跨机契约常量在 `gpu-worker/gpu_worker/contracts.py`；
> 本文不复制它们的全部内容，只记录**为什么拆、拆成什么、云端动了什么、还剩什么**。

## 1. 背景与目标

视频管线是 head / GPU / tail 三段：head 与 tail 依赖数据库、OSS、翻译与 LLM，只能跑在云端；GPU 段只需要「拿任务 → 拉/下载音频 → WhisperX 转录 → POST 回调」。

拆分前，GPU 段、`backend/app/services/transcription/`、GPU 依赖集（torch / whisperx / faster-whisper）、`start_gpu_worker.py` 与 GPU Dockerfile 都和云端后端同住 `backend/`。这带来三个具体问题：

- 项目其余部分（`backend/`、`frontend/`、部署）要迁到另一台笔记本 `C:\Users\Fuwei\speaking`，而这台带 RTX 3060 Ti 的桌面机只保留 GPU 转录能力；同仓耦合让「只留一部分」很难做。
- 云端 CI / 镜像必须区分「含 torch 的 GPU 集」与「云端运行集」，GPU 依赖还被装进 backend CI job。
- GPU 机器在权限上不需要、也不应该拿到 DB 与 OSS 凭据，但代码同仓让人容易顺手 import 云端模块。

目标：把 GPU 段变成**自包含、可独立迁移**的组件，对外只保留 Celery 任务名与 HTTP 回调两个契约；云端代码不再含任何 Whisper/GPU 实现与依赖。

## 2. 拆分边界

### 2.1 移出 `backend/` 的东西

| 原位置 | 新位置 | 说明 |
|---|---|---|
| `backend/app/tasks/video_processing.py` 的 GPU 段（原 371–515 行，`transcribe_video_gpu` 等） | `gpu-worker/gpu_worker/tasks.py` | 任务名不变；逻辑保留，import 改为 `gpu_worker.*` |
| `backend/app/services/transcription/`（7 个文件：`__init__` / `audio_extractor` / `chunked_transcription` / `exceptions` / `formatters` / `punctuation` / `whisper_model`） | `gpu-worker/gpu_worker/transcription/` | `TranscriptionService` / whisperx / faster-whisper / 分块 / formatters / punctuation / exceptions，逻辑逐字保留 |
| `backend/app/services/transcription/quality.py` | `backend/app/services/transcription_quality.py`（**仍留云端**，改名） | 回调里的幻觉检测与质量报告落库还在云侧用 |
| `backend/scripts/start_gpu_worker.py`、`run_gpu_worker.ps1`、`gpu_worker_tunnel.ps1` | `gpu-worker/scripts/` | 启动脚本 / NSSM 入口 / SSH 隧道 |
| `backend/.env.gpu-worker.example` | `gpu-worker/.env.gpu-worker.example` | GPU 配置模板 |
| `backend/requirements.txt`（GPU 集） | `gpu-worker/requirements.txt`（+ `requirements-dev.txt` / `requirements-ci.txt`） | 云端只剩 `requirements-cloud.txt` + `requirements-dev.txt` |
| `backend/Dockerfile`（GPU/一体化镜像） | 无（删除） | GPU 机器不再用 Docker 镜像（本机裸 venv + NSSM）；云端用 `Dockerfile.cloud` |
| `test_whisperx_oom_retry.py` / `test_whisperx_segmentation.py` / `test_callback_delivery.py` | `gpu-worker/tests/` | 跟着被测代码走 |
| `test_pending_processing.py::TestGPUWorkerSecurity` | `gpu-worker/tests/test_security_guard.py` | 安全闸移到组件侧 |

### 2.2 留在云端的东西

| 位置 | 职责 |
|---|---|
| `backend/app/tasks/video_processing.py` | head `process_video`（元信息 / 本地上传 stage 到 OSS / 入队）、tail `finalize_video`、`watchdog_stale_pipeline`、`localize_video`、`retry_failed_downloads` |
| `backend/app/api/v1/internal.py::transcription_callback` | 验共享密钥 + Redis 去重锁 → 质量门 → 写 `Subtitle` → 置 `ready_subtitles` → 入队 tail |
| `backend/app/services/transcription_quality.py` | 原 `quality.py`：回调里的幻觉/异常检测与质量报告持久化 |
| `backend/app/services/subtitle_segmentation.py` | **云侧副本**：字幕编辑的批量重切句（`split_long_segments` / `merge_short_segments` 等纯文本函数；原先借用 `app.services.transcription.formatters`） |
| `backend/app/core/media_probe.py` | `get_video_duration`（ffprobe）：`process_video` head 与 `backfill_video_duration.py` 用 |
| `backend/app/tasks/celery_app.py` | 常量 `GPU_TRANSCRIBE_TASK` + `task_routes`；不再 import worker 实现 |
| `backend/scripts/retranscribe_video.py` 等 | 只做「重置状态 + 入队」，不再本地跑 WhisperX |

### 2.3 复制而非共享的地方（同步点）

拆开后两侧不再共享模块，以下三处是**有意的副本**，改动时两边一起改：

- `gpu-worker/gpu_worker/transcription/formatters.py` ↔ `backend/app/services/subtitle_segmentation.py`：断句/合并语义（`_SENTENCE_END` / `_CLAUSE_END` / `_build_subsegment` / `_split_words_by_boundary` / `_force_split_by_count` / `split_long_segments` / `merge_short_segments`）。云侧文件头已写明同步要求。
- `VideoSource` 枚举：云端 `backend/app/models/video.py` ↔ `gpu_worker/sources.py`（值即协议，不要改值）。
- yt-dlp cookies 处理：复制为 `gpu_worker/ytdlp_cookies.py`。

反方向约束：`backend/` 不应 import `gpu_worker.*`；`gpu-worker/` 不应 import `app.*`。

## 3. 新组件结构

```
gpu-worker/
├── gpu_worker/
│   ├── config.py           # 独立 pydantic-settings，读 .env.gpu-worker（WHISPER_* / 回调 / 隧道 Redis）
│   ├── contracts.py        # 跨机契约常量：TASK_NAME / HEARTBEAT_KEY / 回调头
│   ├── celery_app.py       # Celery("gpu-worker")，只声明 transcription_gpu 队列 + 任务路由
│   ├── tasks.py            # transcribe_video_gpu + _post_transcription_callback + _send_alert_sync
│   ├── alerts.py           # 告警 webhook（无 DB fallback）
│   ├── logging.py          # structlog 配置（production 输出 JSON）
│   ├── sources.py          # VideoSource 枚举副本（值即协议）
│   ├── ytdlp_cookies.py    # yt-dlp cookies 文件处理
│   └── transcription/      # 转录实现（7 文件，逐字保留）
├── scripts/
│   ├── start_gpu_worker.py  # 安全闸 + Redis 心跳 + celery worker_main
│   ├── run_gpu_worker.ps1   # 加载 .env.gpu-worker → 用本目录 .venv 启动
│   └── gpu_worker_tunnel.ps1 # SSH 隧道 keepalive：本机 16379 → 云端 Redis
├── tests/                   # 65 用例：契约 / 安全闸 / 回调投递 / OOM 重试 / 分块
├── requirements.txt         # 运行依赖（whisperx / faster-whisper / yt-dlp / deepmultilingualpunctuation）
├── requirements-dev.txt     # 本地开发：pytest / pytest-asyncio / ruff
├── requirements-ci.txt      # CI 轻依赖子集：测试 mock 引擎，不装 torch/whisperx
├── pyproject.toml           # ruff 口径（line-length=120 / py312）
├── pytest.ini               # testpaths / --timeout=120 / pythonpath=.
├── .env.gpu-worker.example
└── README.md
```

设计要点：

- **没有数据库、没有 OSS、没有 Web 接口**；唯一输出是 HTTP 回调。
- `start_gpu_worker.py` 的 `_security_guard()` 发现 `DATABASE_URL` / `OSS_ACCESS_KEY` / `OSS_SECRET_KEY` 就 exit 1，把「不该拿凭据」变成启动时硬失败（`tests/test_security_guard.py` 用子进程断言 exit code）。
- 心跳：每 60s 写 Redis `worker:gpu:heartbeat`（value `"1"`，TTL 90s），退出时删 key；云端管理后台的「Worker 在线」与「开始处理」前置检查都读它。
- 只声明、只消费 `transcription_gpu`；`task_default_queue` 也是它，不会误处理云端 `celery` 队列。

## 4. 数据/接口契约（保持不变）

| 项 | 值 |
|---|---|
| 任务名 | `app.tasks.video_processing.transcribe_video_gpu`（**故意保留旧名**；只是名字，不是模块路径） |
| 队列 | `transcription_gpu` |
| 参数 | `args=[video_id, source, platform]`，可选第 4 个 `language`（预留）；`platform ∈ {"local", "imported"}` |
| 云端入队 | `celery_app.send_task(GPU_TRANSCRIBE_TASK, args=[video.id, gpu_source, gpu_platform], queue=settings.transcription_gpu_queue_name)` |
| 回调 | `POST {TRANSCRIPTION_CALLBACK_URL}`（云端 `/api/v1/internal/transcription/callback`），头 `X-Callback-Secret` |
| 回调 body | `{video_id, status, segments, error, audio_duration}`；`status="error"` 时 `segments=null` |
| 心跳 | Redis key `worker:gpu:heartbeat`（value `"1"`，TTL 90s） |

**任务名为什么不改**：队列里可能还有在途消息，改名会让它们变成 unregistered task。要改必须先排空 `transcription_gpu`。契约常量集中在 `gpu-worker/gpu_worker/contracts.py`，`tests/test_contracts.py` 钉住；云端 `backend/app/tasks/celery_app.py` 的 `GPU_TRANSCRIBE_TASK` 是独立的一份字面量，两侧必须一致。

## 5. 云端改动清单

| 文件 | 改动 |
|---|---|
| `backend/app/tasks/video_processing.py` | 删 GPU 段（原 371–515 行）；head 改为 `send_task`；head/tail/watchdog/localize/retry 其余逻辑不动 |
| `backend/app/tasks/celery_app.py` | 新增 `GPU_TRANSCRIBE_TASK` 常量，`task_routes` 用它；注释写明这是兼容契约 |
| `backend/app/api/v1/internal.py` | import 改到 `app.services.transcription_quality` |
| `backend/app/services/transcription/` | 整目录删除 |
| `backend/app/services/transcription_quality.py` | 由 `quality.py` 改名迁入（内容不变） |
| `backend/app/services/subtitle_segmentation.py` | 新增：`formatters.py` 的云侧副本，供 `subtitle_edit_service` 批量重切句 |
| `backend/app/core/media_probe.py` | 新增：`get_video_duration`（ffprobe） |
| `backend/app/core/config.py` | 删 `WHISPER_*` 与 `TRANSCRIPTION_TEMP_DIR`；保留回调与队列字段 |
| `backend/.env.example` | 删 Whisper 变量段，改为指向 gpu-worker 模板 |
| `backend/requirements.txt` | 删除（GPU 集迁到 gpu-worker） |
| `backend/Dockerfile` | 删除；`docker-compose.yml` 的 backend / celery 服务改用 `Dockerfile.cloud` |
| `backend/tests/*` | 3 个测试移走；`test_pending_processing` 移除 GPU 安全类；`test_quality_safety_net` 改 import |
| `backend/.mypy-baseline` | 删 `app/services/transcription/whisper_model.py:no-any-return`（41→40 行，无新增） |
| `backend/scripts/pip_audit_gate.py` | 默认只审计 `requirements-cloud.txt` |
| `backend/scripts/retranscribe_video.py` / `reprocess_official_videos.py` / `seed_local_video.py` | 改为「重置状态 + 入队 `process_video`」；不再本地跑 WhisperX；`reprocess_official_videos.py` 的 JSON 导出上传流程退役（`upload_reprocessed.py` 早已不存在） |
| `backend/scripts/backfill_video_duration.py` | 改用 `app.core.media_probe.get_video_duration` |
| `.github/workflows/ci.yml` | backend 与 e2e job 改装 `requirements-cloud.txt`；新增 `gpu-worker` job |

## 6. 测试与 CI 变更

- **跟随代码迁移的测试**：`test_whisperx_oom_retry.py`（19）/ `test_whisperx_segmentation.py`（25）/ `test_callback_delivery.py`（7）→ `gpu-worker/tests/`；`test_pending_processing.py::TestGPUWorkerSecurity` → `gpu-worker/tests/test_security_guard.py`（3 个测试函数，其中 OSS key 参数化 → 4 例）。
- **gpu-worker 侧新增/保留测试**：`tests/test_contracts.py`（10，钉任务名/队列/心跳/回调头）等，共 **65 用例**；测试 mock 掉 WhisperX/torch/httpx，`PUNCTUATION_MODEL_DISABLED=1` 防止下载标点模型。
- **云端测试口径**：`test_quality_safety_net.py` 改 import 到 `app.services.transcription_quality`；其余云端测试不变。后端全量 `pytest tests/ -q --timeout=120` → **1406 passed / 14 skipped / 39 warnings**（787.47s，exit 0；本地全量，未跑覆盖率门）；`ruff check` / `ruff format --check` 通过（backend `ruff check app tests scripts` + `ruff format --check` 358 files already formatted；gpu-worker 两侧均通过）。
- **CI**：`.github/workflows/ci.yml` 新增 `gpu-worker` job（ubuntu-latest / Python 3.12 / 工作目录 `gpu-worker/`）——装 `requirements-ci.txt`，跑 `ruff check` + `ruff format --check` + `pytest tests -q`；backend 与 e2e job 从 `requirements.txt` 改装 `requirements-cloud.txt`。
- **安全审计口径**：`backend/scripts/pip_audit_gate.py` 只审计 `requirements-cloud.txt`（GPU 栈不在 backend job 安装）。gpu-worker **当前没有自动化 pip-audit 门**，见 §9。

## 7. 本机运维变更

已执行（NSSM 参数已核对到注册表）：

| 项 | 变更后 |
|---|---|
| `SeeWordGpuWorker` 服务 | `AppDirectory=C:\Users\Administrator\Speaking\gpu-worker`；`AppParameters` 指向 `gpu-worker\scripts\run_gpu_worker.ps1`；日志 `gpu-worker\logs\gpu-worker.log` |
| `SeeWordGpuTunnel` 服务 | `AppDirectory` 同上；指向 `gpu-worker\scripts\gpu_worker_tunnel.ps1`；日志 `gpu-worker\logs\gpu-tunnel.log` |
| `gpu-worker/.venv` | 由 `backend/.venv` 克隆而来（独立 venv，不再依赖 backend 目录）；实测验证 torch `2.8.0+cu128`、torchaudio `2.8.0+cu128`、whisperx `3.8.6`、faster-whisper `1.2.1` 已安装可用 |
| YouTube cookies | `YOUTUBE_COOKIES_PATH` 已复制到 `gpu-worker/youtube_cookies_fresh.txt`（在 `gpu-worker/.gitignore` 忽略，绝不入库） |
| POT provider | `.env.gpu-worker` 增加 `YOUTUBE_POT_BASE_URL=http://127.0.0.1:4416`（与旧 backend 默认值一致），避免 yt-dlp POT 插件走 `HTTP_PROXY` 回连 loopback 超时（20s 读超时，2026-09-08 的坑） |
| 运行状态 | 服务配置已改指 gpu-worker；`SeeWordGpuWorker` Running，但云端 Redis 隧道 16379 因 SSH 公钥被云端拒绝（`Permission denied (publickey,password)`）而连不上，未消费任务；需要云端补回公钥/改隧道配置后才能恢复，待用户处理 |

两个 NSSM 服务的日志现在分别落在 `gpu-worker\logs\gpu-worker.log` 与 `gpu-worker\logs\gpu-tunnel.log`（NSSM `AppStdout` / `AppStderr` 已改，不再写 backend 的日志目录）。

其他本机约束：GPU worker 的 Python 进程同样要带 `PYTHONUTF8=1`（中文 Windows 读 UTF-8 的 `.env.gpu-worker` 会 GBK 解码失败），解释器用 `gpu-worker\.venv\Scripts\python.exe`。

## 8. 迁移清单（项目其余部分 → 笔记本 `C:\Users\Fuwei\speaking`）

**执行结果（2026-10-29，已复制完成）：**

- 打包方式：桌面机 `robocopy` 到 staging（按下面清单排除）→ `tar -czf`（0.33GB）→ `scp` 到笔记本 → 笔记本 `tar -xzf` 解到 `C:\Users\Fuwei\speaking`。耗时：tar 31s、scp 130s、解包 8s。
- 结果核对（笔记本侧实测）：**4183 文件 / 0.34GB**；`gpu-worker` 不存在；新文件 `transcription_quality.py` / `subtitle_segmentation.py` / `media_probe.py` 齐全；`git log` HEAD=`e7e8fd3d`；`git status --porcelain` 43 条，与桌面工作区一致；`PROGRESS.md` 与本文档为最新版（含 1406 passed 等验证数字）。
- 实际排除：`gpu-worker/`、`backend/.venv`、`backend/data/`（ecdict.db 851MB + exam_pdfs/papers）、`backend/media/`、`backend/logs|temp|tmp|transcripts|reprocess_export`、`frontend/node_modules`、`frontend/.next`、`frontend/test-results|playwright-report`、根 `node_modules|media|logs|.tmp-diag|.raven|.cache|.debug-shots|.playwright*`、`__pycache__`/各类缓存、根 `tmp-*.log`、`.coverage`、`backend/tmp_*.txt`、`backend/.env.bak*`/`.env.fixed`、旧 cookies（只留 `youtube_cookies_fresh.txt`）。
- 与上面清单的差异：`.git` 与 `backend/.env`、`.claude/settings.local.json` 也一起带过去了（`.git` 让笔记本是完整仓库；`backend/.env` 是桌面 dev 配置，**在笔记本首次启动前必须按本机环境核对 DB/Redis/代理/密钥**）。
- 首次 tar 复制时尚未做：装 Python/Node、重建 `backend/.venv` 与 `frontend/node_modules`、Postgres 数据迁移、后端 import/测试/e2e。这些已在同日补齐，见 §8.1。

**笔记本收：**

- `backend/`、`frontend/`、`docs/`、`designs/`、根目录的 `CLAUDE.md` / `PROGRESS.md` / `DESIGN.md` / `AGENTS.md`、`Start-Redesign.ps1`、根 `scripts/`、`docker-compose*.yml`、`nginx*.conf` / `promtail.yml`、部署脚本（`deploy.sh` / `deploy-oneclick.sh`）、`.github/workflows/`（CI 跑云端与 gpu-worker 两条）。
- 数据库：Postgres 数据用备份/恢复迁移（不入库到 git），迁移前先 `alembic upgrade head` 对齐。
- 笔记本上重建 `backend/.venv` 与 `frontend/node_modules`（不复制本机产物）；`.env` 手工重建（含密钥，不入库）。

**笔记本不收：**

- `gpu-worker/`（跟着桌面机走）、两套 `.venv`、`node_modules`、`media/`、`logs/`、`.next/`、`youtube_cookies*.txt`、`.env*` 真实配置、各类缓存。

**桌面机保留：**

- `gpu-worker/` 整目录、`gpu-worker/.env.gpu-worker`、`youtube_cookies_fresh.txt`、`SeeWordGpuWorker` + `SeeWordGpuTunnel` 两个 NSSM 服务。
- `.env.gpu-worker` 的 `REDIS_URL` 指向迁移后云端的 Redis；隧道目标 IP 变化时改 `gpu_worker_tunnel.ps1`。

**迁移后验证（按顺序）：**

1. 云端管理后台显示「GPU Worker 在线」（心跳 key 存在）；
2. 云端入队一条视频，head 正常入队 `transcription_gpu`；
3. GPU worker 消费成功并回调，云端返回 200、写入 `Subtitle`；
4. tail `finalize_video` 完成到 `ready`。

### 8.1 笔记本环境（2026-10-29，已部署并验证）

笔记本现在是可运行的完整 dev 机，桌面机只保留 GPU 段。这一节只记「笔记本这台机器」的状态；启动/停止命令属于本机运维，写在 laptop skill 里。

- **代码来源**：`git clone` 实测可行（仓库 public，匿名可克隆，`--branch redesign` 全量 **56.3s / 2128 文件 / 125MB**，HEAD 即推送后的 `4abcffea`）。现有目录改用 `git fetch` + `git reset --hard origin/redesign` 对齐到同一提交，工作树干净；`gpu-worker/` 随仓库存在但笔记本不运行它。
- **运行时**：Windows 原生 Python 3.12.10（`C:\Program Files\Python312`）与 Node 22.20.0（`C:\Program Files\nodejs`，与桌面机同版本）；`backend/.venv` 装 `requirements-cloud.txt` + `requirements-dev.txt`（288 个包），`frontend/node_modules` 用 `npm ci --legacy-peer-deps`（245 包，普通 `npm ci` 会因 eslint 10 / eslint-plugin-react-hooks 5 的 peer 冲突失败）；用户级 `PYTHONUTF8=1`，pip 走清华 TUNA、npm 走 npmmirror。
- **DB/Redis**：不装 Docker Desktop，直接用笔记本 WSL2 Ubuntu-24.04 里已有的 Docker 29.9.2 + compose v5.6.1 跑 `docker-compose.dev.yml`；容器为 `speaking-db-1` / `speaking-redis-1`，端口经 WSL 转发到 Windows `127.0.0.1:5432/6379`。WSL 空闲会自动停止（容器随之退出），因此注册登录自启计划任务 **SeeWordInfra**（`C:\Users\Fuwei\start-infra.ps1` 在 WSL 里 `docker compose up -d` 后用 `sleep` 保活）；Windows 侧加 `C:\Users\Fuwei\bin\docker.cmd` 转发到 `wsl docker`，`Start-Redesign.ps1` 因此无需改仓库即可运行。
- **数据迁移**：桌面机 `pg_dump -U seeword -d seeword -Fc`（14.8MB）→ 笔记本 `pg_restore --clean --if-exists --no-owner`；恢复后 `videos=49 / subtitles=4932 / users=6`，`alembic current = c3d4e5f6a7b8 (head)`，与桌面机一致。
- **验证（全部实测）**：`GET /health` → 200（database ok / redis ok，`ENV=development`）；`GET /login` → 200；经 Next dev proxy 的 `GET /api/v1/browse/home-editorial` → 200 且返回恢复后的首页主推内容；`Start-Redesign.ps1` → `SeeWord ready: http://localhost:3000`；桌面机访问 `http://192.168.1.25:3000/login` → 200（按 `192.168.0.0/16` 放行 3000/8000，笔记本网络档案是 Public）。
- **本地数据（2026-10-29 已补齐）**：`backend/data`（217 文件 / 978.4MB，含 ecdict.db 811.9MB 与 exam_pdfs/papers）与 `backend/media`（2281 文件 / 2934.6MB）已从桌面机迁到笔记本，文件数与大小与源端逐项一致；`backend/data/ecdict.db` 能被读取（`is_available()=True`，索引 14843 个考试词），DB 里 `/media/...` 的抽样缩略图与 720p 视频文件都在盘上；用 dev 短信假码（`1234`）登录拿到 token 后，`GET /media/...` 的缩略图与 720p Range 请求都返回 **206**（`video/mp4`，`bytes 0-1023/37677770`），说明迁移后的媒体路由可用。传输方式：`tar -czf` 打包 data（978MB → 349MB）+ `tar -cf` 打包 media（2937MB）→ media 拆 4 段并行 `scp` → 笔记本 `copy /b` 合并后 `tar -xf`；用时约 25 分钟（笔记本 WiFi 实测约 1.2–2.7MB/s），传输产物已清理。
- **其余遗留**：`backend/.env` 仍是桌面 dev 配置（`YOUTUBE_COOKIES_PATH` 已改指笔记本路径，`HTTP_PROXY=127.0.0.1:7897` 依赖笔记本本机代理）；笔记本 6.9GB 内存、WSL 上限约 3.3GB，同时跑 Next dev + uvicorn + DB 偏紧。

## 9. 已知缺口与后续

- **GPU 依赖没有自动 pip-audit 门**：`backend/scripts/pip_audit_gate.py` 只管 `requirements-cloud.txt`；gpu-worker 没有 CI 审计步骤，也没有 `.pip-audit-ignore`。手工口径：升级 `gpu-worker/requirements.txt` 的钉版前，在 GPU 机上跑 `pip-audit -r requirements.txt`。若要做成门，建议单独一个 job，并像 backend 一样给豁免加「复核日期」。
- **gpu-worker 没有 Docker 镜像**：本机是裸 venv + NSSM；换 GPU 机器要重建 venv、CUDA 版 torch 与模型（`WHISPER_MODEL_PATH` 必须是本机 CTranslate2 模型目录，不是 HF 名称）。
- **两份断句逻辑副本**：`subtitle_segmentation.py` 与 `formatters.py` 只能靠同步约定，没有自动一致性测试（后续可考虑抽共享包或加对比测试）。
- **`/dev` skill 与 README 服务名已同步**：`.claude/skills/dev/SKILL.md` 的 GPU worker 步骤已改为 `gpu-worker` 路径（仅在有 `gpu-worker/` + NVIDIA GPU 的机器上执行）；`gpu-worker/README.md` 的 NSSM 表已改成实际注册名 `SeeWordGpuWorker` / `SeeWordGpuTunnel`（无空格）。
- **运行状态**：见 §7——`SeeWordGpuWorker` Running，但隧道 16379 因云端 SSH 拒绝公钥（`ssh -i C:\Tools\seeword-gpu\id_ed25519 admin@47.122.109.52` 返回 `Permission denied (publickey,password)`，默认 key 同样被拒）起不来，worker 日志持续 `Error 10061`，尚未实际消费任务。这是**拆分前就存在的云端 SSH 鉴权/公钥问题**（重启服务后依旧，不是本次重构引入），需要云端补回公钥或改隧道配置，待用户处理。
- **笔记本侧已初始化（2026-10-29）**：源码、Python/Node、venv/node_modules、Postgres 数据与运行验证都已完成，细节见 §8.1；笔记本不运行 GPU 段（`gpu-worker/` 只是随仓库存在）。仍未迁移 `backend/data` 与 `backend/media`。
- **桌面机非 GPU 部分的去留**：`backend/`、`frontend/`、`.git` 仍在桌面机上（本次是复制不是删除）；是否删除、是否停 `SeeWordCelery` 服务待用户决定。
