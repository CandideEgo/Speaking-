# Speaking 完整管线流程

## 入口 → Celery 管线 → 前端播放

### 1. 入口（3条路径）
- **URL 提交** `POST /api/v1/videos` → `VideoService.submit_video()`
- **文件上传** `POST /api/v1/videos/upload` → `UploadService.handle_video_upload()`
- **官方种子** `POST /api/v1/videos/seed` 或 CLI `seed_official_videos.py`

入口操作：平台检测(detect_platform) → 查重 → 创建 Video(status=processing) → `process_video.delay(video_id)`

### 2. Celery 管线 `process_video`（video_processing.py，7步顺序执行）

| 步骤 | step | 操作 | 关键工具 |
|------|------|------|----------|
| ① | extracting | 提取元数据 | yt-dlp / Playwright(Douyin) |
| ② | transcribing | 转录音频→字幕 | WhisperX + 标点恢复 + 强制对齐 |
| ③ | splitting | 说话人重分割 | LLM |
| ④ | translating | EN→ZH 翻译 | TranslationService(可插拔引擎) |
| ⑤ | downloading | 下载视频文件 | yt-dlp (≤1080p MP4) |
| ⑥ | transcoding | 多码率转码 | FFmpeg (480p/720p/1080p) |
| ⑦ | uploading | 可选 OSS 上传 | 阿里云 OSS |

**状态流转**: `processing → ready_subtitles → ready`（或 `error`）

**关键设计**: 转录在下载之前！ready_subtitles 状态下用户可通过 YouTube 嵌入 + 字幕学习。

#### 错误处理与重试

Celery 任务配置：`autoretry_for=(Exception,)`, `retry_backoff=True`, `retry_backoff_max=120`, `max_retries=3`, `time_limit=3600`, `soft_time_limit=3300`

| 步骤 | 失败行为 |
|------|----------|
| extracting | 非致命 — info 为 None 时保留原始 title/thumbnail |
| transcribing | **唯一显式失败处理** — subs 为空则设 status=error 并 return（不触发重试） |
| splitting | 失败走外层 except → 触发重试 |
| translating | 部分失败可接受 — 单条翻译返回 None 则跳过 |
| downloading | 返回 None → 跳过转码，但**仍设 status=ready**（潜在问题：无视频 URL 的 ready 视频） |
| transcoding | 单分辨率失败只 log，720p 有 fallback 路径 |
| uploading | 失败静默跳过，回退到本地路径 |

外层 except：设 `status=error` + `error_message` → `raise self.retry(exc=e)` 触发重试

**已知缺陷**：
- 无断点续传 — 重试时整个管线从头跑（包括已完成的转录）
- 转录失败不触发重试 — 视频永久停留在 error
- 下载失败仍标记 ready — 可能出现无视频文件的 ready 视频

### 3. WhisperX 转录管线（步骤②内部）

```
音频提取(16kHz mono WAV)
  ├─ Douyin:    Playwright获取直链 → ffmpeg下载
  ├─ Local:     ffmpeg直接转码
  └─ YouTube等: yt-dlp管道 → ffmpeg流式提取

→ ASR (faster-whisper + VAD + batch推理)
→ 标点恢复 (deepmultilingualpunctuation) ← 必须在对齐前
→ 强制对齐 (wav2vec2 + NLTK Punkt句子分割)
→ 格式化 → [{start, end, text}, ...]

长视频(>10min=600s) → 分块转录 (chunked_transcription.py, 并发度=2)
```

### 4. 翻译引擎（可插拔）
- 引擎: agnes(默认, 兼容OPENAI_*配置) / qwen / hy_mt2 / custom
- 批量: 每批20条 → chat/completions API → sanitize_json解析
- 支持回退引擎(TRANSLATION_FALLBACK_ENGINE)

### 5. 前端播放

```
GET /api/v1/videos/{id} → VideoDetailResponse (含全部subtitles)

播放策略:
  status=ready       → HTML5 <video> 本地/CDN
  status=processing  → YouTube IFrame嵌入 + 3s轮询

字幕同步: <video onTimeUpdate> → findSubtitleIndex() (二分查找)

组件:
  SubtitleOverlay    → 视频叠加字幕 (text_en可点击查词 + text_zh)
  SubtitleList       → 侧边栏字幕列表 (按说话人分组, 难度词高亮)
  SubtitleModeTabs   → 7种模式: bilingual|english|reading|dictation|translate|fillblank|flashcard
  PlayerControlBar   → 播放控制: 变速/上下句/AB循环/全屏/静音

状态: watchStore.ts (Zustand) → subtitleMode, leftPanelWidth, videoAspectRatio
```

---

