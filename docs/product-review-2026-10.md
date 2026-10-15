# SeeWord 产品设计评审（2026-10）

**评审范围**：前后端功能设计、用户体验、产品功能完整性。结论基于 `master` 分支当前代码（`7118373`）。

**本文性质**：一次性评审记录，**不是常驻规则**。规则类事实仍以三层 `CLAUDE.md` 与代码为准；这里只记录「产品缺什么、先改什么」的判断与依据。

**明确的边界**（评审前与作者对齐）：

- ADR-0002（跟读无 AI 评分）与 ADR-0012（砍社区 UGC）的原有决定**不碰**；但口语评测作为**新方向**可以讨论。
- 播放页「本视频暂不出试卷」占位卡是**有意保留**的，后续会换形式出，本文不建议删除它。
- 下一阶段四项北极星全要：内测留存、备考付费转化、内容规模化、应试能力覆盖。

---

## 0. 结论提要

这个项目的**内容生产工业化能力**与**学习数据采集面**远超同类小产品——三段式视频管线（head/GPU/tail）、词级考级标注、翻译质量门、约 200 个 API 端点、约 60 个管理端点、热力图/掌握度趋势/事件分布/周报/8 种成就。

但有三处断裂在抵消这些资产：

| # | 断裂 | 一句话 |
|---|---|---|
| 1 | **变现断层** | 支付关停导致 Pro 门控全仓零调用、四个付费页重定向、**从未设计过「Pro 该多给什么」**——收费一开闸没有东西可卖，且用户拿到兑换码无处可输 |
| 2 | **能力结构缺口** | 学习闭环是「看 → 查 → 练 → 复习」四环，缺**「说」**（跟读无评测）与**「精听」**（无 A-B 循环/听写）；真题只覆盖阅读，是四六级的 1/4 |
| 3 | **激励与回访空转** | 成就是**静默授予**的（用户根本不知道）、首页无目标进度、周报不触达、没有 Push/邮件——**用户不打开网站就永远收不到任何东西** |

一句话：**资产建得很足，但换留存与换钱的管道没接上。**

---

## 1. 已有资产盘点

先列已有的，避免后续建议里重复建设。

### 1.1 内容生产（真正的护城河）

- **三段式管线**：head `process_video`（yt-dlp 取元信息）→ GPU `transcribe_video_gpu`（WhisperX = VAD → 批量 ASR → wav2vec2 强制对齐，失败回退 faster-whisper）→ tail `finalize_video`（翻译 → 质量门 → ECDICT 注释 → 预热词注 → 分类 → 转码）。全在 `backend/app/tasks/video_processing.py`，中间一段跑在另一台 GPU 机器上。
- **字幕质量体系**：覆盖度门、幻觉检测、翻译质量评估、`VideoQualityReport` 每阶段留档、字幕编辑审计（`SubtitleRevision`）、重新断句可回滚。
- **词级元数据**：`Subtitle.word_levels`（逐词考级标注）+ `words`（逐词时间戳）；视频侧 `difficulty_level`（CEFR A1–C2）、`wpm`（语速）、`vocabulary_density`、`score`（0–100 学习价值分，7 因子加权）。
- **分类与难度**：8 个 topic（`video_classification.py:43-53`）+ 频道/作者页（ADR-0014）；难度由「超纲率」映射 CEFR（`difficulty_service.py:49-55`，在 49 视频语料上校准）。
- **候选池**：`CatalogItem` 带 `fit_score` 排序，管理员逐个 promote 入流水线。

### 1.2 观看与查询体验

