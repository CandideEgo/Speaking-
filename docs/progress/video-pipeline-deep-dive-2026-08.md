# SeeWord 视频处理全链路实战深度报告

> 日期：2026-08-05
> 场景：管理员提交 YouTube 视频《How Micron's Building Biggest U.S. Chip Fab, Despite China Ban》(S3geK7xVDQU, CNBC, 17:43) 从提交到上线的完整实战
> 结果：✅ 全流程打通，187 句字幕、翻译 100%、词级标注、330 条 AI 词注、C2 难度、评分、自动发布全部完成

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [全流程时间线与产出](#2-全流程时间线与产出)
3. [架构与流程全景](#3-架构与流程全景)
4. [问题与解决方案（10 个实战问题）](#4-问题与解决方案)
5. [影响质量的关键因素](#5-影响质量的关键因素)
6. [可改进环节与优先级建议](#6-可改进环节与优先级建议)
7. [提效方案](#7-提效方案)
8. [运维与上线保障](#8-运维与上线保障)
9. [附录](#9-附录)

---

## 1. 执行摘要

本次实战完整模拟了管理员添加官方视频的流程：`seed-full 提交 → head 元数据提取 → GPU 转录 → 质量门禁 → tail 翻译/标注/词注/转码 → 自动发布`。

**过程中共发现并解决 12 个问题**，覆盖网络、运行时、模型、配置、代码 bug 五个层面。其中 3 个是**环境长期潜伏问题**（云端无法直连 YouTube、yt-dlp 无 JS 运行时、ECDICT 未部署），此前未被暴露是因为 17 个存量视频都是 7 月批量处理的，之后环境发生了漂移。

最终产出质量：翻译覆盖率 100%（deepseek-v4-flash）、词级标注 185/187 句、AI 词注 330 条、CEFR 难度 C2、7 因子评分 26.75、自动发布上线。

---

## 2. 全流程时间线与产出

| 阶段 | 环节 | 耗时 | 关键产出 |
|---|---|---|---|
| 0 | 管理员登录（dev-fake 验证码） | 秒级 | JWT token |
| 1 | `POST /videos/seed-full` | ~1s（cookies 探测另计） | 视频行创建（processing） |
| 2 | **Head**: extracting（yt-dlp 元数据） | ~30s | 标题/缩略图/时长/频道/播放量/点赞 |
| 3 | **Head**: 入队 GPU 转录（30%） | 秒级 | `transcription_gpu` 队列任务 |
| 4 | **GPU 转录**（本机 WhisperX） | ~2.5min | 187 段字幕（含词级时间戳） |
| 5 | 质量门禁（幻觉检测）+ 字幕入库 | 秒级 | 187 行 subtitles + quality report |
| 6 | **Tail**: translating（deepseek） | ~4min | 187/187 翻译（100%） |
| 7 | **Tail**: annotating（ECDICT） | ~1min | 185/187 句词级标注 |
| 8 | **Tail**: prewarm_notes（AI 词注） | ~3min | 330 条词注 |
| 9 | **Tail**: downloading + transcoding | 跳过 | 无本地文件（embed 兜底） |
| 10 | **Tail**: ready + 自动发布 + 评分/难度 | 秒级 | ready / published / C2 / 26.75 |

**总耗时约 15 分钟**（不含问题排查；其中 GPU 转录 + 翻译是大头）。

---

## 3. 架构与流程全景

### 3.1 拓扑

```
┌─ 本机（Windows，GPU 转录）────────────────────────────┐
│  NSSM 服务 SeeWordGpuWorker（Celery worker, SYSTEM 账户）│
│  ├─ SSH 隧道(L) 16379→云端 Redis（任务队列）            │
│  ├─ WhisperX: local-model/Whisper-large-v3-turbo (1.6G)│
│  ├─ yt-dlp 2026.07.04 + node v22 + ffmpeg/ffprobe       │
│  └─ HTTP 回调 → seeword.top（转录结果）                 │
└─────────────────────────────────────────────────────────┘
        │ SSH 反向隧道(R) 7897→本机 Clash（云端访问 YouTube 出口）
        ▼
┌─ 云端 VPS（47.122.127.105, Docker Compose）────────────┐
│  backend（FastAPI+gunicorn）  ← 回调/管理 API           │
│  celery（head/tail 流水线）                             │
│  celery-beat（watchdog/定时任务）                       │
│  db（PostgreSQL 16） / redis（队列+锁+进度）            │
│  nginx（TLS 终止+反代）                                │
│  挂载：yt-dlp EJS 组件缓存 / node22 / ecdict.db / cookies│
└─────────────────────────────────────────────────────────┘
```

### 3.2 每个环节用到的组件

| 环节 | 运行位置 | 核心组件 | 关键配置 |
|---|---|---|---|
| seed-full | 云端 backend | FastAPI + video_seed_service | cookies 探测（yt-dlp probe） |
| extracting | 云端 celery | yt-dlp 2026.07.04 | proxy=172.19.0.1:7897、cookiefile、js_runtimes=node、remote_components=ejs:github |
| GPU 转录 | 本机 worker | WhisperX (faster-whisper CTranslate2) + silero VAD + wav2vec2 alignment | WHISPER_MODEL_PATH=local-model、batch=8、2 并发块 |
| 质量门禁 | 云端 backend | transcription/quality.py（重复/乱码/时长/密度/空段 5 项检查） | 阈值见 quality.py |
| translating | 云端 celery | TranslationService → agnes 引擎 → deepseek-v4-flash | TRANSLATION_ENGINE=agnes、batch=5、逐条补漏 |
| annotating | 云端 celery | ECDICT sqlite（851MB 本地词表） | /app/data/ecdict.db 挂载 |
| prewarm_notes | 云端 celery | deepseek 批量生成词注 | word_ai_notes 表 |
| downloading | 云端 celery | yt-dlp 下载视频流 | 失败不阻塞（embed 兜底） |
| transcoding | 云端 celery | ffmpeg 转 720p | media 卷 |
| 评分/难度 | 云端 celery | scoring_service（7 因子）+ difficulty_service | CEFR 基于 word_levels |

### 3.3 状态机

```
pending_processing → processing(extracting→transcribing 30%)
                   → ready_subtitles(translating 70% → annotating 72% → prewarm 74% → downloading 75% → transcoding 90%)
                   → ready(100%) → 自动发布
任意阶段失败 → error（watchdog 超时兜底 / 回调 error / 质量门禁阻断）
recover：processing/ready_subtitles 断点续跑（Redis 步骤集跳过已完成步骤）
retry：error → pending_processing 重新全流程
```

---

## 4. 问题与解决方案

### 4.1 网络层（3 个）

**P1：云端无法直连 YouTube（Errno 101 Network is unreachable）**
- 现象：seed-full 返回 502，后端日志 `Failed to establish a new connection: [Errno 101]`
- 根因：香港 VPS 到 www.youtube.com 路由不通（YouTube 对该数据中心 IP 封锁/路由问题）；云端 `.env` 里 `HTTP_PROXY=http://172.25.176.1:7897` 指向一个**不存在的代理**（本机没有该 IP，是历史配置残留）
- 解决：
  1. 本机 Clash（127.0.0.1:7897）验证可访问 YouTube（200）
  2. 建立 **SSH 反向隧道**：`ssh -N -R 172.19.0.1:7897:127.0.0.1:7897 seeword`（云端 Docker 网关地址 ← 本机 Clash）
  3. 云端 sshd 开启 `GatewayPorts clientspecified`（仅显式绑定地址开放，不暴露公网）
  4. `.env` 与 compose 补 `HTTP_PROXY=http://172.19.0.1:7897` 映射（compose 的 environment 必须显式列出变量！）
- 验证：云端 `curl -x http://172.19.0.1:7897 youtube.com` → 200

**P2：容器内无法访问宿主机代理（127.0.0.1 是容器自己）**
- 现象：容器内 proxy 配 `127.0.0.1:7897` 后仍失败
- 根因：Docker bridge 网络下容器与宿主机网络命名空间隔离
- 解决：隧道绑定 docker 网关 `172.19.0.1`（`docker network inspect seeword_default` 查得），compose 挂载路径用网关地址

**P3：反向隧道进程易断**
- 现象：隧道 SSH 进程消失（系统重启/网络波动），代理立即失效
- 现状：手动重启（`ssh -N -R ...` 后台）
- 建议：参照 `SeeWordGpuTunnel` 服务（NSSM），把反向隧道也注册为**自启动服务**（见 §7）

### 4.2 yt-dlp / JS 运行时层（4 个）

**P4：yt-dlp 无 JS 运行时，只能拿到图片格式**
- 现象：`[youtube] n challenge solving failed: Some formats may be missing` → `Requested format is not available`
- 根因：YouTube 的 n-challenge 签名需 JS 运行时（EJS）解算；云端容器无 node/deno，且 **yt-dlp 2026.07.04 默认只启用 deno，node 需显式 `js_runtimes: {"node": {}}` 且要求 node ≥ 22.0.0**
- 解决：
  1. Dockerfile.cloud 加 `nodejs`（Debian 源只有 v20.19.2 —— 不达标！）
  2. 从 npmmirror 下载 node v22.20.0 Linux 二进制（30MB），解压挂载 `/opt/node22:ro`，compose 覆盖 `PATH=/opt/node22/bin:...`
  3. 代码 3 处 yt-dlp opts 加 `"js_runtimes": {"node": {}}` + `"remote_components": "ejs:github"`（youtube_cookies_service / video_processing 提取与下载 / audio_extractor CLI 参数）
- 验证：容器内 `formats: 159`（完整格式列表）

**P5：EJS 组件（challenge-solver）无法从 GitHub 下载**
- 现象：即使有 node，`n challenge solving failed`（组件缺失）
- 根因：`remote_components: ejs:github` 需从 GitHub 拉组件脚本，云端访问 GitHub 也不通
- 解决：把本机 `~/.cache/yt-dlp/challenge-solver/lib.json` + `youtube-sigfuncs/`（本机探测成功时自动下载的）打包上传，挂载到容器 `/root/.cache/yt-dlp:ro`
- 踩坑：Windows zip 解压产生**反斜杠文件名**，需用 python 整理目录结构（`challenge-solver\lib.json` → `challenge-solver/lib.json`）

**P6：yt-dlp 旧版下载 403 Forbidden**
- 现象：元数据正常（-J 成功），但 `download=True` 时媒体流 403
- 根因：yt-dlp 2026.06.09 对 YouTube 新的 m3u8/POT 流处理有回归，媒体段下载被拒
- 解决：`pip install -U yt-dlp` → 2026.07.04，**下载立即成功**（17.28MB 音频 2 秒）

**P7：GPU worker 的 yt-dlp 是 subprocess CLI**
- 现象：worker 侧报错与 Python API 侧不同步
- 根因：audio_extractor.py 用 CLI 调用，参数走 `_build_ytdlp_extra_args()`，与 Python opts 是两套代码
- 解决：CLI 参数补 `--js-runtimes node --remote-components ejs:github`；升级 **venv 内** yt-dlp（`backend\.venv\Scripts\pip install -U yt-dlp`）

### 4.3 本机 GPU 环境层（3 个）

**P8：ffmpeg/ffprobe 在 NSSM 服务（SYSTEM 账户）中找不到**
- 现象：`Audio extraction failed: [WinError 2] 系统找不到指定的文件`（音频下载成功但转换失败）
- 根因：WinGet 安装的 ffmpeg 只在用户 PATH（`...\WinGet\Links`），SYSTEM 账户服务环境的 PATH 不含该目录；且 `get_video_duration` 还需要 **ffprobe**（不只 ffmpeg）
- 解决：`Copy-Item ffmpeg.exe/ffprobe.exe → C:\Windows\System32\`（SYSTEM PATH 必含），重启服务

**P9：WhisperX 模型路径指向 HF 名称，缓存残缺触发联网下载**
- 现象：`cannot find the appropriate snapshot folder ... check your internet connection`（HF 下载失败）
- 根因：`.env.gpu-worker` 的 `WHISPER_MODEL_PATH=large-v3`（HF 模型名）被误改；本机 HF 缓存 `faster-whisper-large-v3` 是**残缺的**（model.bin 仅 67MB `.incomplete`）；而本机完整模型在 `C:\Users\Administrator\local-model\Whisper-large-v3-turbo`（1.6GB，主 `.env` 一直指向它）
- 解决：`.env.gpu-worker` 改回本地路径（**项目原本的调用方式就是加载本机 CTranslate2 目录**）

**P10：SYSTEM 账户读不到 Administrator 的 HF/torch 缓存**
- 现象：silero VAD、alignment 模型、标点模型全部联网下载超时（huggingface.co 不通）
- 根因：NSSM 服务以 SYSTEM 运行，`~/.cache` 解析到 `C:\WINDOWS\system32\config\systemprofile\.cache`（空）；模型实际缓存在 Administrator 账户
- 解决：`.env.gpu-worker` 加 `HF_HOME=C:/Users/Administrator/.cache/huggingface`、`TORCH_HOME=C:/Users/Administrator/.cache/torch`、`HTTP_PROXY=http://127.0.0.1:7897`
- 结果：WhisperX 完整管线（VAD + wav2vec2 alignment）恢复，日志 `WhisperX ASR complete + WhisperX aligned`

### 4.4 云端代码/配置层（5 个）

**P11：回调 500 — quality.py 用 dict 访问 pydantic 模型**
- 现象：转录成功后回调 4 次 500，`AttributeError: 'TranscriptionSegment' object has no attribute 'get'`
- 根因：`check_transcription_quality` 5 个检查函数全部 `s.get("text")`，而回调 payload 的 segments 是 pydantic 模型（**潜伏 bug，之前 17 个视频回调时未触发说明此路径近期才接入或从未真正走通质量门禁**）
- 解决：quality.py 加 `_seg_value()` 兼容 dict 与模型，5 处调用全部替换

**P12：ECDICT 数据库未部署**
- 现象：词级标注 0、难度跳过（`has insufficient word data`）、词注 0
- 根因：云端 backend 目录没有 `data/`（851MB ecdict.db 从未同步），`/app/data/ecdict.db` 不存在
- 解决：scp 812MB ecdict.db → 云端，compose 挂载 `./backend/data:/app/data:ro`，`recover` 断点续跑补齐标注/难度/词注

**P13：docker compose restart 不重载 .env**
- 现象：改完 `.env` 后 `restart` 容器内仍是旧值
- 根因：`docker compose restart` 不重新渲染环境变量，需 `up -d`（检测到变更才 recreate）或 `--force-recreate`
- 解决：统一用 `docker compose up -d --force-recreate backend celery`

**P14：nginx 缓存 upstream 解析 IP，容器重建后 502**
- 现象：`connect() failed (111: Connection refused) while connecting to upstream: 172.19.0.5:8000`
- 根因：nginx 启动时解析一次 `backend:8000` 并缓存；backend 容器重建后 IP 漂移（.7 → .5 → .7）
- 解决：每次重建 backend/celery 后 `docker restart seeword-nginx-1`（重新解析）

**P15：celery 是独立镜像 tag，build backend 不更新它**
- 现象：celery 容器一直跑旧代码（改了代码重建 backend 后 celery 仍是旧版）
- 根因：compose 中 backend/celery 各自 `build`，镜像 tag 不同（seeword-backend / seeword-celery）
- 解决：`docker compose build backend celery`（两个都构建）；改代码后**必须双镜像重建**

### 4.5 数据/风控层（2 个）

**P16：YouTube cookies 被高频轮换（几分钟失效）**
- 现象：导出的 cookies 本地验证有效，上传后几分钟内云端使用即报 `Sign in to confirm you're not a bot`
- 根因：同一账号 cookies 被多个出口 IP/客户端（本机 + 云端代理 + yt-dlp）同时使用，触发 YouTube 风控；另 `.env.gpu-worker` 未配置 cookies 路径导致 worker 一直用旧文件 `youtube_cookies_new.txt`
- 解决（临时）：处理前即时导出 → 同步本地/云端 → 立即执行；`YOUTUBE_COOKIES_PATH` 补到 `.env.gpu-worker`
- 根治建议：见 §7（专用账号 / 浏览器会话直用 / 下载缓存）

**P17：视频状态与任务生命周期错位**
- 现象：转录成功回调 200 但视频无变化（仍是 error）
- 根因：回调端 `if video.status != processing: return` —— 上一轮失败回调已把视频标 error，成功回调被忽略（幂等保护的副作用）
- 解决：SQL 恢复状态为 processing 后重新入队转录（`transcribe_video_gpu.apply_async` 直推队列）

---

## 5. 影响质量的关键因素

按影响力排序：

1. **转录质量（WhisperX 完整管线）**
   - 必须 `whisperx` 引擎 + silero VAD + wav2vec2 **alignment**（词级时间戳）
   - alignment 缺失 → 字幕句子边界粗、无词级数据 → 练习/精读功能降级
   - 关键配置：本地 1.6GB 模型（非 HF 残缺缓存）、batch_size=8、2 并发块、语言锁定 en

2. **翻译质量（引擎 + 覆盖率）**
   - deepseek-v4-flash 实测翻译**专业术语准确**（DRAM/内存位/美光），覆盖率 100%
   - 质量门禁（覆盖率阈值）会在低覆盖时自动 block → 管理端换引擎重翻
   - 关键：batch=5 小批量防句子合并、逐条补漏重试、translation_quality_report 持久化

3. **词级标注（ECDICT）**
   - 缺失会导致：练习出题无词级、难度无法计算、词注无法生成（连锁反应）
   - 851MB 本地词表是**部署必需品**，必须进镜像/挂载

4. **元数据完整性（外部指标）**
   - 播放量/点赞/频道数据 → 评分因子（viral/freshness）+ 首页推荐排序
   - 提取失败不影响主流程，但视频在推荐池里权重低

5. **时间戳精度（alignment 的 187 vs 17 段）**
   - 原始 ASR 17 段（句子级）→ alignment 后 79 段 → 切句后 187 字幕
   - 切句逻辑 + 词级时间戳决定练习"跟读/填空"的体验

---

## 6. 可改进环节与优先级建议

### P0（影响可用性，尽快做）

| 改进 | 现状 | 方案 |
|---|---|---|
| **cookies 治理** | 每次处理都要手工导出，几分钟失效 | ① 专用 YouTube 账号（不用于日常浏览，减少轮换）；② 处理脚本化：导出→同步→触发一键完成；③ 评估 yt-dlp 无 cookies 降级策略（部分视频无 cookies 可下载） |
| **反向隧道服务化** | 手动后台进程，断了就 502 | 仿照 `SeeWordGpuTunnel` 注册 NSSM 服务 `SeeWordProxyTunnel`，开机自启 + 崩溃重启 + 心跳检查 |
| **watchdog_stale_transcriptions KeyError** | beat 每 5 分钟报一次任务不存在的错误 | 核对 celery_app.py beat_schedule 与实际任务名（改名后未同步），修正或删除过期条目 |

### P1（提升效率）

| 改进 | 现状 | 方案 |
|---|---|---|
| **流水线一键脚本** | 需手工做：导出 cookies → 同步云端 → retry → start → 轮询 | `scripts/submit_video.ps1 <url>`：全自动（导出→上传→seed-full→轮询→产出摘要），解决 cookies 窗口问题 |
| **转录超时/重试策略** | transcribe 任务 3 次 retry 后直接失败 | retry 前先刷新 cookies（重试参数里带上 cookies 版本号）；失败时自动重新导出 |
| **localize 自动重试** | downloading 失败静默跳过（embed 兜底），本地文件缺失 | beat 定时任务：对无 video_url 的 ready 视频自动 localize（已有 retry_failed_downloads，需确认覆盖新视频） |
| **镜像构建合并** | backend/celery 双 tag 双构建 | compose 用同一个镜像名 + `image: seeword-backend:latest` 共享，减少构建与漂移 |

### P2（体验与质量）

| 改进 | 说明 |
|---|---|
| 转录进度上报 | WhisperX chunk 完成时通过 Redis 更新进度（当前只有 30% 固定值），前端能看到真实进度 |
| 词注并发 | prewarm_engines 目前 agnes,qwen（deepseek 单引擎），可配置多引擎并发（prewarm_concurrency=4） |
| 翻译引擎 fallback 链 | TRANSLATION_FALLBACK_ENGINE 空（只有 deepseek），可加备用引擎防单点 |
| 下载带宽限制 | 大视频下载占满带宽影响在线服务，yt-dlp `--limit-rate` 可配置 |
| 失败通知 | 流水线失败通知 admins（已部分实现：翻译质量阻塞有告警），扩展到转录/下载失败 |

---

## 7. 提效方案

### 7.1 单视频处理提效（当前 ~15min → 目标 <8min）

- **转录提速**：当前 2 并发块（WHISPER_MAX_CONCURRENT_CHUNKS=2），GPU 利用率看 8GB 显存余量，可试 3-4；`WHISPERX_BATCH_SIZE` 8→16（turbo 模型 + float16 有显存余量时）
- **翻译提速**：deepseek 批处理 batch=5 偏保守（hy_mt2 时代的设置），可试 10-20（deepseek 1M 上下文无句子合并问题）；`TRANSLATION_CONCURRENT=false` 可评估双引擎并发
- **并行化**：translating 与 annotating 天然无依赖（翻译写 text_zh，标注写 word_levels），可并行；downloading 可与翻译并行（当前串行）

### 7.2 批量处理提效

- 批量脚本：多 URL 排队处理（cookies 一次性导出，多个视频共享窗口）
- head 并行：多个 extracting 任务并发（celery 默认并发，确认 worker concurrency）
- 标准版本复用：同 URL 二次提交走 fork（秒级复制字幕/练习），**零 GPU 成本**

### 7.3 运维提效

- 部署脚本化：`deploy.sh`（scp 代码 → build backend celery → up -d --force-recreate → restart nginx）一次完成，避免漏步骤
- 环境校验脚本：启动前检查 node≥22、ffmpeg/ffprobe、ECDICT、cookies 有效性、隧道连通，输出体检报告
- 监控：celery flower 已部署（5555）；补充流水线指标（各步骤耗时、失败率、cookies 失效次数）到 Loki

---

## 8. 运维与上线保障

### 8.1 上线 Checklist（新增视频前）

```
□ 本机：SeeWordGpuTunnel 服务运行（16379 通）
□ 本机：反向隧道 7897 通（云端 curl -x 172.19.0.1:7897 youtube.com → 200）
□ 本机：SeeWordGpuWorker 服务运行 + 心跳在线（管理端 worker-status）
□ 本机：node v22+ / ffmpeg / ffprobe / yt-dlp 2026.07.04 / 模型路径正确
□ 云端：ECDICT 挂载（/app/data/ecdict.db 存在）
□ 云端：yt-dlp EJS 缓存挂载（/root/.cache/yt-dlp/challenge-solver/lib.json）
□ cookies：刚导出（处理窗口 <5 分钟）
□ 云端：全部容器 healthy
```

### 8.2 故障速查表

| 症状 | 根因 | 快速处置 |
|---|---|---|
| 502 cookies 探测失败 | 云端到 YouTube 不通 / cookies 失效 | 查隧道（`curl -x 172.19.0.1:7897 yt`）→ 重启隧道 → 重导 cookies |
| Requested format not available | JS 运行时/组件缺失 | 验 node 版本（≥22）、缓存挂载 |
| 403 下载失败 | yt-dlp 版本旧 | `pip install -U yt-dlp`（本机 venv + 云端镜像） |
| WinError 2 | ffmpeg/ffprobe 缺失（服务账户） | 复制到 System32 + 重启服务 |
| HF snapshot 找不到 | 模型路径是 HF 名 / SYSTEM 缓存空 | 改本地模型路径 + HF_HOME/TORCH_HOME |
| 回调 500 | quality.py 模型访问（已修） | 升级后端镜像 |
| 转录成功但视频不变 | 状态非 processing 回调被忽略 | 恢复状态 → 直推队列 |
| nginx 502 Connection refused | 容器 IP 漂移 | `docker restart seeword-nginx-1` |
| celery 跑旧代码 | 双镜像只重建了一个 | `docker compose build backend celery` |

### 8.3 本次遗留事项

1. 该视频无本地 720p 文件（embed 播放兜底）——管理端「搬运到本地」可补（需有效 cookies）
2. 反向隧道建议服务化（§7）
3. watchdog 任务名漂移修复
4. `docs/operations/GPU-WORKER-SETUP.md` 与 RUNBOOK 需补充本次环境结论（node22/模型路径/隧道）

---

## 9. 附录

### 9.1 本次修改/新增的配置

| 位置 | 变更 |
|---|---|
| 本机 `.env.gpu-worker` | WHISPER_MODEL_PATH→本地模型；+HF_HOME/TORCH_HOME/HTTP_PROXY；+YOUTUBE_COOKIES_PATH |
| 本机 `backend/Dockerfile.cloud` | runtime 加 nodejs（注：Debian v20 不达标，实际用挂载的 v22） |
| 本机代码 `youtube_cookies_service.py` | opts 加 js_runtimes/remote_components |
| 本机代码 `video_processing.py` | 提取/下载 opts 加 js_runtimes/remote_components |
| 本机代码 `audio_extractor.py` | CLI 加 --js-runtimes/--remote-components |
| 本机代码 `transcription/quality.py` | 修复 dict 访问模型 bug |
| 云端 `.env` | OPENAI→deepseek、HTTP_PROXY→172.19.0.1:7897、YOUTUBE_COOKIES_PATH、TRANSLATION_ENGINE=agnes、SMS 降级 |
| 云端 `docker-compose.prod.yml` | 挂载：yt-dlp-cache/node22/backend/data；环境变量：PATH/HTTP_PROXY/TRANSLATION_*；cookies 可写 |
| 云端 `sshd_config` | GatewayPorts clientspecified |
| 本机 `C:\Windows\System32` | ffmpeg.exe / ffprobe.exe |

### 9.2 关键验证命令

```bash
# 云端经隧道访问 YouTube
curl -x http://172.19.0.1:7897 https://www.youtube.com

# 容器内 yt-dlp 探测
docker exec -i seeword-backend-1 python - <<'EOF'
import yt_dlp
opts = {"quiet": True, "skip_download": True, "js_runtimes": {"node": {}},
        "remote_components": "ejs:github", "proxy": "http://172.19.0.1:7897",
        "cookiefile": "/app/youtube_cookies_fresh.txt"}
with yt_dlp.YoutubeDL(opts) as ydl:
    info = ydl.extract_info("https://www.youtube.com/watch?v=S3geK7xVDQU", download=False)
    print(info["title"], len(info["formats"]))
EOF

# 手动入队转录（跳过 head）
docker exec -i seeword-backend-1 python - <<'EOF'
from app.tasks.video_processing import transcribe_video_gpu
from app.core.config import get_settings
transcribe_video_gpu.apply_async(args=[VIDEO_ID, URL, "imported"],
                                 queue=get_settings().transcription_gpu_queue_name)
EOF
```

### 9.3 参考

- 处理流水线：`backend/app/tasks/video_processing.py`（process_video → transcribe_video_gpu → finalize_video）
- 转录服务：`backend/app/services/transcription/`（whisper_model / audio_extractor / chunked_transcription）
- 质量门禁：`backend/app/services/transcription/quality.py`
- 部署：`docker-compose.prod.yml` / `backend/Dockerfile.cloud`
- 运维：`docs/operations/GPU-WORKER-SETUP.md`