## 交互功能流程

### 6. 跟读练习 (Speaking Practice)

```
用户点击"录音" → MediaRecorder 录制 WebM 音频
  → 停止 → 预览 → 提交
  → POST /api/v1/speaking/practice (FormData: audio + subtitle_id)
  → 后端验证 (格式/大小≤5MB/字幕存在)
  → 每日限额检查 (免费用户3次/天, Pro无限)
  → Whisper 转录用户音频 (get_whisper_model, 无VAD/对齐)
  → AI 评估发音 → {accuracy, fluency, completeness, feedback}
  → 保存 SpeakingAttempt + 更新 LearningRecord.speaking_attempts
  → 前端显示 ScoreRing (三环) + 文字反馈
```

**关键文件**: `speaking.py`, `speaking_service.py`, `SpeakingPanel.tsx`

**已知缺陷**：
- 音频不持久化 — `audio_url` 字段存在但从未填充，录音用完即删
- Whisper 失败返回空字符串 → AI 仍评估，产生无意义分数

### 7. 单词查询与词汇本

```
用户点击字幕中的词 → handleWordClick (useWordLookup.ts)
  → TTS 朗读该词 (免费用户也可用)
  → GET /api/v1/ai/word-lookup?word=...&sentence=... (Pro 专属)
  → LLM 返回: 音标 + 语境中文释义 + 例句
  → 前端 WordTooltip 显示
  → 可选: POST /api/v1/vocabulary 保存到词汇本
```

**词汇复习 (SM-2 间隔重复)**:
- `POST /vocabulary/{word_id}/review?quality=0-5`
- quality≥3: 间隔递增 (1天→6天→interval×ease_factor)
- quality<3: 重置 interval=1, review_count=0
- ease_factor 固定 2.5（未持久化，SM-2 自适应性受限）

**关键文件**: `ai.py`, `ai_service.py`, `vocabulary.py`, `vocabulary_service.py`, `sr_service.py`, `useWordLookup.ts`

**已知缺陷**：
- 查词 Pro 专属 — 免费用户只能听发音，看不到释义
- ease_factor 未持久化 — SM-2 退化为固定间隔
- 上下文句子匹配粗糙 — `subtitles?.find(s => s.text_en.includes(word))` 可能匹配错误字幕行

### 8. 评论系统

```
管理员触发 POST /comments/analyze?video_id=... (仅管理员)
  → Celery 任务 analyze_video_comments
  → YouTube Data API v3 拉取评论 (分页, 403配额耗尽时优雅降级)
  → 存入 video_comments 表 (全量刷新，先删旧评论)
  → 质量评分 (0-100):
     学习相关性 (40%权重): 关键词分层 (高/中/低, 3/+1/-2分)
     深度 (30%权重): 平均长度 + 问题比例 + 句子比例 + URL比例
     参与度 (30%权重): 平均点赞 + 回复比例 + 高赞比例 + 多样性
  → 结果存入 video_comment_stats + 反规范化到 Video.comment_quality_score/comment_count
```

**API**: `GET /comments/{video_id}`, `GET /comments/{video_id}/stats`, `GET /comments/top-videos`

**关键文件**: `comment_service.py`, `youtube_comment_service.py`, `comment_analysis.py`, `comments.py`

**已知缺陷**：
- 无用户自写评论 — CommentCreate/CommentUpdate schema 存在但未使用
- 分析仅管理员手动触发 — 视频处理完成后不自动触发
- 关键词评分过于简单 — 固定词表，可能遗漏或误判

---

## 用户体系流程

### 9. 邀请码

```
管理员生成: POST /invite-codes/generate {count, plan, duration_days, batch_label}
  → 生成 10 位人类友好格式 XXXX-XXXX-XX (排除 0/O/1/I)
  → while 循环确保唯一

用户兑换: POST /invite-codes/redeem {code}
  → with_for_update() 行锁防竞态
  → 设 user.plan = pro, plan_expires_at = now + duration_days

管理员导出: GET /invite-codes/export → CSV (未使用的码)
```

**关键文件**: `invite.py`, `models/invite.py`

### 10. 支付

```
用户下单: POST /payments/create-order?plan=pro_monthly|pro_yearly
  → 验证非 Pro、验证套餐 (月付39元/年付299元)
  → 创建 Order(status=pending)
  → 返回支付 URL (当前始终为 mock URL)

支付宝回调: POST /payments/callback/alipay
  → RSA2 签名验证 (SHA256withRSA)
  → trade_status=="TRADE_SUCCESS" → 升级 Pro

微信回调: POST /payments/callback/wechat
  → HMAC-SHA256 签名验证
  → trade_state=="SUCCESS" → 升级 Pro

Mock 支付 (仅开发环境): GET /payments/mock-pay?order_id=...
  → 直接升级 Pro + 标记 Order 已付

支付状态: GET /payments/status → 当前套餐 + is_pro
```

