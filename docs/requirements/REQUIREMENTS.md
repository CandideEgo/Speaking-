# SeeWord 需求文档（PRD）

> **本文档完全基于代码事实编写**，不引用 `.agent/`、`wiki/` 等任何二手文档。
> 事实来源：`backend/app/models/`（数据模型）、`backend/app/api/v1/`（接口行为）、`backend/app/tasks/`（后台任务）、`frontend/src/app/`（页面）。
> 若本文档与代码冲突，以代码为准。

| 项目 | 内容 |
|---|---|
| 产品名 | SeeWord |
| 文档版本 | 2.0（2026-08-06，代码事实版） |
| 后端 | FastAPI + SQLAlchemy async + Celery + PostgreSQL + Redis |
| 前端 | Next.js（App Router）+ Tailwind + Zustand |

---

## 1. 产品概述

### 1.1 定位

AI 英语词汇学习应用：用户提交视频 URL（YouTube/Bilibili），系统自动生成双语字幕并标注考试词汇（中考/高考/四级/六级/考研/雅思/托福/GRE 八级体系），用户观看时点击生词查看释义与 AI 注释、收藏进词汇本、按 SM-2 间隔重复复习，配合每日学习计划与推荐流形成学习闭环。

### 1.2 核心学习闭环（代码可验证路径）

```
提交/浏览视频 → 观看（双语字幕 + 词级高亮 + 点击查词）→ 加入词汇本
→ SM-2 复习 / 词汇练习(drill) / 句子跟读(shadowing) → LearningEvent 回传
→ 学习档案（streak/掌握度/里程碑）+ 每日计划（规则引擎/AI）+ 推荐 feed 自适应
```

### 1.3 考试词汇体系（`backend/app/core/exam_levels.py` + `frontend/src/lib/examLevels.ts`）

| 级别 key | 标签 | 高亮规则 |
|---|---|---|
| zhongkao | 中考 | 词的最高级别 order ≥ 用户目标级别 order 时高亮 |
| gaoKao | 高考 | 同上 |
| cet4 | 四级 | 同上 |
| cet6 | 六级 | 同上 |
| ky | 考研 | 同上 |
| ielts | 雅思 | 同上 |
| toefl | 托福 | 同上（不可选为目标） |
| gre | GRE | 同上 |

用户通过 `UserPreferences.target_exam` 设置目标级别（可选：除 zhongkao/toefl 外的级别）；观看页按此过滤高亮词。

---

## 2. 用户角色与权限（`backend/app/api/dependencies.py`）

| 角色 | 判定 | 代码事实 |
|---|---|---|
| 游客 | 无 token | `get_optional_user` → None；可访问：视频详情/状态、公开列表、搜索、推荐、浏览、评论查看、行为上报 |
| 登录用户 | JWT（Bearer，含 type=access/refresh） | `get_current_user`；封禁用户 403；`password_changed_at` 之后签发的 token 失效 |
| Pro 用户 | `users.plan=pro` 且 `plan_expires_at > now`（`require_pro_user` 实时查库） | 仅以下端点使用：`POST /ai/word-lookup`、`GET /ai/assistant/summary`、`GET /ai/assistant/recommend`；`POST /plan/generate/ai`（服务层注释声明 Pro-only，但路由层无硬校验） |
| 管理员 | `users.role=admin` | `get_admin_user`；所有 `/admin/*` 路由 + 审核/种子/评论分析 |

---

## 3. 功能需求

### 3.1 认证（`api/v1/auth.py`，prefix `/auth`）

| 端点 | 说明 | 限流 |
|---|---|---|
| `POST /auth/sms/send-code` | 发送短信验证码；60s/号/用途 Redis 冷却（Redis 故障 fail-open）；无阿里云凭据时 dev-fake 模式打印验证码 | 5/min |
| `POST /auth/sms/register` | 手机号+验证码+密码注册（注册即登录）；受 `AdminSetting.registration_enabled` 开关控制（默认开）；手机号唯一（部分唯一索引） | 3/min |
| `POST /auth/sms/login` | 验证码登录（不自动建号，未注册 404） | 10/min |
| `POST /auth/phone-login` | 手机号+密码登录 | 5/min |
| `POST /auth/refresh` | refresh token 换新 access+refresh；旧 refresh 拉黑（jti 黑名单，受 `jwt_blacklist_enabled` 控制）；密码变更后旧 refresh 拒绝 | 20/min |
| `POST /auth/sms/reset-password` | 验证码重置密码；无论手机号是否存在返回同一文案（防枚举）；重置后所有旧会话失效 | 5/min |
| `POST /auth/change-password` | 登录态改密；旧会话全部失效 | 5/min |
| `POST /auth/sms/change-phone` | 换绑手机：当前密码 + 新号验证码双重校验 | 5/min |
| `POST /auth/logout` | 当前 access token（及可选 refresh token）jti 拉黑 | 10/min |

