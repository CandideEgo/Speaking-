# 上线冲刺计划 2026-07

> 制定:2026-07-06。ADR-0011 推荐系统 P0-P2 + 字幕编辑器/练习题重新设计 + 上线准备。
> 按阶段执行,每阶段独立 commit。执行顺序:**1 → 3 → 2 → 4 → 5 → 6**。

## 背景

- 注册已通(手机号+验证码+密码),邮箱 stub 不再阻塞上线(注册/登录/重置均走手机验证码)
- 当前 ~13 种子视频,未上线;剩余上线阻塞为部署侧(HTTPS / ICP 备案)
- ADR-0011 已重新定位为远期能力蓝图,但 P0-P2 用户决定推进(管道先建好)

## 关键发现(驱动设计)

1. **LearningRecord 四字段全断**:`time_spent_seconds` / `completed` 无任何写入路径;`progress_percentage` / `position_seconds` 后端有端点(`PATCH /learning/progress`)但前端从不调用(续播也断)。P0 顺带修复这条断链。
2. **练习题两个真 bug**:
   - `context_fill` 类型不匹配——AI prompt 产 `fill_blank/qa/reading/sentence_building`,但 `practice_service.py:320,694` 过滤找 `context_fill`(AI 从不产)→ AI 题缓存永远空 → context 类词全回退 `sentence_repeat`
   - `sentence_repeat` 无条件判对——`usePractice.ts:67` 返回 `correct:true` → SM-2 mastery 虚高
3. **字幕编辑器后端建好前端没接**:`SubtitleRevision`(修订历史)/`SubtitleChangeProposal`(字幕 PR)/`update_subtitles_batch`(批量编辑)均为 dead code,后端全套就绪前端零入口。
4. **字幕编辑器"换行≠拆分"混淆**:换行只插 `\n`(时间戳不变),拆分才按时间切两条。当前用户混淆二者导致时间戳不一致。

## 阶段追踪

| 阶段 | 状态 | commit | 备注 |
|---|---|---|---|
| 1 练习题重设计+bug | ✅完成 | 387e14e | 逐题引导式;context_fill/sentence_repeat bug 修复;tsc+ruff 通过 |
| 2 编辑器 watch 格式重设计 | ✅完成 | 6636cab | 创作者中心+后台编辑页改 watch 格式(共享 VideoSubtitleEditorPanel)+后端时序校验+owner 修订/回滚端点;tsc/build/35 字幕测试通过 |
| 3 P0 行为采集+LearningRecord | ✅完成 | 447500a | behavior_events 表+续播+watchTime/click 埋点;迁移跑通;tsc+ruff 通过 |
| 4 P1 评分 | 待办 | - | 6 因子,配置化权重;改动前 gitnexus_impact finalize_video |
| 5 P2 推荐+首页 | 待办 | - | 40/30/20/10 |
| 6 上线准备 | 待办 | - | |

---

## 阶段详情

### 阶段 1:练习题重新设计 + bug 修复

**目标**:把 `UnifiedPracticePanel` 从"全展开卡片堆"改成"逐题引导式"(Duolingo 风),并修两个真 bug。

**前端重写**(`frontend/src/components/practice/PracticePanels.tsx`):
- 一次只渲染当前题(`currentIndex` 状态),大字号聚焦
- 顶部进度点(`●●●○○○`),可点击跳转
- 答对自动进下一题(800ms 延迟看反馈),答错可重试本题
- 底部 `✓n ✗n` + 等级标签 + 题型标签
- 完成态保留 `CompletionSummary`
- 6 种题型渲染保留,套进逐题框架

**Bug 修复**:
1. `context_fill` 类型不匹配:
   - `practice_service.py:320,694` 过滤改 `fill_blank`,适配字段映射(`sentence_template` 等)
   - 同步 `ai_service.py:368-391` prompt 确保产 `fill_blank` 带模板
2. `sentence_repeat` 判对:
   - `usePractice.ts:67` 不再无条件返回 `correct:true`
   - 新设计里 `sentence_repeat` = 录音→回放→自评(读对/需练),自评"需练"时 quality 降级(2)

**可选**:管线预热(`finalize_video` 加 `prewarm_practice`)、清理 stale 测试(`test_practice_questions.py` 对齐 schema)。

