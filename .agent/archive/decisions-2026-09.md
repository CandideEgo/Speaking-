# Decisions Archive — 2026-09

> **Frozen snapshot — archived 2026-09-22.** DEC-029 … DEC-036, moved verbatim out of
> `.agent/decisions.md` when it reached its size ceiling. Nothing was edited, reordered or
> renumbered; `decisions-index.md` still lists all eight. Not maintained, not checked — and the
> markdown links below are written for their pre-move location in `.agent/`.

## 2026-09-08 — 翻译引擎统一为火山引擎 ARK (ark-code-latest)

**Problem**: 翻译引擎 registry 中 `agnes`(走 deepseek)/`qwen`/`hy_mt2`/`glm` 的 API key 多数已删（2026-08-05 expired），只剩 agnes 实际可用但质量参差；火山引擎 ARK Coding 端点 `https://ark.cn-beijing.volces.com/api/coding/v3` 上线 ark-code-latest 声称 OpenAI 协议兼容（chat.completions + Responses API）。
**Options**: A) 新建 `BUILTIN_ENGINES['ark']` 条目 + `_resolve_engine` 分支 + Settings + 测试；B) 复用现有 `custom` 引擎条目只改 `.env`（`TRANSLATION_CUSTOM_*` 三个 env 已有），`ai_service._get_engine_client(name)` 复用 translation client，prewarm 同步切只需改 `PREWARM_ENGINES=custom`
**Decision**: B（详见 [ADR-0018](../docs/adr/0018-ark-cody-translation-engine.md)）：`.env` 末尾追加 7 行（TRANSLATION_ENGINE=custom + TRANSLATION_FALLBACK_ENGINE= 空 + TRANSLATION_CUSTOM_BASE_URL/MODEL/API_KEY + PREWARM_ENGINES=custom + TRANSLATION_BATCH_SIZE=5）。代码零改动。
**Reason**: 零代码改动即接入，未来切换供应商也只需改 env 三行；端到端本地验证完整 pipeline 跑通：catalog promote → WhisperX 转录 35 段 → ark 翻译 35/35 → ark prewarm 词注释 → YouTube 下载 24.7MB → ffmpeg 720p 转码 → ready/published，整段 finalize 117s
**Trade-offs**:
- `TRANSLATION_FALLBACK_ENGINE` settings 默认 'hy_mt2'（无 key 会启动失败），**必须显式置空**
- API key 字段暂填 ARK endpoint ID（值见密码库，勿写入仓库；按用户指示），生产前做一次 promo 冒烟观察 5-10 分钟
- ark-code-latest 是 coding 命名（可能原意是代码模型），翻译/prewarm 是非典型场景；本地质量好，生产头两周需持续观察
- batch_size 5 偏保守（ark 单次响应 20-30s/批），后续可 benchmark 调高
- 旧 `TRANSLATION_ENGINE=agnes` 行（`.env:33`）已注释（dotenv 按文件顺序读，否则会覆盖新设置）
- celery 5.4.0 + Windows + `--loglevel=info` 有 bug（`tasks, accept, hostname = _loc` 报 "not enough values to unpack"，`_localized=[]`），**生产 Linux 不会遇到**，本地用 `--pool=solo` 绕开
---

## 2026-09-09 — YouTube anti-bot：POT provider + 代理中继（48 条批量上线）

**Problem**: catalog 批量 promote 全线失败。两个叠加症状：(1) metadata extract 报 `Sign in to confirm you're not a bot`；(2) cookies 换新后 extract 通了，但音频下载 34 次全部 600s 超时、一个字节都没下来。
**Options**: A) 频繁手工换 cookies（治标，YouTube 几分钟就轮换）；B) 部署 bgutil POT provider 提供 proof-of-origin token；C) 放弃自托管改 embed 播放（ADR-0017 已记的版权路线，但产品形态要改）
**Decision**: B。docker 起 `bgutil-ytdlp-pot-provider` + 一个 socat `proxy-relay` 容器；`extractor_args` 三项固定为 `player_client=web,android` + `youtubepot-bgutilhttp:base_url`；新增 `scripts/setup_pot_proxy.ps1` 自动发现宿主 LAN IP 并双侧验证。
**Reason**: 下载从 600s 超时变成 12MB/1-3 秒。一夜 48 条上线，3 条失败全是源视频真失效（private/deleted），零管线故障。