### 3.2 用户（`api/v1/users.py`，prefix `/users`）

| 端点 | 说明 |
|---|---|
| `GET /users/me` / `PATCH /users/me` | 昵称、等级（A1-C2）、头像 URL、bio、时区 |
| `POST /users/me/avatar` | 上传头像：JPG/PNG/WebP/GIF ≤5MB，存 `/media/avatars/` |
| `POST /users/me/onboarding` | 设置 onboarding 完成标记 |
| `GET|PUT /users/me/preferences` | 学习偏好（upsert）：`daily_goal_type`(默认 words)/`daily_goal_value`(默认 5)/`reminder_enabled`/`reminder_time`/`reminder_timezone`/`auto_play_next_subtitle`(默认 true)/`subtitle_mode_default`(默认 bilingual)/`preferred_difficulty`/`target_exam`；默认值：无行时返回缺省 |

### 3.3 视频（`api/v1/videos.py`，prefix `/videos`）

**用户侧：**

| 端点 | 说明 |
|---|---|
| `POST /videos` | 提交视频 URL（`submit_video` 服务：去重 → 标准版/fork 判定 → 入管线） |
| `GET /videos` | 当前用户自己的视频（分页） |
| `GET /videos/{id}` | 视频详情（游客可访问；非官方视频须 owner/管理员） |
| `GET /videos/{id}/status` | 处理状态轮询 |
| `GET /videos/public` | 公开视频分页（published + official + ready） |
| `GET /videos/search?q=` | 标题+topic_tags 关键词搜索（非分页，top-N） |
| `GET /videos/search/subtitles?q=` | 字幕内容搜索，返回视频+匹配字幕片段 |
| `POST /videos/upload` | 上传本地视频文件 |
| `POST /videos/{id}/like` / `GET /videos/{id}/like-status` | 点赞切换/查询（`video_likes` 表；点赞数达 `FEATURE_THRESHOLD` 自动置 `is_featured`） |

**UGC 创作者侧（owner 作用域，`_require_editable_own_video`：已发布须先 begin-edit；标准版本体禁止直改（须 PR））：**

| 端点 | 说明 |
|---|---|
| `POST /videos/user-seed` | 用户从 URL 建 UGC 视频（`is_official=False`，review_status=draft，不进公共 feed） |
| `POST /videos/user-seed-full` | 同上，先校验 YouTube cookies 有效 |
| `PATCH /videos/{id}/subtitles/{sid}` / `PATCH .../subtitles`（批量） | 编辑自己的字幕（发布中 409；写 SubtitleRevision 审计） |
| `POST .../subtitles/{sid}/split` / `merge` / `rollback/{rev}` | 拆分/合并/回滚 |
| `GET .../subtitles/{sid}/revisions` | 修订历史（只读，发布中也可看） |
| `POST /videos/{id}/fork` | fork 一个 ready 视频到自己的库：复制字幕+练习题+元数据，直接 ready，不跑 GPU，`forked_from` 溯源 |
| `POST /videos/{id}/begin-edit` | 冻结已发布版本（published_snapshot），转 pending_review |
| `POST /videos/{id}/submit-review` / `withdraw` | 提交审核/撤回 |
| `POST /videos/{id}/propose` | 向标准版提字幕修改 PR（按批 subtitle_ids） |
| `GET /videos/proposals/mine` / `POST /videos/proposals/{id}/withdraw` | 我的 PR 列表/撤回 |
| `GET /videos/{id}/mergeable-updates` / `POST .../{uid}/apply` | 标准版合并传播到本 fork 的可合并更新（fork 改过的行）列表/应用 |

**管理员侧（`get_admin_user`）：**