**关键文件**: `payments.py`, `mock_payments.py`, `models/order.py`

**已知缺陷**：
- 无到期降级 — `plan_expires_at` 存在但无定时任务检查/降级
- 支付回调不设过期时间 — 仅邀请码设，支付升级后永不过期
- 支付 URL 始终为 mock — 真实支付宝/微信 API 未集成
- 无订单过期清理 — `OrderStatus.expired`/`cancelled` 枚举存在但未使用
- Pro 用户可重复兑换邀请码 — 会覆盖 plan_expires_at

---

## 发现与首页

### 11. 首页与浏览

**首页** (`useHomeFeed.ts` + `page.tsx`):
```
GET /api/v1/videos/public → 全部官方视频
  → 客户端按 difficulty_level (A1-C2) 过滤
  → 按 topic_tags 分组展示 (缩略图+标题+难度标签)
  → 点击 → /watch/{id}
```

**浏览页** (`browse.py`):
```
GET /browse/categories → 预定义分类 (All/TED/Interviews/News/Vlogs/Educational/Movie/Tech)
GET /browse/feed?category=...&level=... → YouTube 搜索
  → level 修饰词追加到查询 (如 A1 追加 "beginner slow simple")
  → 进程内缓存 (600s TTL, 最多100条)
  → 搜索失败 → _fallback_official_videos() 回退到 DB
```

**Feed 工厂** (`feed_base.py`):
- `create_feed_router(FeedConfig)` → 生成标准 feed 路由
- Redis 缓存 + 进程内 dict 回退
- 统一响应: `{items, page, page_size, has_more, total}`
- 被 community/bilibili/douyin feed 复用

**已知缺陷**：
- 首页与浏览页数据源不同 — 首页用 DB，浏览页用 YouTube 搜索
- 无个性化推荐 — 首页展示所有公开视频，不考虑用户水平/历史
- 首页无分页 — 一次拉取全部公开视频
- 首页难度过滤纯客户端 — 视频多时性能差
- 浏览缓存仅进程内 — 重启丢失，多 worker 不共享

---

## 通知系统

### 12. 通知

```
视频处理完成 → create_notification(user_id, "video_ready", title, message, related_url)
  → Notification 行 (is_read=False)

前端 NotificationDropdown:
  → 打开时拉取 GET /notifications
  → 未读数 GET /notifications/unread-count
  → 点击标记已读 PATCH /notifications/{id}/read
  → 全部已读 PATCH /notifications/read-all
  → 点击通知 → 跳转 related_url
```

**关键文件**: `notification.py`, `notification_service.py`, `notifications.py`, `NotificationDropdown.tsx`

**已知缺陷**：
- 无实时推送 — 无 WebSocket/SSE/轮询，用户需手动打开下拉框才能看到
- `pro_expiring`/`vocabulary_reminder` 类型已定义但从未生成
- 无删除接口 — 通知只能标记已读，不能删除
- type 列无枚举约束 — 任意字符串可存入

---

## 学习记录

### 13. 学习记录追踪

**模型** (`learning.py`):
- **LearningRecord**: user_id + video_id (唯一约束), words_learned, speaking_attempts, quiz_score, completed
- **SpeakingAttempt**: user_id + subtitle_id, audio_url, transcript, accuracy, fluency, completeness, feedback
- **Vocabulary**: user_id + word, context_sentence, video_id, review_count, last_reviewed_at, next_review_at

**创建/更新时机**:
- SpeakingAttempt → speaking_service.evaluate_speaking() 创建
- LearningRecord → speaking_service.update_learning_record() 更新 speaking_attempts 计数
- Vocabulary → vocabulary_service.add_word() 创建

**分析端点**:
- `GET /speaking/stats` → 总尝试次数 + 平均准确率
- `GET /ai/assistant/summary` (Pro) → 聚合口语/词汇/观看数据 → AI 生成每日总结
- `GET /ai/assistant/recommend` (Pro) → 基于用户水平 + 最近学习记录 → AI 推荐

**已知缺陷**：
- `words_learned` 从未递增 — 保存词汇时不更新对应 LearningRecord
- `quiz_score` 从未写入 — quiz 系统未回写 LearningRecord
- `completed` 从未设为 True — 无代码标记学习完成
- LearningRecord 仅由跟读练习创建/更新 — 仅观看视频不产生记录
- 无独立分析仪表盘 — 仅通过 AI 助手端点 (Pro 专属)