- **点词即查**：ECDICT 静态释义 + 预生成 AI 词条笔记（`WordAINote`，按 word/level/context 缓存）+ 真题例句 + 「高频」徽标（`exam_word_freq`）+ 发音。出口 `GET /words/gloss`。
- **播放页**：双语/英文/中文/关闭四档字幕、字号、倍速、当前句卡、本句词条条、点词卡（移动 Sheet / 桌面 Tooltip）、进度续看、看完整屏 `EndScreen`（复习本视频生词 / 跟读重点句 / 再看一遍）。
- **移动端专门打磨过**：观看页换壳（`WatchTopBar` 44px + `WatchBottomBar` 含上一句/播放/下一句/跟读）、画面贴顶常驻、齐平字幕带。
- **搜索**：视频标题/标签 ILIKE + **字幕全文检索**（按视频分组返回片段）+ 联想 + 热门词（Redis ZSET）。

### 1.3 学习闭环（已建的四个环）

| 环 | 实现 |
|---|---|
| 看 | 视频 + 双语字幕 + 进度续看 |
| 查 | 点词即查 → 加入生词本（带 `context_sentence` + 出处视频/句子） |
| 练 | 词汇训练 `drill`（三题型按掌握度映射）+ 词汇本快速过筛 `sieve` + 真题卷/每日一练/错题重做 |
| 复习 | **自研间隔重复**（DEC-057，非 SM-2）：错误次数分档 3→7→16→35 / 2→5→12→25，`wrong_count>=3` 封顶 7 天；每日配额 5–100；`StudySession` 轮次持久化 + 加练 `extra` 轮 |

- **复习队列优先级合理**：昨天答错的排最前 → `wrong_count` 降序 → `next_review_at` 升序（`vocabulary_service.py:203-279`）。
- **硬规则**：答错的词不得毕业成 `mastered`（会被所有队列排除），强制压回 `reviewing`（`:125-129`）。
- **判分**：词汇训练在前端（`drillQuestions.ts`），真题在后端（`exam_service.submit_answers`）。

### 1.4 数据与洞察

- 学习热力图（90 天）、掌握度趋势（`MasterySnapshot`）、事件占比（近 30 天）、本周时长 + 环比、学习画像（CEFR 估算 + 各考级掌握度 + 强弱项）。
- **周报**：`study_days` / `total_minutes` / `new_words` / `reviewed_words` / `videos_completed` / `streak_at_week_end` / 环比 + 7 天曲线 + canvas 分享卡片。
- 结构化事件流 `LearningEvent`（7 种类型）是周报、画像、每日计数、成就的**共同数据源**。

### 1.5 激励

- **连续天数**：`current_streak` / `longest_streak`，21:00 断签警告。
- **8 种成就**：`vocab_50`、`vocab_200`、`mastered_100_words`、`streak_7_days`、`streak_30_days`、`completed_10_videos`、`first_shadowing`、`first_review`。
- 成就墙 `MilestoneGrid` + `Confetti` 庆祝组件已就位。

### 1.6 商业化（已建但休眠）

- 定价定义唯一处：`payment_provider.py:22-37`，`pro_monthly` ¥39/30 天、`pro_yearly` ¥299/365 天。
- 支付宝/微信支付 provider、订单对账、兑换码全链路（生成/导出/核销/作废/退还）、管理端赠送与撤销——**能力都在**，只是关停。

### 1.7 管理端

约 60 个端点：KPI 仪表盘（含转化漏斗）、用户管理（封禁/改角色/改套餐）、内容管理（候选池 promote、启动/恢复/重试/下架/重译、质量门报告、审核）、**字幕编辑全套**（增删改/重排/拆分/合并/重新断句 + 回滚 + revision 审计）、运营（站点设置、订单、兑换码、反馈回复、全站公告）。

---

## 2. 缺口清单

### 2.1 变现断层：一旦要收费，没有东西可卖

**Pro 门控当前是空的。**