**Trade-offs / 非直觉约束（都是实测踩出来的）**:
- **代理地址不能用 `127.0.0.1`**。插件源码 `'proxy': request.request_proxy` 会把 yt-dlp 的 `--proxy` 值原样转发进容器请求体，容器里 `127.0.0.1` 指向自己 → `ECONNREFUSED` → 无 POT → YouTube 强制 SABR → 格式全跳过 → 下载空转。必须用宿主/容器同解的地址（socat relay 发布在全网卡）。
- **容器启动时那次 POT 会成功**（用自己 env），之后每次请求都失败。**只验一次会得到假阳性** —— 我第一轮就是这么误判的。必须两侧都测。
- `base_url` 必须显式传，否则插件访问自己默认的 `127.0.0.1:4416` 也走 proxy，每次 20s 读超时。
- `tv` player_client 对多数视频返回 `UNPLAYABLE`；带 cookies 时 `android` 会被跳过（不支持 cookies），实际只剩 `web`，而 web 强依赖 POT。
- `--net=host` 在 Windows Docker Desktop 不通；宿主 hosts 里的 `host.docker.internal` 可能是陈旧地址（本机指向已失联的 192.168.1.2）。
- 地址是 DHCP LAN IP，**不能写死**在 `.env`（该文件被 gitignore，换网络后静默失效）。由脚本重建。
- **PowerShell 改 `.env` 必须显式 UTF-8**：`Set-Content` 默认写 ANSI(GBK)，把 28 处中文注释的三字节 UTF-8 第三字节打成 `?`，python-dotenv 直接 `UnicodeDecodeError`，两个 worker 全起不来。脚本已改 `WriteAllText` + `UTF8Encoding($false)` 并在写后强制校验。
- **cookies 双向写回**：yt-dlp 的 `cookiefile` 是读写的（官方文档"read from and dump to"），anti-bot 响应带清 auth 的 `Set-Cookie`，会把 `LOGIN_INFO` 洗掉（实测 739KB → 377KB）。用 `disposable_cookiefile()` 传副本规避。
- **cookies 必须无痕窗口导出**：普通窗口导出的会被服务端几分钟内轮换；无痕导出后关窗口可用 3-5 天。有效性判据是 `LOGIN_INFO` 是否存在。

---

## 2026-09-09 — 批量驱动与 worker 必须服务化托管（NSSM）

**Problem**: celery worker 反复"消失"，任务卡在 `processing`。`nohup` 和 `Start-Process` 起的进程都在 bash 工具调用结束时被回收。
**Options**: A) 每次手工在前台窗口起（无法无人值守）；B) NSSM 服务托管（GPU worker 已用这套且能活）
**Decision**: B。新增 `scripts/run_celery_worker.ps1` 和 `run_batch_driver.ps1`，套用 `run_gpu_worker.ps1` 的 wrapper 模式。
**Reason**: 服务化后同一 PID 跨调用存活，6 小时无人值守跑完 48 条。

