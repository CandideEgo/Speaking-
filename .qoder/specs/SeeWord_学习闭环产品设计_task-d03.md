# SeeWord 学习闭环 — 工程实施计划

---

## Gap Analysis：现状 vs 目标

| 闭环环节 | 目标能力 | 现状 | Gap 级别 |
|----------|----------|------|----------|
| 内容发现 | 难度标签 + 词汇复现推荐 | recommendation_service 有 40/30/20/10 mix + CEFR soft boost，无难度计算、无词汇复现 | MEDIUM |
| 视频沉浸 | 字幕内「正在学的词」提示 | SubtitleList + WordTooltipInline 已有高亮，无「词库中」标记 | LOW |
| 生词理解 | 查词即入库 + 多语境 | WordTooltipInline 有查词，Vocabulary 有 video_id/context_sentence（单语境） | LOW |
| 句子跟读 | 逐句录音 + A/B 对比 + 持久化 | useSpeakingRecorder 存在但仅单次录音回放、无持久化、无逐句流程 | **HIGH** |
| 自动入词库 | 多语境合并 | Vocabulary 表 UniqueConstraint(user_id, word)，只存首次语境 | MEDIUM |
| 间隔复习 | 独立全屏复习页 | 复习嵌在 /vocabulary 页内（Modal 模式） | MEDIUM |
| 掌握度 | 趋势图 + 成就系统 | UserLearningProfile 有 mastery_by_level 快照，无历史趋势、无成就 | MEDIUM |
| 推荐适配 | 难度自适应 + 词汇复现 | 推荐仅 topic_tags + CEFR band soft boost | MEDIUM |
| 闭环计数 | 4 维（watch+vocab+shadowing+review） | WeeklyCycleCounter 计 4 维但 shadowing 无数据源 | LOW（依赖跟读） |

---

## Epic 拆分

| Epic | 名称 | 核心价值 | Sprint |
|------|------|----------|--------|
| E1 | 跟读训练系统 | 补齐闭环缺失环节 | Sprint 1 |
| E2 | 独立复习页 + 词汇多语境 | 提升复习沉浸感 + 语境复现基础 | Sprint 2 |
| E3 | 视频难度 + 词汇复现推荐 | 闭环「推荐更适合的视频」 | Sprint 3 |
| E4 | 掌握度可视化 + 成就系统 | 正反馈留存 | Sprint 4 |

---

## Sprint 1：跟读训练系统（E1）

**目标**：用户在 watch 页可逐句跟读、录音、A/B 对比，录音持久化，事件纳入闭环。

### Task 1.1 — DB: shadowing_attempts 表 + LearningEvent 扩展

| 维度 | 内容 |
|------|------|
| Backend | 新建 `backend/app/models/shadowing.py` — ShadowingAttempt model |
| DB Migration | 新 Alembic 迁移：创建 `shadowing_attempts` 表 (id, user_id, video_id, subtitle_id, audio_url, duration_ms, is_satisfied, created_at)；`user_learning_profiles` 加 `total_shadowing_count` (int, default 0) |
| Backend | 修改 `backend/app/services/learning_event_service.py` — VALID_EVENT_TYPES 加 `"shadowed_sentences"` |
| 测试 | `backend/tests/test_shadowing_model.py` — model CRUD；验证 emit_event 接受新类型 |

### Task 1.2 — Backend: 跟读 API

| 维度 | 内容 |
|------|------|
| Backend | 新建 `backend/app/api/v1/shadowing.py` — router: POST /shadowing/attempts (创建), GET /shadowing/attempts?video_id= (列表), GET /shadowing/stats |
| Backend | 新建 `backend/app/services/shadowing_service.py` — create_attempt (写 DB + emit LearningEvent + 更新 profile.total_shadowing_count), list_by_video, get_stats |
| Backend | 修改 `backend/app/api/v1/__init__.py` — 注册 shadowing router |
| Backend | 修改 `backend/app/main.py` — include router |
| API 变化 | `POST /api/v1/shadowing/attempts` body: {video_id, subtitle_id, audio_url, duration_ms, is_satisfied}；`GET /api/v1/shadowing/attempts?video_id=X`；`GET /api/v1/shadowing/stats` |
| 测试 | `backend/tests/test_shadowing_api.py` — 创建/列表/统计/事件发射 |