| 端点 | 说明 |
|---|---|
| `GET /videos/admin` | 全量视频列表（status/is_official/is_featured/review_status/keyword/quality 过滤） |
| `GET /videos/admin/pending-count` | UGC 待处理计数（pending_processing/pending_review，admin 顶栏角标） |
| `PATCH|DELETE /videos/admin/{id}` | 更新元数据（标题/难度/tags/official/featured/published/notes）/删除（级联+媒体文件） |
| `POST /videos/admin/{id}/start-processing` | 触发 GPU 处理（worker 离线 503） |
| `POST /videos/admin/{id}/recover` | 卡住视频（processing/ready_subtitles）清锁重派 finalize |
| `POST /videos/admin/{id}/retry` | error 视频从最后完成步骤续跑（有字幕则跳转录） |
| `POST /videos/admin/{id}/localize` | 下载+转码到本地（失败重试计数 `download_fail_count`，3 次后停） |
| `POST /videos/admin/{id}/retranslate?engine=` | 清 text_zh+quality_flag 重跑翻译（可指定引擎 glm/qwen/hy_mt2/agnes/custom） |
| `GET /videos/admin/{id}/quality-reports` | 转录/翻译质量报告历史 |
| `POST /videos/admin/{id}/review/approve` / `reject` | UGC 审核通过（冻结为公开版）/驳回（留原因，公开版保持快照） |
| `GET /videos/admin/{id}/detail` / `status` / `score` | 详情（跳过访问门）/状态/评分分解（7 因子+bonus） |
| 字幕编辑器全套 | `PATCH` 单条/批量、`POST` 新建、`reorder` 重排、`DELETE` 删除、`split`/`merge`、`resegment`(+rollback 快照回滚)、`word-levels` 手动覆盖、`word-levels/recompute` 重算、`rollback/{rev}` 回滚、`GET revisions` 修订历史（全部写 SubtitleRevision 审计） |
| `POST /videos/seed` / `seed-full` | 种子官方视频（seed-full 校验 cookies、auto_publish=True，finalize 完成后自动发布） |

### 3.4 观看与字幕（`api/v1/videos.py` + `favorites.py` + `learning.py`）

| 端点 | 说明 |
|---|---|
| `GET /videos/{id}/watch-meta` | 收藏状态+笔记合并返回 |
| `POST|DELETE /videos/{id}/favorite` | 收藏/取消（行锁防并发计数，幂等） |
| `GET|PUT|DELETE /videos/{id}/note` | 笔记 CRUD（upsert，≤10000 字符） |
| `PATCH /learning/progress` | 防抖保存观看进度：position_seconds → progress_percentage（position/duration），LearningRecord 行锁防重复创建 |
| `GET /learning/progress/{video_id}` | 读取续播位置 |
| `GET /learning/records` / `records/{id}` | 学习记录列表（completed 过滤、按 last_accessed_at 排序）/详情 |

字幕数据结构（`models/subtitle.py`）：`text_en`/`text_zh`/`start_time`/`end_time`/`sentence_index`/`speaker`/`grammar_note`/`difficulty_words`/`word_levels`（词→考试级别映射，ECDICT 一次性标注）/`words`（WhisperX 词级时间戳，支撑精确分合与重切）。

### 3.5 单词查询（`api/v1/words.py`）

| 端点 | 说明 |
|---|---|
| `GET /words/gloss?word=&context_sentence=&video_id=` | 词卡合并返回：ECDICT 静态数据（音标/词性/英义/中译/级别/词形变化标签 inflection）、真题例句+来源+高频徽标（exam_corpus）、AI 注释（video 级 → global 级 → 实时 AI 兜底并写 global 行缓存） |

### 3.6 词汇（`api/v1/vocabulary.py`，prefix `/vocabulary`）

| 端点 | 说明 |
|---|---|
| `GET /vocabulary/stats` | 词汇统计 |
| `POST /vocabulary?word=&context_sentence=` | 加词（大小写归一、去重 400） |
| `GET /vocabulary` | 词汇本分页（`due_only` 过滤到期词） |
| `GET /vocabulary/words` | 按 mastery/级别过滤查询（drill 与统计用） |
| `GET /vocabulary/{id}/enrich` | AI 完整释义生成（全部用户可用） |
| `POST /vocabulary/{id}/review?quality=0-5` | SM-2 复习：quality 自评 → ease_factor/interval_days/review_count/next_review_at 更新 + 发 LearningEvent |
| `DELETE /vocabulary/{id}` | 删词 |
| `GET /vocabulary/practice?level=&count=&due_only=` | 生成词汇练习（drill）：按 mastery 自适应题型（new/unknown→听义选词、看词选义；learning→看义拼写、听写；reviewing/mastered→句子重复） |
| `POST /vocabulary/practice/submit` | 批量提交练习结果 → SM-2 更新 + LearningEvent（practiced_items + learned_words） |