**Trade-offs**:
- **服务以 SYSTEM 运行，PATH 里没有 per-user 的 Python 和 console scripts**。这暴露了一个既有 bug：`_get_ytdlp_path()` 只探 `sys.executable` 同级目录，但 Windows 上 console script 在 `Scripts\` 下一层 → `[WinError 2]`。之前从交互式 shell 启动才没显形。已补 `Scripts`/`bin` 探测。
- 批量驱动是一次性的（队列空就退出），NSSM 需配 `AppExit Default Exit` 否则会被无限重启。
- 服务的 TEMP 不是 Administrator 的，token 路径不能用 `ADMINI~1` 短名，改绝对路径 `C:/tmp/`。

---

## 2026-09-09 — 上线验证判据：feed 排名不算、mp4 404 才算

**Problem**: 批量 4 条 error 里 **3 条是校验误报**，视频线上完全健康。逐条核实后才发现判据本身有问题。
**Decision**: 通过条件 = 详情端点 `is_published` + 封面 HTTP 200 + mp4 **非 404**；feed 位置只记录不判罚；媒体上传加 3 次重试。
**Reason**: 三种误判各有根因：
- **feed top20**：排名是排序结果不是发布事实，上线量一多新视频必被挤出，会随规模持续误杀。
- **wait timeout 900s**：1009s 的视频光 ASR+对齐+分批翻译就要 15 分钟。两条 539s/1009s 视频本地已出 115/229 条字幕却被判失败。改 2400s。
- **push 超时**：SQL 进了、媒体没进 → 站上可见但没封面播不了。**比单纯失败更糟，因为它能通过原校验**。mp4 有解锁门所以 **403 = 健康，404 = 文件没落地**，这是唯一能识别半推送的硬信号。

**Trade-offs**:
- 媒体文件名不能按 id 拼：低于 720p 的源跳过转码（`video_url_720p` 指向 `<id>.mp4`），封面新 `.webp` 旧 `.jpg`，磁盘上可能只有 `<id>_raw.mp4`。必须从 DB 读 + `_raw` 回退。
- SQL 导入必须 `cat ... | docker exec -i psql`。`docker cp` + `psql -f` 报 `INSERT has more expressions than target columns`，即使列数确认一致、同语句 `psql -c` 正常。原因未查明，疑似 `docker cp` 对 UTF-8 内容的处理差异。**RUNBOOK §6.7 3b 原先的 sed 删列指令已作废**（生产 schema 已有 `is_demo`/`is_auto`，照做反而出错）。

---

## 2026-08-30 — D12 可访问性：浅层落地（Lighthouse 96/100，超 90 达标线）

**Problem**: §4-D12 5 项（快捷键/形状区分/aria-label/focus ring/Lighthouse ≥ 90）。
**Options**: A) 引 axe-core + jest-axe 全量自动化；B) 手工浅层修复
**Decision**: B（详见 ADR-0016）
**Reason**: 工作量 M=2 天，全量 axe 集成超 1 周；当前全局 a11y 基础好（82 个 lucide 文件仅 1 处缺漏），手工足够到 96/100。
**Trade-offs**：
- 7 个 `WORD_COLOR_CLASSES` 加 `decoration-{color}-400 decoration-dotted`（色盲友好），不依赖颜色。
- 全局 `*:focus-visible` 已在 globals.css:320 覆盖大多数按钮，无须每按钮写。
- 唯一修：admin 后台 placeholder 铃铛（1 处 aria-label）。
- Lighthouse 3 页 96/100，**唯一未修**：brand-500/muted-soft 小字号对比度（牵全局设计，超 D12 范围）。
- **未引入新依赖**（无 axe-core/jest-axe）——CI 自动化 a11y 留给后续 Phase。

**ADR**: [0016](../docs/adr/0016-d12-accessibility.md)

---

## 2026-08-30 — §10 待拍板 4 项（用户拍板）

**Problem**: 产品设计规划-2026-08 §10 列 4 项需用户拍板，影响 Phase 0/1/2/3 落地完整性。
**Decision**:

1. **#4 示范视频**：暂不弄（`videos.is_demo=true` 不指任何视频；D2 新手引导语需相应去掉"看示范视频"措辞，或后续再补）
2. **#5 周报分享卡片 slogan + 品牌色**：A. 沿用规划默认值（"用真实视频学英语" + coral #FF6B4A + 暖白 #FDF8F3）——已是 D9 现状，无需改动
3. **#6 首页统计行**：不加（维持 streak + 词汇数 + 视频数 3 项）
4. **#7 已解锁视频入口**：**重定义为首页「已解锁优先」开关**（不在 /history 加 Tab）

**#7 实施**（commit 8609847）：
- `useBoostUnlocked` hook：localStorage 持久化，per-device UI 偏好（不污染后端 UserPreferences）
- 首页筛选栏右侧（sm: 以上）加 peer 模式开关，Pro 用户（`unlockedInfo=null`）隐藏
- 排序逻辑：`useMemo` 把 videos 拆 unlocked + rest 拼接，**保持各自内部相对顺序**（不打乱后端推荐/分类/难度）
- a11y：aria-label + focus-visible ring（走全局 brand 描边）
- mobile 393px 下隐藏（节省空间）

**Trade-offs**：
- localStorage 而非 backend：开关是 UI 偏好非学习偏好；如未来需跨设备同步，再迁 `UserPreferences`。
- 移动端不显示：避免 393px 筛选栏拥挤；如用户反馈需要，再加 mobile popover 入口。

---

## 2026-08-30 — 频道升级为全量作者页 Auto-Channel（ADR-0014 修订）

**Problem**: ADR-0014 频道为策展制--只有管理员建档的作者才有主页；用户期望主流流媒体式的「每个作者都有主页，点作者名看本站该作者全部视频」。
**Decision**: 全量作者页（详见 [ADR-0014 修订](../docs/adr/0014-video-channels.md)）：

1. ingest 自动建档：`ensure_channel_for`（find-or-create），按抓取 `channel_id` 未注册则建 `is_auto=True` 频道；策展频道优先不重复建
2. `channels.is_auto` 列 + `upstream_channel_id` 唯一索引（迁移 `e0f1g2h3i4j5`，先合并存量重复）
3. slug 规则：slugify(名) -> `upstream_id` 小写（中文名回退）-> hash 后缀兜底
4. 封面动态兜底：`cover_url` 空时用频道最新公开视频缩略图（yt-dlp 拿不到频道头像，不建 avatar 字段）
5. `GET /channels` 分页化：策展在前（sort_order）、自动在后（视频数 desc）；空频道隐藏；ChannelStrip 取前 12
6. 作者名入口：序列化补 `channel_slug`（browse/home/favorites/detail，browse 顺手补 `channel_name` 修卡片恒显 SeeWord 旧 bug）；VideoCard 频道名可点（span + router.push 避免嵌套 `<a>`）；watch 页 meta 行作者名替换写死 "SeeWord"
7. 回填脚本 `scripts/backfill_auto_channels.py`（--dry-run 支持）

**Trade-offs**:
- 频道数 = 作者数（可能数百）：靠排序 + 分页消化；自动频道观感依赖封面兜底，运营可在 admin 逐步装修
- 并发建档竞态交给唯一索引 + Celery 重试，不额外加锁
- 订阅/关注、频道内搜索、频道级统计维持一期不做

---

## 2026-09-08 — 视频候选池 Catalog（抓取发现与逐条策展解耦）

**Problem**: 官方视频只有硬编码 seed 脚本 + 单条 URL seed 两路，缺「批量发现候选 → 人工逐条筛选上线」中间层；竞品 Language Reactor 公开目录 API（`api-cdn.dioco.io/base_media_getMediaDocs_5`，无需鉴权）可批量拉元数据，但默认「全英语·按时间」池 ~80% 新闻/体育，不符合选材标准。
**Options**: A) 直接灌进 `videos` 表；B) 独立候选池表 + 复用现有 `seed_video` 管线逐条提升；C) 只做外部脚本不改后端
**Decision**: B（详见 [ADR-0017](../docs/adr/0017-catalog-candidate-pool.md)）：新增 `catalog_items`（与 videos 解耦，`(source,upstream_id)` 唯一幂等，`promoted_video_id` FK→videos SET NULL）+ `catalog_service`（fit_score 数值筛 / 幂等导入 / 列表 join Video 派生 effective_status 免 beat / promote 复用 seed_video / mark）+ `/api/v1/admin/catalog*`（list/summary/get/promote/mark）+ `scripts/import_catalog.py`（--dry-run）。内容侧改按 LR 频道级 API `sortBy=views` 重抓 56 个英语教学/教育/谈话频道 672 条，import 按 category 加权（+18/+12/+8）使学习内容 fit 领先。
**Reason**: 解耦「发现」与「处理」不污染 videos 语义；复用久经测试的 seed 管线不重造轮子；候选池让管理员按 fit 排序 + 频道筛选逐条策展。
**Trade-offs**:
- promote 走完整管线=下载自托管，依赖服务器 YouTube cookies（失效 423 需重登）；embed 轻量模式暂未接入（现有轻量路径仅在 seed 脚本、未抽 service）
- **版权风险**：下载自托管第三方 YouTube 内容（含新闻媒体）= 侵权 + 违反 ToS；上线前对敏感内容应改 embed 或选可授权/CC 素材（已知会产品负责人决策）
- fit_score 是数值筛非主题判断；主题策展靠人工 promote + category 加权
- 未做：admin 前端页（Phase 2）、生产部署（Phase 3）、重抓脚本收进 backend/scripts