---

## 废弃代码
- `video_processing.py` 中的 `_parse_json3`/`_parse_webvtt`/`_parse_srt` 是死代码，当前统一走 WhisperX
- `processing_mode` 字段已废弃
- `CommentCreate`/`CommentUpdate` schema 存在但未使用
- `OrderStatus.expired`/`cancelled` 枚举存在但未使用

---

## 关键文件索引

| 阶段 | 文件 | 职责 |
|------|------|------|
| **入口** | `backend/app/api/v1/videos.py` | POST 提交/上传/种子 |
| **入口** | `backend/app/services/video_service.py` | submit_video(), seed_video() |
| **入口** | `backend/app/services/upload_service.py` | handle_video_upload() |
| **Celery** | `backend/app/tasks/video_processing.py` | process_video 任务主流程 |
| **Celery** | `backend/app/tasks/comment_analysis.py` | 评论分析任务 |
| **转录** | `backend/app/services/transcription/__init__.py` | TranscriptionService 编排 |
| **转录** | `backend/app/services/transcription/audio_extractor.py` | 音频提取 (yt-dlp管道/本地/Douyin) |
| **转录** | `backend/app/services/transcription/chunked_transcription.py` | 长视频分块转录 |
| **转录** | `backend/app/services/transcription/punctuation.py` | 标点恢复 |
| **转录** | `backend/app/services/transcription/formatters.py` | WhisperX → 字幕格式转换 |
| **转录** | `backend/app/services/transcription/whisper_model.py` | 模型单例管理 |
| **转录** | `backend/app/services/transcription/douyin_extractor.py` | Douyin Playwright 提取 |
| **翻译** | `backend/app/services/translation/__init__.py` | TranslationService |
| **翻译** | `backend/app/services/translation/engines.py` | 引擎注册表 |
| **翻译** | `backend/app/services/ai_service.py` | AIService 翻译/查词/评估代理 |
| **跟读** | `backend/app/api/v1/speaking.py` | 跟读 API |
| **跟读** | `backend/app/services/speaking_service.py` | 跟读业务逻辑 |
| **跟读** | `frontend/src/components/speaking/SpeakingPanel.tsx` | 跟读 UI |
| **词汇** | `backend/app/api/v1/vocabulary.py` | 词汇 CRUD |
| **词汇** | `backend/app/services/vocabulary_service.py` | 词汇业务逻辑 |
| **词汇** | `backend/app/services/sr_service.py` | SM-2 间隔重复 |
| **词汇** | `frontend/src/hooks/useWordLookup.ts` | 查词 Hook |
| **评论** | `backend/app/services/comment_service.py` | 评论拉取+评分 |
| **评论** | `backend/app/services/youtube_comment_service.py` | YouTube API 客户端 |
| **邀请码** | `backend/app/api/v1/invite.py` | 邀请码 API |
| **支付** | `backend/app/api/v1/payments.py` | 支付 API |
| **支付** | `backend/app/api/v1/mock_payments.py` | Mock 支付 (开发) |
| **通知** | `backend/app/models/notification.py` | 通知模型 |
| **通知** | `backend/app/services/notification_service.py` | 通知服务 |
| **通知** | `frontend/src/components/NotificationDropdown.tsx` | 通知下拉框 |
| **发现** | `backend/app/api/v1/browse.py` | 浏览/搜索 |
| **发现** | `backend/app/api/v1/feed_base.py` | Feed 工厂 |
| **发现** | `frontend/src/hooks/useHomeFeed.ts` | 首页数据 Hook |
| **数据** | `backend/app/models/video.py` | Video 模型 + VideoStatus 枚举 |
| **数据** | `backend/app/models/subtitle.py` | Subtitle 模型 (text_en, text_zh) |
| **数据** | `backend/app/models/learning.py` | LearningRecord + SpeakingAttempt + Vocabulary |
| **数据** | `backend/app/models/user.py` | User 模型 (PlanType, plan_expires_at) |
| **数据** | `backend/app/models/order.py` | Order 模型 |
| **数据** | `backend/app/models/comment.py` | VideoComment + VideoCommentStats |
| **前端** | `frontend/src/app/(main)/watch/[id]/page.tsx` | Watch 页面主组件 |
| **前端** | `frontend/src/components/SubtitleOverlay.tsx` | 视频叠加字幕 |
| **前端** | `frontend/src/components/subtitle/SubtitleList.tsx` | 侧边栏字幕列表 |
| **前端** | `frontend/src/components/player/PlayerControlBar.tsx` | 播放控制栏 |
| **前端** | `frontend/src/stores/watchStore.ts` | Zustand 状态 (subtitleMode 等) |