词汇模型字段（`models/learning.py`）：word/definition/translation/part_of_speech/ipa/example_sentences/collocations/difficulty_level/mastery_level(new/learning/reviewing/mastered)/context_sentence/video_id/review_count/last_reviewed_at/next_review_at/ease_factor(2.5)/interval_days/exam_level/first_seen_at/correct_count。

### 3.7 影子跟读 Shadowing（`api/v1/shadowing.py` + `media.py`）

| 端点 | 说明 |
|---|---|
| `POST /media/shadowing-audio` | 上传跟读录音 blob（webm/ogg/mp4/mpeg/wav ≤5MB）→ `/media/shadowing/{userId}/{uuid}.{ext}` |
| `POST /shadowing/attempts` | 记录一次跟读（video_id/subtitle_id/audio_url/duration_ms/is_satisfied 自评） |
| `GET /shadowing/attempts?video_id=` | 按视频分页列跟读记录 |
| `GET /shadowing/stats` | 统计：总次数/满意数/跟读视频数/今日次数 |

前端：watch 页 `useShadowing` hook 录音 → 上传 → 自评满意 → `ShadowingHistory` 展示；学习计划含 shadowing 类型计划项；里程碑含 `first_shadowing`；学习档案含 `total_shadowing_count`。

### 3.8 学习计划与档案（`api/v1/learning_plan.py`，prefix `/plan`）

| 端点 | 说明 |
|---|---|
| `GET /plan/today` | 今日计划（无则生成）+ 日进度 + 学习档案合并返回 |
| `POST /plan/items/{id}/complete` | 完成计划项（校验 owner）→ 发 LearningEvent；返回 completed/plan_completed/goal_met |
| `GET /plan/progress` | 今日进度（watch/vocab/practice/review 计数 + 目标 + 周循环） |
| `GET /plan/profile` | 学习档案 + 里程碑：estimated_level/current_streak/longest_streak/weekly_cycles_completed/mastery_by_level/strengths/weaknesses |
| `POST /plan/profile/refresh` | 从原始数据强制重算档案 |
| `GET /plan/history` | 历史计划分页 |
| `POST /plan/generate/ai` | AI 生成计划（服务层注释 Pro-only；LLM 失败回退规则引擎） |
| `GET /plan/mastery-trend?weeks=` | 掌握度趋势（每日 mastery_snapshots） |
| `GET /plan/milestones` | 里程碑列表（8 种：vocab_50/mastered_100_words/vocab_200/streak_7_days/streak_30_days/completed_10_videos/first_shadowing/first_review） |

规则引擎优先级（`services/learning_plan_service.py`）：1. 到期词汇复习 → 2. 继续进行中视频 → 2.5. 进行中视频跟读 → 3. 匹配 target_exam 的新视频 → 4. 近期学词练习 → 5. 词汇 drill 补足日目标。

### 3.9 学习事件（`models/learning_plan.py` LearningEvent）

- 类型：`completed_video` / `learned_words` / `practiced_items` / `reviewed_words` / `completed_plan` / `met_daily_goal`
- 结构：user_id/event_type/event_value/video_id/plan_id/event_metadata/event_date（用户本地日期，服务端按 timezone 计算）
- 索引：(user_id, event_date)、(user_id, event_type)
- 发射点（代码可验证）：`vocabulary.py` 词汇复习提交（reviewed_words）、`practice_service` 练习提交（practiced_items+learned_words）、`learning_plan_service` 计划项完成、`behavior_service` 视频完成事件镜像（completed_video）、`shadowing_service`（跟读）
- 消费：profile 聚合（streak/日计数/周循环）、mastery_snapshots 每日快照

### 3.10 浏览与发现（`api/v1/browse.py`、`recommendations.py`）