- `require_pro_user` 定义在 `backend/app/api/dependencies.py:140-165`，**全仓零调用**（只有 `backend/app/tasks/redeem_tasks.py:4` 的注释提到它）。
- `/videos/{id}/unlock` 已退役（`backend/app/api/v1/videos.py:1194-1213`），`unlock_service.get_video_access_info` 恒返回已放行（`backend/app/services/unlock_service.py:82-94`）。`user_video_unlocks` 表与 `free_monthly_unlock_quota=3` 保留 dormant。
- `pricing` / `upgrade` / `checkout` / `redeem` 四页全部 `redirect("/")`。前端 `isProUser` helper（`frontend/src/lib/api.ts:107-113`）无消费者。
- 前端 `VideoAccessInfo.unlocked` 只在 `hooks/useVideoPlayer.ts:212,235` 被读，且未解锁时 `playbackMode` 停在 `"loading"`（`:211-216`），**没有任何解锁/升级 UI**。

**断链（此前未记录）**：`create-order` 抛 451 时文案为「请前往微信小商店购买后，**使用兑换码激活 Pro 会员**」（`backend/app/api/v1/payments.py:36-38`），但用户端兑换码入口已退役——前端只有管理端在调 `/redeem-codes/*`（`frontend/src/lib/adminData.ts:542-598`）。**收费一开闸，用户拿到码无处可输。**

**注册送 3 天 Pro**（`backend/app/core/config.py:147`，`plan_source="trial"`）——但全站免费所以无感，且没有任何 UI 告知用户「你有 3 天 Pro」，试用这个转化钩子等于不存在。

**含义**：ICP 合规关停支付是外部约束（真实且必须尊重），但**产品侧从未设计过「Pro 该多给什么」**。开闸那天需要现想。

> **不能提前开支付**——这里建议的是「把价值梯度设计出来并实现，挂在 `payments_enabled` 开关后面」，不是提前打开收款。

### 2.2 能力结构：缺「说」与「精听」，真题只覆盖 1/4

**（a）「说」这一环没有评测。**

- `ShadowingAttempt` 只存 `audio_url` / `duration_ms` / `is_satisfied`（`backend/app/models/shadowing.py`），「满意」是用户手点的开关（`shadowing_service.py:164-185`）。
- 前端 `components/speaking/WaveformCompare.tsx` 明写「波形仅供对比参考，不做评分」。
- 旧评分实现（ADR-0002 移除）的表与列（`accuracy` / `fluency` / `word_scores`）仍在 `models/learning.py:28-32` 冻结残留，无写入方。

产品名叫 Speaking，但用户练完跟读**不知道自己读得对不对**。这是最大的能力空洞。

**（b）没有任何精听工具。**

全仓无 A-B 循环、无单句循环 N 次、无听写（dictation）模式。对一个「看视频学英语」的产品，「反复听一句 + 写下来」是最高频的学习动作，现在只能靠手动拖进度条。

**（c）真题只覆盖阅读。**

`SECTION_ORDER` = `reading_A`（选词填空 10）/ `reading_B`（段落匹配 10）/ `reading_C`（仔细阅读 10），共 30 题（`backend/app/services/exam_service.py:44`）。数据来自 HelloCET（`backend/data/papers/`，cet4 40 套 / cet6 37 套）。

四六级是听+读+写+译四部分，**现覆盖约 1/4**。没有听力、没有写作、没有翻译。

**（d）复习系统的两端缺口。**

- **掌握即遗忘**：`mastered` 词被所有队列排除，无低频召回。毕业的词再也不会出现。
- **无「太简单/跳过」通道**：`sieve` 有「会」按钮，`drill` 没有，用户只能被迫作答已知词。

### 2.3 内容供给与结构