### Task 1.3 — Backend: 音频上传

| 维度 | 内容 |
|------|------|
| Backend | 修改 `backend/app/api/v1/media.py` — 新增 `POST /media/shadowing-audio` 端点，接收 webm/ogg blob，存 `media/shadowing/{user_id}/{uuid}.webm` |
| Backend | 复用 `backend/app/services/oss_service.py` 或直接本地存储（与现有 media 一致） |
| 测试 | 上传 + 返回 URL 验证 |

### Task 1.4 — Backend: 学习计划支持跟读

| 维度 | 内容 |
|------|------|
| Backend | 修改 `backend/app/services/learning_plan_service.py` — item_type 新增 `"shadowing"`，规则引擎在「继续观看」后插入跟读项 |
| Backend | 修改 `backend/app/models/learning_plan.py` — LearningPlanItem docstring 更新 item_type 枚举 |
| 测试 | 验证 generate_daily_plan 可产出 shadowing 类型 item |

### Task 1.5 — Frontend: ShadowingPanel 组件

| 维度 | 内容 |
|------|------|
| Frontend | 新建 `frontend/src/components/shadowing/ShadowingPanel.tsx` — 主面板（渐进披露：默认折叠 CTA「开始跟读」，展开后显示逐句流程） |
| Frontend | 新建 `frontend/src/components/shadowing/ShadowingPlayer.tsx` — 单句播放器：原声播放 + 录音按钮 + A/B 切换 |
| Frontend | 新建 `frontend/src/components/shadowing/AudioRecorder.tsx` — 复用 `useSpeakingRecorder` hook 逻辑，增加按住录音交互 |
| Frontend | 新建 `frontend/src/components/shadowing/WaveformCompare.tsx` — 复用现有 `AudioWaveform` 组件，双波形对比 |
| Frontend | 新建 `frontend/src/components/shadowing/ShadowingProgress.tsx` — 进度条 X/Y 句 |
| Frontend | 复用 | `frontend/src/hooks/useSpeakingRecorder.ts`（已有 MediaRecorder 逻辑）；`frontend/src/components/speaking/AudioWaveform.tsx`（已有波形渲染） |

### Task 1.6 — Frontend: Watch 页集成

| 维度 | 内容 |
|------|------|
| Frontend | 修改 `frontend/src/app/(main)/watch/[id]/page.tsx` — 在练习区下方/旁边嵌入 ShadowingPanel |
| Frontend | 修改 `frontend/src/components/subtitle/SubtitleList.tsx` — 每行字幕右侧加麦克风 icon（点击跳转到该句跟读） |
| Frontend | 新建 `frontend/src/hooks/useShadowing.ts` — 跟读状态管理（当前句、录音列表、进度、API 调用） |
| Frontend | 修改 `frontend/src/lib/api.ts` — 无需改动（通用 api.post/get 即可） |
| Frontend | 修改 `frontend/src/types/index.ts` — 新增 ShadowingAttempt, ShadowingStats 类型 |

### Task 1.7 — Frontend: 闭环计数更新

| 维度 | 内容 |
|------|------|
| Frontend | 修改 `frontend/src/components/plan/DailyProgressCard.tsx` — 增加跟读维度 ring |
| Frontend | 修改 `frontend/src/components/plan/WeeklyCycleCounter.tsx` — 闭环定义注释更新（数据源由后端 profile 驱动，前端无需改逻辑） |
| Frontend | 修改 `frontend/src/components/plan/PlanItemCard.tsx` — 支持 item_type="shadowing" 渲染 |

### Task 1.8 — 测试 + E2E

| 维度 | 内容 |
|------|------|
| 测试 | 后端：`test_shadowing_api.py`（CRUD + 事件 + 计划集成） |
| 测试 | 前端：手动验证录音流程（MediaRecorder 不易 unit test） |
| E2E | `frontend/e2e/shadowing.spec.ts` — mock 音频，验证面板展开/折叠/进度 |

**Sprint 1 上线标准**：用户可在 watch 页逐句跟读、录音回放对比、录音持久化、首页闭环计数包含跟读。

---

## Sprint 2：独立复习页 + 词汇多语境（E2）

**目标**：复习从词库页独立为全屏专注模式；词汇支持多视频语境。