| 端点 | 说明 |
|---|---|
| `GET /browse/categories` | 9 分类：all/ted/interview/news/vlog/educational/movie/tech/speech |
| `GET /browse/feed?category=&level=&page=` | 浏览流：official+published+ready 视频，topic_tags LIKE 分类过滤 + difficulty_level 过滤，created_at 倒序，Redis 缓存 300s |
| `GET /browse/featured?limit=` | 首页精选（show_on_homepage+published+ready），缓存 300s |
| `GET /recommendations/home?page=` | 首页推荐 feed：40/30/20/10 混合（官方精选/高互动/新内容/多样性）+ 软个性化（历史点击 topic_tags + CEFR/target_exam band）；游客同策略无个性化；按用户缓存 |
| `GET /recommendations/category/{tag}` | 标签内按 learning_score 排序推荐 |
| `POST /behavior/events` / `events/batch` | 行为采集（click/play/pause/seek/complete/watch_time 等；匿名允许；complete 事件镜像到 Video.view_count + LearningRecord） |

### 3.11 视频评分（`services/scoring_service.py` + `models/video_score.py`）

- `videos.score`（0-100 反规范化总分的排序字段）+ `video_scores` 每次计算明细行（可审计/可解释）
- 7 因子（权重来自 Settings `score_weight_*`）：ctr/retention/watch_time/topic_match/quality(翻译覆盖率)/viral(外站播放数 log 归一 vs 频道均值)/freshness(views_per_day vs benchmark)
- bonus：`is_official` 视频 + `score_bonus_points`
- 无数据因子为 0；新视频靠 TopicMatch/Quality/Bonus 得非零分
- 任务：finalize 完成即算一次；beat 每小时 Top200（按 view_count）+ 每日全量

### 3.12 评论分析（`api/v1/comments.py`，prefix `/comments`）

| 端点 | 说明 |
|---|---|
| `GET /comments/top-videos` | 按 comment_quality_score 排序的视频（official+published+ready） |
| `POST /comments/analyze?video_id=` | 管理员触发异步分析（Celery 拉取 YouTube 评论 → 质量评分：学习相关度/深度/互动三维 + 综合分 + 关键词统计，写 video_comment_stats + videos.comment_quality_score） |
| `GET /comments/{video_id}` | 评论列表（like_count 倒序，external_id 去重） |
| `GET /comments/{video_id}/stats` | 分析结果（未分析返回 analyzed=false） |

### 3.13 会员与兑换（`api/v1/redeem.py`，prefix `/redeem-codes`）

| 端点 | 说明 |
|---|---|
| `POST /redeem-codes/generate` | 管理员批量生成（count/plan/duration_days/batch_label）；码格式 `XXXX-XXXX-XX`（10 字符，无 0/O/1/I）；`expires_at = now + redeem_code_unused_expiry_days` |
| `GET /redeem-codes/export` | 导出未用码 CSV |
| `GET /redeem-codes` | 分页列表（status/batch_label/keyword 过滤） |
| `GET /redeem-codes/summary` | 各状态计数 |
| `POST /redeem-codes/redeem` | 核销：码行锁 + 用户行锁；仅 unused 可用；实时过期校验（不依赖每日任务）；plan=pro + `max(现有到期, now) + duration_days` 顺延 |
| `POST /redeem-codes/{id}/revoke` | 管理员作废未用码（reason: leak/error） |
| `POST /redeem-codes/{id}/refund` | 管理员退款追回：码→revoked(refund) + 用户 plan_expires_at 扣 duration_days + 到期则降 free（单事务） |

状态机：`unused → redeemed / revoked / expired`；`redeemed → revoked(refund)`。

### 3.14 支付（`api/v1/payments.py` + `mock_payments.py`）

- `POST /payments/create-order`：payments_enabled=false（默认，AdminSetting）时返回 ICP 提示文案（引导微信小商店+兑换码）；plan 取值 `pro_monthly`/`pro_annual`（PLAN_DEFINITIONS）
- `POST /payments/callback/alipay` / `wechat`：RSA2 / HMAC-SHA256 签名验证（生产强制）；成功 → 用户升 pro + 按 PLAN_DURATIONS 顺延
- `GET /payments/status` / `order/{order_id}`：订单状态查询
- `mock_payments.py`：仅 development/testing 环境注册
- 订单状态：pending → paid / expired / cancelled；beat：expire-pending-orders(5min)、reconcile-pending-orders(15min)

### 3.15 通知（`api/v1/notifications.py`，prefix `/notifications`）