- **单点供给**：视频只能管理员入库（INV-003 有意为之，`backend/tests/test_architecture_invariants.py` 是活权威），无用户投稿。
- **池子小**：仓库内没有权威的生产视频总数。可参考的量级线索——`difficulty_service.py:46-48` 提到「49-video production corpus (2026-09-21)」，`recommendation_service.py:10` 提到「a hard filter would empty a **13-video** pool」，`scripts/seed_official_videos.py` 约 22 条。**生产实际数量需另行确认**。
- **无合集/系列/课程概念**：8 个 topic + 频道（作者页）是正交维度，但没有 playlist。用户拿不到「学完一个单元」的完成感，只有无限流。
- **运营位薄弱**：`featured` 仅 6 条，无每日/编辑精选位，无人工编排。
- **发现维度太少**：`browse` 只支持 `category` + `level` + `sort` 三个维度（`backend/app/api/v1/browse.py:129-133`）。**`wpm`（语速）已经算好却没做成筛选**——对听力练习，语速与口音是关键维度，现在筛不了。

### 2.4 激励与回访

- **成就静默授予**：`milestone_service.check_and_award` 直接落库，**从不创建 `achievement_unlocked` 通知**（该类型只存在于 `models/notification.py:18` 的枚举与前端筛选器）。首页只有一块「24h 内新成就」banner（`frontend/src/app/(main)/page.tsx:93-111`），关掉就再也看不到。**成就是留存的燃料，现在烧在了看不见的地方。**
- **首页无每日目标进度**：`components/home/CompactStatsBar.tsx` 顶部注释写明它刻意取代了「今日已完成 N/M」进度环（设计意图「不派任务、不施压」）。数据其实齐全（`UserLearningProfile.today_words_learned` / `today_goal_met`）。
- **周报不触达**：页面、数据、分享卡片都做好了，但**没有任何代码发 `weekly_report` 类型的通知**；入口藏在 profile 的「学习进度」Tab 第二张卡。
- **无回访通道**：`frontend/public/` 无 manifest、无 service worker（但有 `icon-192/512` 与 `og-image.png`），无邮件（产品无邮箱），短信通道只用于验证码。**唯一主动触达是站内通知 + WebSocket——用户不打开网站就永远收不到。**
- **streak 只降不保**：断签由小时任务直接清零（`backend/app/tasks/reminder_tasks.py:165-169`），21:00 有警告但**无补签/冻结**。这是最伤回流的设计之一。
- **无积分、无等级、无用户榜**：`rankings` 是**视频榜**（`ranking_service.py`，latest / weekly_views / weekly_favorites），用户之间没有可攀比的东西。
- 通知枚举 11 种，真正有生产者的只有 6 种（`vocabulary_reminder`、`streak_warning`、`pro_expiring`、`system`、`quality_alert`、`announcement`）。

### 2.5 首日体验与激活

- 注册 → 自动送 3 天 Pro（**无感**）→ `onboarding` 页（282 行）。
- 新用户无词时，首页 `DailyHero` 换成收词引导 + 「去频道看视频」。
- 无「7 日引导路径」。**成就系统本来最适合做激活钩子（第一个成就应该是注册后 10 分钟内就能拿到的）**，但它是静默的，且现在最靠前的两个成就是 `vocab_50` 与 `vocab_200`——门槛偏高，新用户体验不到被奖励。
- 无新手专属内容位（`/videos/demo` 匿名可看，存在但只是入口）。

### 2.6 消费体验的细节缺口

- **播放页两处隐患**：
  - `frontend/src/app/(main)/watch/[id]/page.tsx:928-935` 直接读 `currentSubtitle.text_en` 无空判（下方 L1215 渲染时反而有 `currentSubtitle &&` 守卫，说明是漏判）。无字幕视频会崩。
  - 未解锁时 `playbackMode` 停在 `"loading"`，落进「视频未就绪」死胡同。当前全量放行所以不触发，但代码路径是断的。
- **移动端字幕面板不能折叠**：折叠键 `hidden lg:flex`（`components/subtitle/SubtitleModeTabs.tsx`）。
- **数据锁死**：无生词本/字幕导出（Anki/CSV）。用户迁移成本为零，但留存手段也一并放弃了。
- **无分享入口**：`og-image.png` 与 `(main)/layout.tsx` 的 openGraph 已就位，但除周报 canvas 导出外，没有任何「分享成就/周报」的入口与回流落地页——**没有自然增长路径**。
- 搜索历史只在 localStorage，不跨设备。