### Task 2.1 — DB: vocab_contexts 表

| 维度 | 内容 |
|------|------|
| Backend | 新建 `backend/app/models/vocab_context.py` — VocabContext model (id, vocabulary_id FK, video_id FK, subtitle_id FK, sentence_text, created_at) |
| DB Migration | 创建 `vocab_contexts` 表 + 索引 (vocabulary_id, video_id) |
| Backend | 修改 `backend/app/models/learning.py` — Vocabulary 加 relationship `contexts` |
| 测试 | model 关系验证 |

### Task 2.2 — Backend: 多语境写入

| 维度 | 内容 |
|------|------|
| Backend | 修改 `backend/app/api/v1/words.py` — 查词入库时，若词已存在则追加 VocabContext（不覆盖原词记录） |
| Backend | 修改 `backend/app/services/vocabulary_service.py` — add_word_context() 方法 |
| API 变化 | `GET /api/v1/vocabulary/{word_id}` response 增加 `contexts: [{video_id, sentence_text, video_title}]` |
| 测试 | 同词不同视频 → 验证 contexts 累积 |

### Task 2.3 — Backend: 复习会话 API

| 维度 | 内容 |
|------|------|
| Backend | 修改 `backend/app/api/v1/vocabulary.py` — 新增 `GET /vocabulary/review-session?count=20` 返回到期词 + 语境；`POST /vocabulary/review-session/complete` 批量提交结果 |
| Backend | 复用 `backend/app/services/sr_service.py` — calculate_next_review 不变 |
| API 变化 | `GET /api/v1/vocabulary/review-session` → {items: [{word, ipa, contexts[]}]}；`POST .../complete` body: {results: [{word_id, quality}]} |
| 测试 | 到期词筛选 + SM-2 更新 + LearningEvent(reviewed_words) |

### Task 2.4 — Frontend: /review 页面

| 维度 | 内容 |
|------|------|
| Frontend | 新建 `frontend/src/app/(main)/review/page.tsx` — 复习专注页（全屏卡片流） |
| Frontend | 新建 `frontend/src/components/review/ReviewSession.tsx` — 卡片流控制器（加载 → 翻卡 → 自评 → 下一张 → 完成） |
| Frontend | 新建 `frontend/src/components/review/ReviewCard.tsx` — 单卡：正面(英文+音标) → 翻转 → 背面(中文+语境例句) |
| Frontend | 新建 `frontend/src/components/review/ReviewSummary.tsx` — 完成统计（N 词，记住 X%） |
| Frontend | 新建 `frontend/src/hooks/useReviewSession.ts` — 复习会话状态机 |
| 复用 | 键盘快捷键逻辑从 vocabulary/page.tsx 提取为共享 hook |

### Task 2.5 — Frontend: 入口联通

| 维度 | 内容 |
|------|------|
| Frontend | 修改 `frontend/src/app/(main)/page.tsx` — 首页「开始复习」CTA 跳转 `/review`（原为打开词库页 modal） |
| Frontend | 修改 `frontend/src/components/layout/Sidebar.tsx` — 导航加「复习」入口 |
| Frontend | 修改 `frontend/src/components/layout/MobileTabBar.tsx` — 移动端同步 |
| Frontend | 修改 `frontend/src/app/(main)/vocabulary/page.tsx` — 保留词库列表，复习入口改为跳转 /review |

### Task 2.6 — 测试

| 维度 | 内容 |
|------|------|
| 测试 | 后端：`test_review_session.py`（到期词 + 批量提交 + 事件） |
| E2E | `frontend/e2e/review.spec.ts` — 完整复习流程（翻卡 → 自评 → 完成统计） |

**Sprint 2 上线标准**：/review 独立可用，复习卡片展示视频语境例句，词汇多语境累积。

---

## Sprint 3：视频难度 + 词汇复现推荐（E3）

**目标**：视频有难度标签；推荐优先推含用户「学习中」词汇的视频。

### Task 3.1 — DB + Backend: 视频难度计算