| 端点 | 说明 |
|---|---|
| `GET /notifications` | 通知分页（created_at 倒序） |
| `GET /notifications/unread-count` | 未读数 |
| `PATCH /notifications/{id}/read` / `read-all` | 单条/全部已读 |
| `GET|PUT /notifications/preferences` | 通知偏好（默认全开；push_notifications/streak_reminder/weekly_report/community_updates/new_follower/comment_reply） |
| `WS /notifications/ws` | WebSocket 实时推送（best-effort；鉴权后 ping/pong 心跳） |

- 通知类型枚举（`models/notification.py`）：system/video_ready/pro_expiring/vocabulary_reminder/streak_warning/achievement_unlocked/comment_reply/social_follow/post_liked/quality_alert/announcement
- **实际发送路径（代码可验证）**：`quality_alert`（转录质量失败通知管理员）、`announcement`（`POST /admin/announcements` 公告广播）；其余枚举保留但无触发代码
- 去重：`ix_notifications_dedup`(user_id,type,related_url,is_read) 复合索引 + check-then-insert

### 3.16 反馈（`api/v1/feedback.py`）

| 端点 | 说明 |
|---|---|
| `POST /feedback` | 提交反馈（category: suggestion/bug/other；可选 contact 联系方式） |
| `GET /feedback/mine` | 我的反馈 |
| `GET /admin/feedback` | 管理列表（status 过滤；用户名脱敏显示尾号） |
| `PATCH /admin/feedback/{id}` | 更新 status（open→in_progress→resolved）/admin_reply |
| `POST /admin/announcements` | 公告广播给全部用户（返回通知数） |

### 3.17 管理后台（`api/v1/admin.py`，prefix `/admin`）

| 端点 | 说明 |
|---|---|
| `GET /admin/worker-status` | GPU worker 在线状态（Redis 心跳） |
| `GET /admin/stats?days=` | 仪表盘 KPI + 趋势 + 分布（用户/视频/订单/兑换码/活跃度） |
| `GET /admin/users` | 用户列表（role/plan/keyword 过滤；plan 支持 expired） |
| `PATCH /admin/users/{id}/ban` / `role` / `plan` | 封禁（不能封自己）/角色（不能改自己）/计划授予或吊销 |
| `GET /admin/orders` | 订单列表 |
| `GET /admin/redemptions` / `summary` | 兑换记录列表/状态计数 |
| `GET|PUT /admin/settings` | 平台设置（单例行）：site_name/wechat_shop_url/payments_enabled/registration_enabled/quality_block_enabled/quality_block_threshold(0.60)/quality_warn_threshold(0.80)/hallucination_detection_enabled/translate_timeout_sec(1800)/download_timeout_sec(3600)/download_auto_retry_enabled/watchdog_enabled |
| `GET /admin/admins` | 管理员账户列表 |

### 3.18 媒体服务（`api/v1/media.py`）

| 端点 | 说明 |
|---|---|
| `GET /media/proxy?url=` | 图片代理：域名白名单（ytimg.com/hdslb.com/biliimg.com/douyinpic.com/douyincdn.com/douyinstatic.com/aliyuncs.com）+ 对应 Referer 防盗链 + ≤5MB + 连接池复用 |
| `GET|HEAD /media/{path}` | 本地媒体文件：完整 HTTP Range 支持（206/416）、路径穿越防护、HEAD 广告 Accept-Ranges |

### 3.19 其他端点

| 端点 | 说明 |
|---|---|
| `POST /presence/heartbeat` | 在线心跳 |
| `POST /internal/transcription/callback` | GPU worker 转录回调（共享密钥 X-Callback-Secret）：Redis 去重锁（fail-closed，503 让 worker 重试）→ 幻觉质量门（失败置 error+通知管理员）→ 幂等写字幕（已存在跳过）→ ready_subtitles → 派发 finalize |
| `POST /ai/word-lookup` | Pro：单词语境释义 |
| `GET /ai/assistant/summary` / `recommend` | Pro：AI 学习总结 / 学习推荐 |
| `GET /health` | DB/Redis 健康检查 |

### 3.20 前端页面（`frontend/src/app/` 实际路由）