### 2.7 信任、合规与数据可控

- **合规组件从未渲染**：`components/common/ComplianceInfo.tsx` 与 `siteConfig.hasComplianceInfo` 全仓零引用——ICP 备案号无处展示。这是**上线的硬阻塞**（与既有 memory 记录一致）。
- `siteConfig.miniStoreUrl` 与 admin settings 的「微信小商店 URL（Pro 会员购买入口）」均无人消费。
- 数据导出（异步任务 + 带 token 下载）与 30 天可撤回注销**已实现**——这一点比多数同类产品做得好。

### 2.8 工程侧「产品负债」

不影响当下体验，但影响数据可信度与后续演进：

- **词汇训练判分在客户端**：`POST /vocabulary/practice/submit` 收到的是 `{word, correct}` 布尔值，服务端直接当 `quality` 用（`backend/app/services/practice_service.py:525-556`），不校验。真题是服务端判分——**两套口径不一致，学习数据不能作为能力证据**。
- **两套复习算法并存**：DEC-057 错误次数分档（现役）与冻结的 SM-2（`sr_service.calculate_next_review`），后者只在遗留的 practice-submit 路径被调用，同一用户的复习数据可能来自两条口径。
- **410 遗留**：`LearningPlan` / `LearningPlanItem` 模型完整保留但端点全部 410。
- **孤儿残留**：`VideoComment` / `VideoCommentStats` 模型与 `Video.comment_count` 字段在源码已随 ADR-0012 删除后仍残留（`backend/app/api/v1/__pycache__/comments.cpython-312.pyc` 是孤儿产物）。

---

## 3. 优先级清单

排序依据：**ROI = 影响（留存/收入）÷ 成本**。P0 的共同特征是「资产已存在，只差接线」。

### P0 — 内测留存（每项 1–3 天级）

| # | 改动 | 改动点 | 验收口径 |
|---|---|---|---|
| 1 | **接上成就通知与庆祝** | `milestone_service.check_and_award` 在授予后发 `achievement_unlocked` 通知；前端复用已有的 `useMilestoneCelebration` + `Confetti`；通知偏好已有该类型，无需新建 | 达成里程碑后：收件箱有通知、当场有庆祝动画、偏好开关能关掉 |
| 2 | **周报触达** | 周报生成任务（`tasks/report_tasks.py`）完成后发一条通知，指向 `/weekly-report` | 周一生成后用户收到通知并能一跳进周报 |
| 3 | **首页补「今日目标」轻量进度** | 数据已在 `UserLearningProfile.today_words_learned` / `today_goal_met`；做成进度环 + 达标庆祝，**不做任务清单**（尊重 `CompactStatsBar` 原有的「不施压」设计意图） | 首页可见今日进度；达标有一次庆祝，无待办式压迫感 |
| 4 | **streak 补签 / 冻结** | 在 21:00 警告与清零之间插一层「补签卡」（门槛可用累计学习天数或已解锁成就数） | 断签用户可选择补签而非直接归零 |
| 5 | **修播放页两处隐患** | watch 页 `currentSubtitle` 加空判；未解锁的 `playbackMode` 落进明确的提示态而非死等 loading | 无字幕视频不崩；异常态有可见出口 |
| 6 | **移动端字幕面板可折叠** | 折叠键去掉 `hidden lg:flex` | 移动端可收起右侧字幕栏 |

### P1 — 应试能力覆盖 + 备考付费（2–6 周）

