# Changelog

本项目所有重要变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

`npm run release` / `scripts/release.sh` 会自动 bump 版本并把未发布区段归档为新版本。

## [Unreleased]

### Added
- **默认头像：线描男女插画，跟随用户性别（09-22，DEC-048）**：新增 `frontend/public/default-avatar-male.webp` / `default-avatar-female.webp`（160×160 无损 WebP，源图存 `seeword-beta-assets/avatar-*-source.jpg`）；新增 `users.gender`（`male`/`female`，可空）由用户在个人资料页「性别」处填写，`PATCH /users/me` 校验取值，默认插画随性别切换——不给单独的「选哪张插画」选择器，那只是一张默认图。未填时按用户 id 哈希给一张确定性的临时插画（对存量账号行为不变），上传的 `avatar_url` 始终优先，且上传不会清掉已填的性别。`lib/avatar.ts` 抽出 `hashSeed` 供 `avatarColor` 与 `defaultAvatarUrl` 共用；`src === undefined`（TopBar 的 `/users/me` 在途）渲染骨架而非插图，避免有头像的用户先闪一张别人的脸；账户页手写 fallback 统一换成 `Avatar`。
- **单词训练两段流 + 播放页频道入口（09-22，DEC-046）**：导航「发现/浏览」改「频道」、「词汇本」改「单词训练」。新增 `GET /api/v1/vocabulary/daily-session`（今日队列：new=从未复习按入库升序、due=到期非 mastered 按到期升序，附 totals；`due_total` 不含 new 词，与徽标 `due_count` 口径不同）；`/vocabulary` 改「今日（训练 Hero：词库掌握环 + 待学/待复习 + CTA）/ 词库（集合+全部单词）」两段视图；`/vocabulary/drill` 改阶段机 learn→review→summary——`WordFlashcard` 新词闪卡（自动发音、认识=quality 4/不认识=2 直写 SM-2、键盘 1/2）、复习段复用 `UnifiedPracticePanel(due_only)` allGraded 自动提交、`TrainSummary`（Confetti ≥80% + 薄弱词）；`?video_id=` 深链保持纯测验。视频详情响应补 `channel_cover_url`，播放页播放器下方新增 `ChannelEntry` 频道入口卡（未挂频道不渲染）。
- **点词分级渲染：`/gloss/static` + `/gloss/enrich` 两级端点（09-21）**：词卡基础内容（词头/音标/词形/ECDICT 释义）由只读内存的 `static` 端点秒出，真题例句 + 高频徽标 + AI 笔记由 `enrich` 后补填充（`lemma` 沿用第一级返回值，不重复归一）；前端 `useWordLookup` 顺序两次请求 + 竞态守卫（快速连点丢弃过期响应），`mergeEnrich` 只合并第二级拥有的字段，避免 enrich 空值污染已展示的静态字段；enrich 失败静默（基础释义已渲染）。旧 `/gloss` 端点保留但前端已无调用方，属休眠端点。
- **榜单页改版：领奖台 + 行重写（09-21，DEC-045）**：`/rankings` 前三名走新 `TopPodium`（`#1` 横贯大卡、`#2/#3` 半行并列，`No.N` 眉标 + 巨型背景名次水印），第 4 名起用重写的 `RankingRow`（大号名次数字、`VideoThumbnail` 带时长与 hover 播放、微标签 + 相对榜首的比例条）；指标文案收敛为 `RANKING_METRIC_LABELS`（`Record<RankingScope, string>`）单一来源；页头改「Trending · 榜单」眉标 + 28px 标题。
- **LLM 视频自动分类与分级（09-21，DEC-042）**：新增 `services/video_classification.py`（canonical 8 类 topic 白名单，`api.v1.browse` 的 `CATEGORIES` 与其同源）；`AIService.chat_json()` 强制 JSON 输出；`finalize_video` 在 prewarm 与下载之间插入幂等的 `classifying` 步骤（best-effort，失败不阻塞上线）；`scripts/backfill_classification.py` 支持 `--dry-run/--limit/--video-id` 回填存量（顺带清洗 A1–C2 之外的脏 difficulty）；前端 `lib/topicCategories.ts` 统一 id→中文标签，feed tab 与卡片共用。生产存量 49 支已回填。
- **首页筛选栏改版 + feed 排序（09-20，DEC-041）**：移除首页独立排行区块；分类改为可展开下拉按钮；新增排序开关（推荐/热播/最新）直接排序视频网格，下拉底部保留「完整榜单」入口；`GET /browse/feed` 新增 `sort=latest|hot`（hot = 站内总播放降序，与周榜去重口径不同源）。
- **视频候选池 Catalog 后端 MVP（08-08，DEC-036）**：抓取发现与逐条策展解耦。
- **真题练习/考试系统（08-04 → 08-13）**：paper bank 模型（exam_papers/exam_questions）+ exam_sessions/exam_answers（paper_exam/daily_check/wrong_redo 三模式）+ 服务端判分 + 答案不下发；错题本（派生查询，重做答对即销账）；练习专题页 + ExamRunner（倒计时/退出/移动端提交栏/两列选项）；`/upgrade` 页三步指引；每日检测深色特色卡；练习统计条。
- **SMS 认证切换阿里云 Dypnsapi（08-09）**：SendSmsVerifyCode/CheckSmsVerifyCode（服务端生成/校验验证码），dev-fake 仅限非生产。
- **全站综合审查与安全修复（08-14，见 docs/progress/REVIEW-2026-08-14.md）**：
  - 安全：上传存储型 XSS 修复（服务端扩展名白名单 + serve_media allowlist + nosniff）、/media/proxy SSRF 修复（禁重定向 + 移除 aliyuncs.com）、草稿/未发布视频媒体发布态门控（owner/admin token 预览）、limiter Redis 故障 in-memory 降级、/media 代理头覆盖 XFF。
  - 部署：prod compose 默认挂载 nginx.ssl.conf（TLS + 安全头 + 日志脱敏）、后端镜像非 root + HEALTHCHECK、deploy 模板与 compose 对齐。
  - 工具链：CI 加 pip-audit / npm audit 硬门、Dependabot、python-multipart 升到 >=0.0.18（CVE-2024-53981）。
  - 测试：CI e2e 数据 seed（watch 核心旅程不再 skip）、Celery 任务体直测、SMS 冷却 TTL 测试、watch 快捷键 e2e 回归。
  - 修复：watch 页快捷键双重监听与字幕导航 seek 失效、管理端引导刷新竞态、重录跟读录音丢失、requirements.txt 缺 Dypnsapi SDK（send-code 502 根因）。
  - 文档：ADR-0013（Shadowing 录音持久化）、SECURITY.md 重写、context/system-map/state 更正。