| 路由 | 页面 |
|---|---|
| `/`（main 组） | 首页：问候 + 成就 Banner + FocusCard(计划 CTA) + 视频流（filter-bar+网格+无限滚动） |
| `/browse` | 浏览页（分类+难度筛选+分页） |
| `/watch/[id]` | 观看页：播放器（YouTube iframe + 本地双后端）/字幕三模式（英/中/双语）/词级高亮（按 target_exam）/点击查词（WordTooltipInline 词卡）/跟读录音（AudioWaveform + ShadowingHistory）/收藏+笔记/进度保存/ForkBadge/ExamLevelSelector |
| `/vocabulary` + `/vocabulary/drill` | 词汇本 + 练习（drill） |
| `/practice` | 练习入口页 |
| `/history` | 学习记录 |
| `/my-videos` + `/my-videos/[id]` | 我的视频（UGC 创作者：fork/编辑字幕/提交审核/PR） |
| `/search` | 搜索（视频+字幕） |
| `/profile` | 个人中心（用户卡/偏好/目标考试/档案） |
| `/pricing` `/upgrade` `/redeem` `/checkout` | 会员与兑换 |
| `/contact` | 反馈提交 |
| `/login` `/register` `/forgot-password` `/onboarding` | 认证 |
| `/terms` `/privacy` | 法律页 |
| `/landing`（landing 组） | 落地页（SSR+SEO） |
| `/admin/login` + `/admin/(shell)`：dashboard/stats/users/videos(+detail)/invites/orders/settings/feedback | 管理后台 |

---

## 4. 后台任务（`backend/app/tasks/celery_app.py` beat_schedule 实际列表）

| 任务 | 周期 | 说明 |
|---|---|---|
| expire-pending-orders | 5min | 超时未付订单置 expired |
| reconcile-pending-orders | 15min | 向支付方核对丢失回调的订单 |
| watchdog-stale-pipeline | 10min | 按 per-step 超时标记卡死管线（processing/ready_subtitles） |
| retry-failed-downloads | 24h | 重试失败下载（先刷新 cookies，3 次上限） |
| score-videos-hourly | 1h | 热视频（Top200 by view_count）评分 |
| score-videos-daily | 24h | 全量评分 |
| downgrade-expired-pro | 1h | 过期 Pro 回写 free |
| expire-unused-redeem-codes | 24h | 过期未用码置 expired |

队列拓扑：GPU 转录任务路由到 `transcription_gpu` 专用队列（GPU worker 独占）；其余走默认 `celery` 队列（云端 worker）。

---

## 5. 数据模型清单（`backend/app/models/` 实际文件）

| 文件 | 表 |
|---|---|
| user.py | users（plan/plan_expires_at/role/password_changed_at/onboarding_completed/native_language/avatar_url/bio/timezone/is_banned/last_active_at） |
| preferences.py | user_preferences（notification_preferences JSON/daily_goal_type/value/reminder_*/auto_play_next_subtitle/subtitle_mode_default/preferred_difficulty/target_exam） |
| video.py | videos（status/source/local-imported/review_status/processing_mode/step/3 分辨率 URL/is_official/is_featured/is_published/auto_publish/quiz_data/comment_count/quality_score/like/favorite/view_count/score/score_updated_at/show_on_homepage/processing_started_at/step_started_at/quality_flag/download_fail_*/yt_video_id/channel_*/upload_date/ext_*/external_meta/wpm/vocabulary_density/forked_from/published_snapshot） |
| subtitle.py | subtitles（+word_levels JSON/+words 词级时间戳） |
| subtitle_revision.py | subtitle_revisions（scope: fork/standard/sync、before/after 变更字段） |
| subtitle_change_proposal.py | subtitle_change_proposals（pending→merged/rejected/withdrawn，changes JSON） |
| subtitle_mergeable_update.py | subtitle_mergeable_updates |
| subtitle_resegment_snapshot.py | subtitle_resegment_snapshots |
| learning.py | learning_records（user_id+video_id 唯一）、vocabulary（SM-2 全套字段）、speaking_attempts（冻结，无新写入） |
| learning_plan.py | user_learning_profiles/learning_plans/learning_plan_items/learning_events |
| milestone.py | user_milestones（8 类型）、mastery_snapshots |
| favorite.py | user_favorites、user_notes（均 (user,video) 唯一） |
| engagement.py | video_likes（(video,user) 唯一） |
| behavior.py | behavior_events（自增 BigInteger 主键，匿名允许，高写入日志表） |
| comment.py | video_comments（external_id 去重）、video_comment_stats |
| shadowing.py | shadowing_attempts |
| redeem.py | redeem_codes（4 态 + revoked_reason） |
| order.py | orders（pro_monthly/pro_annual，pending/paid/expired/cancelled） |
| notification.py | notifications（类型枚举 + 去重索引） |
| feedback.py | feedbacks |
| admin_setting.py | admin_settings（单例行 id='global'） |
| word_note.py | word_ai_notes（(word,level,context_source) 唯一；global / video:{id}） |
| exam_corpus.py | exam_sentences/exam_sentence_words/exam_word_freq（真题例句与词频） |
| video_score.py | video_scores（每次评分明细） |
| video_standard.py | video_standards（source_url PK → canonical_video_id） |
| video_quality_report.py | video_quality_reports（转录/翻译质量，append-only） |