**验收**:逐题引导 UI 正常;context 类词拿到 AI `fill_blank` 题(非回退);`sentence_repeat` 自评"需练"时 mastery 不升。

---

### 阶段 2:字幕编辑器重新设计(播放器内联编辑)

> **实施时重定向(2026-07-06)**:用户决定不把编辑入口塞进 watch 页,而是把创作者中心 `/my-videos/[id]` 和后台 `admin/videos/[id]` 两个编辑板块重做成 watch 页格式 + 方便编辑的功能。watch 页不动。下文为原始设计,实际实现见本节末"实际实现"。

**目标**:watch 页对有权限用户(admin/creator/视频所有者)开放"边播边改"内联编辑,复用 watch 页播放器。

**设计**:
- watch 页当前字幕卡(`page.tsx:478-601`),对有权限用户显示"编辑"入口,进入内联编辑态
- 字幕文本变 inline Textarea,改文本实时反映
- 时间戳:`[●取开始] [●取结束]` 取当前播放时间
- **拆分交互(核心)**:光标位置 + 当前播放时间 → `[在此拆分]` → 切两条(光标前归当前句 end=现在,光标后归新句 start=现在),用 `subtitle.words` 词级时间戳精确切文本
- **换行/拆分明确区分**:Enter 换行只插 `\n`(时间戳不变);切时间必须用"拆分"
- 时间戳校验:`start < end` + 邻接重叠校验(后端 `subtitle_edit_service.py:104` 加)
- 顺带接通 per-line 修订历史 UI(后端 `SubtitleRevision` 已写,`GET .../revisions` + `POST .../rollback/{id}` 就绪,纯前端加"历史"折叠区)

**权限**:watch 页加 `canEdit` 判断(admin 或 `video.user_id === currentUser.id`),普通用户无入口。

**改动前**:`gitnexus_impact({target:"SubtitleEditor",direction:"upstream"})`(admin/creator 两处引用)。

**验收**:边播边改;光标+播放时间拆分;换行不破坏时间戳;修订历史可见可回滚。

**实际实现**(重定向后):
- 抽出共享组件 `VideoSubtitleEditorPanel`(watch 格式:左播放器+当前句卡只读/编辑态,右字幕列表跟随播放高亮+自动居中+点击跳转+考级高亮),`/my-videos/[id]` 与 `admin/videos/[id]` 复用;`SubtitleEditor` 内部不改(影响 LOW)。
- 当前句卡"编辑此句"进入编辑态,挂载 SubtitleEditor(`key` 强制 fresh mount,避免 split/merge 后 stale 状态)+ 可折叠 `SubtitleHistory`(逐句修订+回滚)。
- 后端:`subtitle_edit_service` 加 `_validate_timing`(start<end + 邻接不重叠,违例 ValueError→400);`videos.py` 加 owner revisions/rollback 端点(镜像 admin,owner 鉴权)。
- 前端:`adminData`/`creatorData` 各加 `listSubtitleRevisions`/`rollbackSubtitle`;`types` 加 `SubtitleRevision`/`SubtitleRevisionPage`。
- 不动:watch 页、`useVideoPlayer`、Video 类型(无需 `is_owned`)。
- 验证:35 字幕/修订测试通过(含新增 `test_overlap_with_next_rejected` + 2 个 owner 历史端点测试);tsc + build 通过;pre-commit 通过。

---

### 阶段 3:P0 行为采集 + LearningRecord 修复

**目标**:建行为数据通道 + 修 LearningRecord 断链(续播+学习记录)。

**后端**:
- 迁移 `add_behavior_events`:`behavior_events` 表 + `videos.view_count`
- `backend/app/services/behavior_service.py`:`ingest_event` / `ingest_batch`
- `backend/app/api/v1/behavior.py`:`POST /behavior/events` + `/behavior/events/batch`
- **同步更新 LearningRecord**(修断链):`complete`→`completed=True`;`watch_time` 增量累加 `time_spent_seconds`;`position`→`position_seconds` + 派生 `progress_percentage`
- **简化**:当前规模直接写 PG,**不引入 Redis Stream**(为 P4 实时消费预留,现在无消费者)