| # | 改动 | 改动点 | 理由 |
|---|---|---|---|
| 7 | **跟读轻评测（新方向）** | 用现成的 WhisperX 强制对齐 / ASR 回读对比，对用户录音算识别率与词级偏差——**纯本地、不走云端 LLM**。**不复用 ADR-0002 的旧实现** | 产品名叫 Speaking，这是最大的能力空洞；管线里 wav2vec2 对齐能力已具备 |
| 8 | **真题补听力 / 写作 / 翻译** | 听力用原视频音轨或 TTS 生成；写作与翻译批改走 `app.services.ai_service`（INV-005 强制走 service 层，不要新开 LLM 出口） | 四六级四部分现只覆盖 1/4 |
| 9 | **定义并落地 Pro 价值梯度 + 恢复用户端兑换码入口** | 把 `require_pro_user` 挂到具体端点（AI 词条无限、真题卷数、跟读评测次数、导出、无广告）；`redeem` 页恢复成真实核销页。**在 `payments_enabled` 开关之后生效，不提前打开支付** | 收费可开闸的前提；同时修掉 2.1 那条兑换码断链 |
| 10 | **精听工具：A-B 循环 / 单句循环 N 次 / 听写** | 在播放页落地。**播放页现有的试卷占位空间正好换给它们**（该占位卡按作者说明会换形式出，不删除） | 全仓缺失的最高频学习动作 |
| 11 | **drill 加「太简单 / 跳过」+ mastered 低频召回** | `drill` 补一条跳过通道（对齐 `sieve` 已有的「会」）；`mastered` 词每 60 天召回一次防遗忘 | 现在没有任何「我知道这个词，别问了」的出口 |

### P2 — 内容规模化与增长（1–2 个月）

| # | 改动 | 改动点 | 理由 |
|---|---|---|---|
| 12 | **合集 / 学习路径** | 新增 playlist 概念，把视频组织成可完成的单元（A1→B2），接完课率 | 现在只有无限流，用户拿不到「学完一个单元」的完成感 |
| 13 | **补内容发现维度** | `browse` 增加时长、语速（`wpm` 字段已算好）、口音筛选；支持多标签 | 听力练习的关键维度现在筛不了 |
| 14 | **回访触达** | Web Push（需补 manifest + service worker，图标与 og-image 已有）或先用短信做周报触达 | 现在用户不打开网站就永远收不到任何东西 |
| 15 | **分享回流** | og-image 已就位，补分享入口与分享落地页；生词本/字幕导出（Anki/CSV） | 目前没有任何自然增长路径 |
| 16 | **判分收口到服务端** | 词汇训练的判分从前端移到服务端（对齐真题的做法） | 学习数据要能当能力证据 |

---

## 4. 明确不建议做的

- **社区 UGC**（评论 / 关注 / 动态）—— 维持 ADR-0012。`VideoComment` 等残留模型建议**清掉**，不要顺手复活。
- **复活 ADR-0002 的旧口语评分实现** —— 作者已明确不碰；口语评测走 P1-#7 的新路径。
- **重建每日任务式 AI 学习计划** —— 端点已 410，且首页刻意「不派任务、不施压」，方向相悖。周报/进度环这类「回顾式」激励才是合乎现有设计语言的方向。
- **删除播放页「本视频暂不出试卷」占位卡** —— 作者说明后续会换形式出；建议是「换成 P1-#10 的精听工具」，而不是删。

---

## 5. 本次评审的局限

- **生产视频总数未核实**：仓库内没有权威数字，只有 2.3 节列出的三条量级线索。若这个数字与实际偏差很大，「内容规模化」的优先级判断需要重估。
- **未做真实用户行为分析**：所有结论基于代码与界面，没有埋点数据（`BehaviorEvent` 已在采集，但未做分析）。「留存差」是推断，不是实测。
- **未评估竞品与市场**：本文只做产品内部一致性评审，没有横向对比（英语流利说 / 每日英语听力 / LingQ / Language Reactor 等）。
- **未评估成本**：P1-#7、#8、#14 的实际工程量（尤其音频处理与推送基建）需要另行估算。