---

## 6. 非功能需求（代码可验证）

| 项 | 代码事实 |
|---|---|
| 错误信封 | `core/errors.py` 统一 `{code, message, detail?}`；前端 `apiErrorMessage` 按 err.code 映射中文 |
| 限流 | slowapi `@rate_limit` 覆盖全部端点（各端点限流见上文） |
| JWT | PyJWT 签发；access + refresh 双 token；refresh 轮换拉黑；密码变更使旧会话失效；黑名单开关 `jwt_blacklist_enabled` |
| 密码 | bcrypt 哈希 |
| Redis 韧性 | 绝大多数依赖 fail-open（sms 冷却、缓存、限流）；转录回调锁 fail-closed（防重复写字幕） |
| 质量安全网 | 转录：幻觉检测（回调时，fail→error+管理员通知）；翻译：质量门（覆盖率低于 block 阈值→quality_blocked 标记 error；低于 warn→quality_warning 照常 ready 显示告警）；翻译重试：指数退避 2s/4s/8s + 双引擎并发（qwen 主 + hy_mt2 兜底，可配 prewarm_engines） |
| 断点续传 | Redis `video:steps:{id}` 步骤记录；finalize 各步幂等（compute-on-null 保护人工 word_levels） |
| 媒体 | 本地媒体 Range 支持；生产 nginx 前置；媒体文件存本地 `local_media_path` |
| 安全边界 | GPU worker 无 DB/OSS 凭证（转录回调共享密钥）；图片代理域名白名单 + 大小上限；媒体路径穿越防护 |
| 可观测 | structlog（请求/任务 request_id 贯穿）、Prometheus、健康检查 |
| 合规 | 非经营性平台：payments_enabled 默认 false，仅兑换码渠道；注册开关；服务条款/隐私页 |
| 前端工程 | tsc/build/lint 全绿、暗色模式（CSS 语义 token + .dark 块）、响应式（移动 TabBar） |

---

## 7. 明确非目标（代码确认已下线/冻结）

| 功能 | 代码证据 |
|---|---|
| AI 口语评分（发音打分/评分维度） | `models/learning.py` SpeakingAttempt 注释：冻结（ADR-0002），无新写入；rubrics/speaking_service 模型已删 |
| 练习/考试试题系统（exam_sessions/exam_answers/服务端判分/错题本/试卷） | 代码中不存在相关模型/路由（git 提交 `2efce36` 下线；仅保留词汇 drill 与观看页练习面板） |
| 社区（帖子/评论互动/关注） | models 中无 community 模型；通知枚举 comment_reply/social_follow/post_liked 保留但无触发代码；video_likes 保留用于点赞+推荐信号 |
| 在线支付收款 | payments_enabled 默认 false；create-order 返回 ICP 引导文案；兑换码为唯一付费激活渠道 |
| YouTube 在线搜索 | 无 youtube 搜索路由（本地搜索替代） |

---

## 8. 附注：与既有文档的差异（供维护者注意）

以下为**代码事实**与 `.agent/` 描述不一致之处（本文档以代码为准）：

1. **影子跟读是活跃功能**：`.agent/context.md` 称跟读已移除（ADR-0002），但代码中 shadowing API、录音上传、watch 页跟读 UI、计划项 shadowing 类型、里程碑 first_shadowing、档案 total_shadowing_count 全部存在且互相关联。被移除的仅是 AI 评分（SpeakingAttempt 冻结）。
2. **UGC 创作者链路活跃**：user-seed/fork/propose-back PR/审核状态机在代码中完整存在（`.agent` 称已砍，实为砍了"社区"，创作者流程保留）。
3. **考试级别 8 级**：含中考/考研/雅思/托福/GRE（不止 CET4/6+高考）。
4. **`POST /plan/generate/ai` 无路由层 Pro 校验**：仅服务层注释声明 Pro-only（`.agent` 称"Pro 专属"）。