- **提醒调度（08-29，DEC-026）** / **周报不可变快照（08-29，DEC-027）** / **跟读体验增强（08-30，DEC-028）** / **两天 26 提交深度审查 + 5 项修复（08-30，DEC-021）** / **D12 可访问性浅层落地（08-30，DEC-033）**——从 `.agent/state.md` Recently Completed 尾部剪入（state.md 体积管控， reasoning 见对应决策条目）。
- **翻译引擎统一 ARK（09-08，DEC-029）** / **YouTube anti-bot（09-09，DEC-030）** / **NSSM 服务化托管（09-09，DEC-031）** / **上线验证判据（09-09，DEC-032）** / **频道升级 Auto-Channel（08-30，DEC-035）** / **产品设计规划-2026-08 Phase 0-3 + §10 四项拍板（08-30，DEC-034）** / **D0b 产品瘦身（08-28，DEC-025）** / **D0 会员模型（08-28，DEC-024）** / **内测前加固 Phase 0-3（DEC-011/012）**——同上，第二轮从 `state.md` 尾部剪入；DEC-029..036 的正文同轮归档到 `.agent/archive/decisions-2026-09.md`（推理见对应条目与索引）。

### Changed
- `word_notes.get_best_note` 把视频层/全局 × lemma/surface 四个候选合并为单次 `or_` 查询，按 video:lemma → video:surface → global:lemma → global:surface 取最优（此前最多 4 次串行 SELECT；考试词 DB 往返 6→3、非考试词 4→1）。
- 前端 `mediaUrl()` 支持 `withToken`（草稿媒体预览携带 JWT）。
- 后端 `get_engine()` 池参数仅 Postgres 生效（SQLite 兼容）。
- `scoring_tasks` 惰性导入 async_session（与其他任务模块一致，测试可达）。