**前端**:
- `frontend/src/lib/analytics.ts`:`track()` + 内存队列 + 5s flush + `visibilitychange` 时 `sendBeacon`
- watch 页 `<video>` 补 `onPlay/onPause/onSeeked/onEnded`;`useVideoPlayer` 加 `watchTimeAccumulator`(每 10s 上报 `watch_time` 增量)
- 首页/分类页视频卡 click 埋点(带 `source`)
- **续播**:watch 页 mount 时读 `LearningRecord.position_seconds` → `seekTo`

**验收**:`POST /behavior/events/batch` 有真实请求;DB `behavior_events` 有数据;`videos.view_count` 完成播放后 +1;续播生效;`time_spent_seconds`/`completed` 有真实值。

---

### 阶段 4:P1 评分

**目标**:每视频算 0-100 `learning_score`,用于列表排序。

**后端**:
- 迁移 `add_video_scores`:`video_scores` 表 + `videos.score`/`score_updated_at`
- `backend/app/services/scoring_service.py`:6 因子加权,**权重配置化**(`config.py` 加 `score_weights`)
  - CTR 0.30 / Retention 0.25 / WatchTime 0.20 / TopicMatch 0.15 / Quality 0.10 / Bonus +0.10
  - 无数据阶段:Retention/WatchTime 算 0(不重分配,保持公式一致,等数据积累自然生效)
- `backend/app/tasks/scoring_tasks.py`:`compute_video_score` + beat 每小时 Top200 / 每天全量
- `finalize_video` 末尾调用 `compute_video_score.delay()` —— **改动前 `gitnexus_impact({target:"finalize_video",direction:"upstream"})`**
- `video_service.list_public_videos` 排序改 `score desc`(带 `is_featured` 兜底)

**API**:`GET /api/v1/videos/{id}/score`(admin/debug);视频详情返回 `score`。

**验收**:`SELECT video_id,total_score FROM video_scores ORDER BY total_score DESC LIMIT 20` 合理;新视频 5 分钟内有分。

---

### 阶段 5:P2 推荐 + 首页

**目标**:首页从 `created_at desc` 精选列表改成 score+行为推荐流。

**后端**:
- `backend/app/services/recommendation_service.py`:`get_home_feed` 实现 40/30/20/10(高分/潜力/冷启动/长视频)+ 同 `topic_tags` 连续≤2 去重 + 按 `target_exam_level` 过滤 + 按历史 click 的 `topic_tags` 加权
- `backend/app/api/v1/recommendations.py`:`GET /recommendations/home` + `/recommendations/category/{tag}`
- Redis 缓存 `recommend:home:{user_id}:{page}` TTL 60s
- `is_featured` 兜底:score 数据不足(新视频<5 click)时回退人工精选

**前端**:
- `frontend/src/hooks/useHomeFeed.ts`:从 `/browse/featured` 切到 `/recommendations/home`
- `frontend/src/stores/feedStore.ts`:缓存首页流 + 已读去重
- `frontend/src/app/(main)/page.tsx`:顶部"为你推荐"模块

**验收**:首页首卡是算法推荐(非人工 `is_featured`);切 `target_exam_level` 后内容变化;缓存命中率>70%。

---

### 阶段 6:上线准备

- **邮箱 stub**:不阻塞(注册/登录/重置走手机验证码),通知邮件上线后补
- **HTTPS/ICP**:部署侧(47.122 服务器 nginx + ICP 备案),代码侧无阻塞
- **质量门禁**:`pre-commit run --all-files` + `pytest tests/ -v` + `npm run check`
- **GitNexus**:`gitnexus_detect_changes()` 验证改动范围
- **seed 视频**:确认 ~13 个种子视频均 `ready` + `is_published`

---

## 执行顺序

**1 → 3 → 2 → 4 → 5 → 6**

- 1、3 用户感知最强(修 bug + 修续播),先做
- 2 工作量最大,放中间
- 4、5 后端为主,13 视频时效果有限但管道先建好
- 每阶段独立 commit,可随时停下验证

## 风险

- `finalize_video` 改动(阶段4)是管线关键节点,必须先 `gitnexus_impact` + 提交前 `gitnexus_detect_changes`
- `SubtitleEditor` 被 admin/creator 两处引用(阶段2),重设计保持兼容或同步改两处
- 评分权重经验值,无数据阶段无法回测,配置化已解决(无需改代码即可调参)