| 维度 | 内容 |
|------|------|
| DB Migration | `videos` 表加 `difficulty_level` (int, nullable, 1-5)；`videos` 表加 `difficulty_computed_at` (datetime, nullable) |
| Backend | 新建 `backend/app/services/difficulty_service.py` — compute_video_difficulty(video_id)：统计字幕中 CET4/CET6/高考词占比 → 映射 1-5 级 |
| Backend | 修改 `backend/app/tasks/video_processing.py` — finalize_video 末尾调用 compute_video_difficulty |
| Backend | 修改 `backend/app/models/video.py` — 加 difficulty_level, difficulty_computed_at 字段 |
| API 变化 | `GET /api/v1/videos/{id}` 和 browse 列表 response 增加 `difficulty_level` |
| 测试 | 难度计算逻辑（mock 字幕词汇）；已有视频回填脚本 `backend/scripts/backfill_difficulty.py` |

### Task 3.2 — Backend: 词汇复现推荐

| 维度 | 内容 |
|------|------|
| Backend | 修改 `backend/app/services/recommendation_service.py` — 新增 `_vocab_recurrence_boost(db, user_id, candidates)` 函数：查用户 learning 状态词汇 → 匹配视频字幕 word_levels → boost 含复现词的视频 score |
| Backend | 新建辅助查询：从 Vocabulary(learning) 取词表 → 在 Video 的 subtitles word_levels JSON 中匹配 |
| 测试 | 推荐排序验证：含复现词的视频排在前面 |

### Task 3.3 — Frontend: 难度标签 + 复现提示

| 维度 | 内容 |
|------|------|
| Frontend | 新建 `frontend/src/components/video/DifficultyBadge.tsx` — 难度色块（1-5 级，绿→红） |
| Frontend | 修改 `frontend/src/components/ui/VideoCard.tsx` — 嵌入 DifficultyBadge |
| Frontend | 新建 `frontend/src/components/watch/VocabHighlightChip.tsx` — 字幕中「你正在学的词」标记 |
| Frontend | 修改 `frontend/src/components/subtitle/SubtitleList.tsx` — 词级渲染时检查是否在用户词库中 |
| Frontend | 修改 `frontend/src/types/index.ts` — Video 类型加 difficulty_level |
| Frontend | 修改 `frontend/src/stores/feedStore.ts` — 无需改动（API response 自动携带） |

### Task 3.4 — Frontend: Browse 页难度筛选

| 维度 | 内容 |
|------|------|
| Frontend | 修改 `frontend/src/app/(main)/browse/page.tsx` — 加难度筛选 pills（全部/1-2/3/4-5） |
| Backend | 修改 `backend/app/api/v1/browse.py` — 支持 `?difficulty=3` query param |
| 测试 | 筛选 API 验证 |

**Sprint 3 上线标准**：视频卡显示难度标签，browse 可按难度筛选，推荐流含词汇复现 boost。

---

## Sprint 4：掌握度可视化 + 成就系统（E4）

**目标**：用户看到进步趋势 + 里程碑成就，提升留存。

### Task 4.1 — DB + Backend: 掌握度快照 + 成就

| 维度 | 内容 |
|------|------|
| DB Migration | 新建 `user_milestones` 表 (id, user_id, milestone_type, achieved_at, metadata_json)；新建 `mastery_snapshots` 表 (id, user_id, snapshot_date, mastery_json) 用于趋势 |
| Backend | 新建 `backend/app/models/milestone.py` — UserMilestone + MasterySnapshot models |
| Backend | 新建 `backend/app/services/milestone_service.py` — check_and_award(user_id)：掌握100词/连续7天/完成10视频/首次跟读 等规则 |
| Backend | 修改 `backend/app/services/profile_service.py` — 每日首次事件时写 MasterySnapshot |
| API 变化 | `GET /api/v1/plan/profile` response 增加 `milestones[]`；新增 `GET /api/v1/plan/mastery-trend?weeks=8` |
| 测试 | 成就触发规则；快照写入 |

### Task 4.2 — Frontend: 掌握度趋势图

| 维度 | 内容 |
|------|------|
| Frontend | 新建 `frontend/src/components/profile/MasteryTrend.tsx` — 折线图（recharts 或纯 SVG，按周展示 new/learning/mastered 变化） |
| Frontend | 修改 `frontend/src/app/(main)/profile/page.tsx` — 嵌入 MasteryTrend |
| Frontend | 修改 `frontend/src/components/profile/ProfileTab.tsx` — 增加趋势区域 |