### Fixed
- **默认头像引入的三处缺陷（09-22）**：①`Avatar` 的失败标记是布尔量且从不随 `src` 变化重置——用户头像 404 后 `errored` 永久为真，此后 `ProfileTab` 上传成功、`avatar_url` 已更新仍渲染默认头像，上传看起来失败。改为按「失败的 URL」记账（`failedUpload` / `failedDefault` / `loadedSrc`），新 `src` 天然脱离失败集合，无需 remount 或重置 effect。②默认插图底色是近白奶油色（实测 `rgb(254,249,230)`，95% 像素亮于 200），落在 `.dark` 的 `#0a0a0a` 画布上是个刺眼白盘，违反 INV-017；仅对默认插图加 `dark:invert`（线描图反转即浅线深底，恰好合于暗色），用户上传图不动。③两个 `default-avatar-*.png` 实为 1024×1024 JPEG（带豆包 AIGC 元数据，扩展名与 Content-Type 都错），而 `next/image` 走自定义 loader 不做任何优化，TopBar 每个页面都要下发约 210KB；重编码为 160×160 无损 WebP（约 21KB / 20KB）。顺带补回账户页头像的 `alt`（换成 `Avatar` 时漏传，可访问名称退化成一个首字母——`Alt` 为 `user.name ?? "头像"`），并把 `dark:invert` 记入 `wiki/architecture/frontend-architecture.md` 的 `dark:` 逃生舱清单。
- **管理端设置页保存栏暗色模式白字白底（09-22）**：`settings/page.tsx` 的保存栏用 `bg-ink` 配 `text-white`（「放弃」按钮另有 `border-white/20 text-white`），而 `.dark` 下 `--ink` 翻转为近白（`globals.css` 的 `.dark` 块），深色主题里整条栏白字白底不可见。改为主题感知的 `text-canvas` / `border-canvas/20`（与其余 `bg-ink` 配对的写法一致）。
- **看门狗漏掉 `classifying`、单视频回填不失效缓存、脏 difficulty 清空后无人回填（09-22）**：①`classifying` 步骤不在 per-step 超时表里，回落到 3600s 默认——LLM 挂死要等一小时才被判失败（实为单次 60s 硬超时的调用）。超时表从 `_run_watchdog_pipeline` 局部字典移入 `pipeline_helpers.get_step_timeouts()`，与 `STEP_PROGRESS` 同处，新增 `pipeline_step_timeout_classifying=600`；新增结构性测试：`STEP_PROGRESS` 中任何非终态步骤缺预算即失败。②两个回填脚本的 `--video-id` 分支写库后直接 `return`，跳过 `invalidate_browse_cache()`，单视频回填后首页最多脏 5 分钟。失效调用抽为 `_invalidate_browse_cache()` 供两条路径共用；`backfill_difficulty.compute_one` 改返回 `(level, written)`，以便区分「已跳过」与「已写入」（此前返回值在跳过时也非 None）。③`clean_dirty_difficulty` 清洗所有状态的脏 difficulty，而重填只覆盖 `ready/ready_subtitles`，非 ready 视频被置 NULL 后无人回填。清洗与重填现共用 `difficulty_service.DIFFICULTY_BACKFILL_STATUSES`；非 ready 视频的脏值改为 `[defer]` 报告而不清除（进入 ready 后由下一次运行清洗+重填）。
- **头像上传后图片 404（09-22）**：`serve_media` 的视频发布态门控只看文件名 stem，头像存为 `avatars/{uuid4}.jpg` 被当作管线视频文件、Video 查无行 → 永久 404（前端 `Avatar` 回退默认头像）。门控收敛为仅 media 根目录文件生效（管线产物恒在根目录，用户内容恒在子目录），新增回归测试锁定子目录裸 UUID 图片必返回 200。此前测试只验上传响应不验 GET 路径，故未被发现。
- **首次登录点击登录后白屏（09-22）**：登录/注册页在 `isAuthenticated` 变 true 的同一轮渲染 `return null`，而 `router.replace(next)` 软导航（RSC flight + 首访 chunk 下载）尚未落地 → 页面全白，弱机/加载失败时需手动刷新。已登录分支改为 `FullPageSpinner`；新增 `app/global-error.tsx`（自带 html/body + 硬刷新按钮）兜底根布局级错误。
- **iOS Safari 播放态与字幕同步（09-21）**：`useVideoPlayer` 新增 `isPlaying` 单一事实源——原生 `play`/`pause` 事件作快速路径、250ms 播放时钟轮询作校正（同时喂 `onTimeTick`），iOS 发伪 pause / 停发 timeupdate 不再让字幕卡死、播放按钮图标停在错误状态；`VideoControls` 改为受控组件（删掉自己的 `paused` 状态与 `play`/`pause`/`volumechange` 监听，改用 `isPlaying` prop），进度条同样补轮询兜底。`seekTo` iOS 健壮化：元数据未就绪（`readyState < HAVE_METADATA`）时先等 `loadedmetadata`/`canplay` 再跳，加载失败清理挂起监听，跳转前强制 `pause` 规避伪 pause 吞掉赋值。`toggleFullscreen` 无 Fullscreen API 时回退 `webkitEnterFullscreen`。
- **视频难度评级全部为 C2（09-21，DEC-043）**：`difficulty_service` 原取每个词的最高考试级别再算 p75，而雅思/托福 order=6 且词表极大，实测 p75 恒为 6、阈值表上限 5.5→C1，导致 49 支视频全落 C2（p75 与 LLM 标签的 Spearman 仅 +0.076）。改为「习得级别」（取词的最低考试级别）+「超纲率」（超出中考词表的词出现占比），阈值用 49 条 LLM CEFR 标签做最优单调分割标定（MAE 0.245 档、75% 精确、100% 落在一档内）；最小样本量 3→30；`backfill_difficulty.py` 新增 `--recompute` 支持校准后重算；两个回填脚本（difficulty/classification）写库后调用 `invalidate_browse_cache()`——此前它们绕过缓存失效，改完数据仍会看到最长 5 分钟的旧值。新分布 A1 1 / A2 6 / B1 8 / B2 30 / C1 4。
- **iPhone 播放页强制全屏、看不到字幕（09-21，DEC-042）**：观看页 `<video>` 补 `playsinline` / `webkit-playsinline` / `x5-playsinline`；`useVideoPlayer.toggleFullscreen` 在 `requestFullscreen` 缺失或被拒时回退 `webkitEnterFullscreen()`。管理端两处预览 video 同步补 `playsInline`。
- **分级颜色误判（09-21，DEC-042）**：`examLevels.displayLevel/wordHighlightClass` 增加 `targetLevel` 参数——词属于所选分级时用该分级颜色，否则回退最高级；后端 `core/exam_levels.display_level` 同步镜像。此前选「四级」时含四级+雅思的词一律渲染雅思红。
- 上传视频落盘扩展名改由服务端 content-type 白名单推导（不再信任客户端 filename）。
- `/media/proxy` 不再跟随重定向；OSS 域名移出代理白名单。
- 未发布 UGC 视频媒体不再公开可下载。

## [0.1.1] - 2026-08-03

### Added
- **Stage 1 播放页速效**：字幕区独立滚动、词卡默认停泊位避让字幕栏（展开=左下/收起=右下）、字幕面板收起时视频区 max-width 约束居中、侧栏收起/展开 toggle（修复 localStorage 残留 collapsed 卡死）。
- **Stage 2 播放页核心**：根容器 `h-full snap-y snap-mandatory`，屏1=视频+字幕面板、屏2=练习区，下滚翻页 + 阻尼吸附。
- **Stage 3 画布编辑器后端**：`POST /admin/{vid}/subtitles/reorder`、`POST /admin/{vid}/subtitles`（新建空行）、`DELETE /admin/{vid}/subtitles/{sid}`，复用 `_validate_timing` 不重叠校验。
- **Stage 3 画布编辑器前端**：删除行 + 新建行 UI、字幕时间轴可视化（字幕块 + 时间标尺 + playhead + 点击定位）、时间块拖拽/缩放（拖块体平移、拖边缘改 start/end，后端校验兜底）。
- **Stage 4 反馈公告系统**：Feedback 模型 + API（用户提交/admin 列表/回复/状态）、公告广播（Notification type=announcement，遍历全体用户）、`/contact` 页（联系方式 + 公告区 + 反馈表单 + 我的反馈）、admin `/admin/feedback` 页（发送公告 + 反馈管理 + 回复）。

### Changed
- 字幕编辑器加内联两步删除（首次点击武装"确认删除"，3s 超时复位）。
- `WordTooltipInline` 加 `data-testid="word-tooltip"` 做稳健测试选择器。

### Fixed
- F1：主应用桌面 sidebar 无收起/展开按钮，localStorage 残留 `sidebar-collapsed=true` 时卡死"无法打开"。
- Stage 1 e2e：词卡选择器 `.fixed.z-50` 与移动端遮罩歧义，改用 `data-testid`；过滤 analytics keepalive 预检 405 网络噪音。

### Diagnosed
- Stage 5 ASR/标注质量：用户报的 good->best / more->mores / out->outing / I->abiding 在当前代码已全部正确处理（`ecdict-exchange-lemma-bug` 已修），无需改代码。详见 `wiki/problems/asr-annotation-quality-diagnosis.md`。