### Task 4.3 — Frontend: 成就徽章

| 维度 | 内容 |
|------|------|
| Frontend | 新建 `frontend/src/components/profile/MilestoneBadge.tsx` — 徽章卡片（icon + 名称 + 达成日期） |
| Frontend | 修改 `frontend/src/app/(main)/page.tsx` — 首页展示最新达成成就（toast 或 banner） |
| Frontend | 修改 `frontend/src/app/(main)/profile/page.tsx` — 成就列表区 |

### Task 4.4 — 测试

| 维度 | 内容 |
|------|------|
| 测试 | 后端：`test_milestone_service.py`（各规则触发） |
| E2E | 验证 profile 页趋势图渲染 |

**Sprint 4 上线标准**：profile 页展示掌握度趋势 + 成就列表，达成里程碑时首页提示。

---

## 文件影响汇总

### 新建文件（按 Sprint）

| Sprint | 文件 |
|--------|------|
| S1 | `backend/app/models/shadowing.py`, `backend/app/services/shadowing_service.py`, `backend/app/api/v1/shadowing.py`, `frontend/src/components/shadowing/{ShadowingPanel,ShadowingPlayer,AudioRecorder,WaveformCompare,ShadowingProgress}.tsx`, `frontend/src/hooks/useShadowing.ts` |
| S2 | `backend/app/models/vocab_context.py`, `frontend/src/app/(main)/review/page.tsx`, `frontend/src/components/review/{ReviewSession,ReviewCard,ReviewSummary}.tsx`, `frontend/src/hooks/useReviewSession.ts` |
| S3 | `backend/app/services/difficulty_service.py`, `backend/scripts/backfill_difficulty.py`, `frontend/src/components/video/DifficultyBadge.tsx`, `frontend/src/components/watch/VocabHighlightChip.tsx` |
| S4 | `backend/app/models/milestone.py`, `backend/app/services/milestone_service.py`, `frontend/src/components/profile/{MasteryTrend,MilestoneBadge}.tsx` |

### 高频修改文件（跨 Sprint）

| 文件 | 涉及 Sprint |
|------|-------------|
| `backend/app/services/learning_event_service.py` | S1 |
| `backend/app/services/learning_plan_service.py` | S1 |
| `backend/app/services/recommendation_service.py` | S3 |
| `backend/app/api/v1/vocabulary.py` | S2 |
| `backend/app/api/v1/media.py` | S1 |
| `backend/app/tasks/video_processing.py` | S3 |
| `frontend/src/app/(main)/watch/[id]/page.tsx` | S1, S3 |
| `frontend/src/components/subtitle/SubtitleList.tsx` | S1, S3 |
| `frontend/src/app/(main)/page.tsx` | S2, S4 |
| `frontend/src/components/plan/PlanItemCard.tsx` | S1 |
| `frontend/src/types/index.ts` | S1, S2, S3 |

---

## 向后兼容保证

| 变更 | 兼容策略 |
|------|----------|
| shadowing_attempts 新表 | 纯新增，不影响现有表 |
| LearningEvent 新类型 | VALID_EVENT_TYPES 集合扩展，旧事件不受影响 |
| LearningPlanItem 新 item_type | 前端 PlanItemCard 对未知 type 降级为隐藏 |
| Vocabulary 多语境 | 新表 vocab_contexts，原 Vocabulary.context_sentence 保留不删 |
| videos.difficulty_level | nullable 字段，旧视频 null → 前端不显示 badge |
| /review 新页面 | 纯新增路由，/vocabulary 保留原有功能 |
| 推荐 vocab boost | soft boost 叠加在现有 score 排序上，不改变 API 契约 |
| 音频上传 | 新端点 /media/shadowing-audio，不影响现有 /media 逻辑 |

---

## 每 Sprint 工期估算

| Sprint | 预估工期 | 可独立上线 |
|--------|----------|------------|
| Sprint 1（跟读） | 2 周 | 是 — 跟读功能完整闭环 |
| Sprint 2（复习+语境） | 1.5 周 | 是 — /review 独立可用 |
| Sprint 3（难度+推荐） | 1.5 周 | 是 — 难度标签 + 推荐增强 |
| Sprint 4（成就+趋势） | 1 周 | 是 — 纯增量展示 |
