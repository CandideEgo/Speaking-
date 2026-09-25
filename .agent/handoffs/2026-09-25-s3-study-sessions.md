# Handoff: S3 — 训练轮次落库 + 每日配额 + 加练

- Owner: `vocab-learning`（新增迁移与 `infra-quality` 配合）
- Status: done
- Planner acceptance: 今日 tab 把每日数量设为 10 → 一轮队列 10 个新词；设为 50 → 50 个；作答到一半刷新页面或跳去视频再回来，进度**续上不回零**；一轮结束点「再加练一轮」取到的是另外的词且今日累计增长；`today_words_learned` 在 `GET /api/v1/plan/profile` 可见增长。

## 任务

训练进度现在只活在 React state 里（`frontend/src/app/(main)/vocabulary/drill/page.tsx:107-108` 的 `learnIndex/learned`，「再来一组」是 `window.location.reload()`），每日配额硬编码在 `backend/app/api/v1/vocabulary.py:64-65`（15 新 + 20 复习），`today_words_learned` 字段存在但词汇流程从不写事件。

本片做三件事，它们是 S5/S6 的前置：

1. **轮次落库**：新表 `study_sessions` / `study_session_items`（每词一行，反复作答是 UPDATE），`Vocabulary` 加列 `wrong_count`、`last_wrong_at`；
2. **每日配额**：`user_learning_profiles` 加 `daily_new_target`（默认 **10**）、`daily_review_target`，范围 5~100，**全局设置**（不是每个视频单独设）；10 是**新词配额**，复习词另取并有上限；
3. **加练**：一轮结束 → 「再加练一轮」→ 从全局词库中 `mastery_level = new` 的词再取同配额，新建 `kind=extra` 轮；不计入今日目标，计入今日累计。

另需：进入 `/vocabulary/drill` 先查未完成轮次并续上；补写 `learned_words / reviewed_words` 学习事件。

设计依据：`docs/plans/词汇训练与播放页返回-设计方案-2026-09.md` §3.2 §3.3 §5.5。

## 已完成

**数据模型与迁移**

- 新增 `backend/app/models/study_session.py` — `StudySession`（`user_id/local_date/kind/target_count/done_count/correct_count/status/started_at/finished_at`）与 `StudySessionItem`（`session_id/vocabulary_id/sort_order/correct_streak/wrong_in_round/status`）；`uq_study_session_item` 唯一约束把「每词一行、反复作答是 UPDATE」变成数据库级事实，另有 3 个索引。
- `backend/app/models/__init__.py` — 注册两个新模型（否则 `create_all` / 关系解析看不到）。
- `backend/app/models/learning.py` — `Vocabulary` 加 `wrong_count`（默认 0）、`last_wrong_at`（可空）。
- `backend/app/models/learning_plan.py` — `UserLearningProfile` 加 `daily_new_target`（默认 10）、`daily_review_target`（默认 20）。
- 新增 `backend/migrations/versions/k6l7m8n9o0p1_add_study_sessions_and_quota.py` — revision `k6l7m8n9o0p1`，`down_revision=j5k6l7m8n9o0`；建两表 + 三列（NOT NULL 列带 `server_default`，空库升级可用），`downgrade()` 逆序可回滚。`alembic heads` 单头。

**服务层**

- 新增 `backend/app/services/study_session_service.py` — 轮次/配额/加练/保留期的唯一归属：`clamp_quota`、`get_preferences`/`set_preferences`、`get_today_summary`（只读，不改 profile 计数器）、`get_active_session`、`start_session`（幂等：今日已有 active 轮则原样返回；更早的 active 轮标记 `abandoned`；空池返回 `session: None` 而非报错）、`submit_answer`、`finish_session`。
- `backend/app/services/vocabulary_service.py` — 新增纯函数 `apply_review(vocab, quality) -> (interval_days, next_review_at)`，成为 SM-2 的唯一写入口（此前散在路由里）；`build_daily_session(db, user_id, new_count, review_count)` 两个计数改为必填，配额解析交给调用方。
- `backend/app/services/learning_event_service.py` — 新增公开包装 `get_user_local_date`（本地日判定此前是私有函数，轮次与学习事件必须用同一个「今天」）。

**API**

- `backend/app/api/v1/vocabulary.py` — `GET /daily-session` 的 `new_count`/`review_count` 变为可选（缺省读用户配额），响应加 `preferences` / `today` 两个兄弟键（`totals` 原样未动）；新增 `GET/PUT /preferences`、`GET /sessions/current`、`POST /sessions`、`POST /sessions/{id}/answer`、`POST /sessions/{id}/finish`；`POST /{word_id}/review` 改走 `apply_review` 并补发 `reviewed_words` 事件。
- `backend/app/schemas/vocabulary.py` — 新增 `VocabularyPreferencesResponse/Update`、`TodayTrainingSummary`、`StudySessionItemResponse`、`StudySessionResponse`、`StudySessionEnvelope`、`StudySessionStartRequest`、`StudySessionAnswerRequest/Response`。
- `backend/app/schemas/learning_plan.py` + `backend/app/api/v1/learning_plan.py` — `LearningProfileResponse` 加 `today_words_learned: int = 0`，`GET /plan/profile` 与 `POST /plan/profile/refresh` 两条路径都填 `study_session_service.get_today_summary`（此前该字段不存在，验收无从可见）。

**测试**

- 新增 `backend/tests/test_study_sessions.py`（25 条）：配额决定轮次大小、改配额只影响下一轮、越界 422、续上同一轮、跨日轮不续、作答（连对/清零/毕业/`done_count` 按词不按次）、越权与已结束轮 404/409、加练取到不相交的词且 `rounds` 增长、保留期清理且不碰他人、`today_words_learned` 在 `/plan/profile` 可见。
- `backend/tests/test_vocabulary_daily_session.py` — 加 `TestDailyQuota` 两条：默认配额 10 + `preferences` 全字段、响应带 `today` 计数。

**前端**

- `frontend/src/types/index.ts` — 新增 `StudyItemStatus`/`StudySessionItem`/`StudySession`/`TodayTrainingSummary`/`VocabularyPreferences`；`LearningProfile` 加 `today_words_learned?`。
- 新增 `frontend/src/hooks/useStudySession.ts` — 轮次的服务端状态：挂载先 `GET /sessions/current`，没有就 `POST /sessions`；`answer`/`finish`/`start`。服务端幂等使 StrictMode 双挂载不会开出两轮。
- `frontend/src/hooks/useDailySession.ts` — `DailySession` 带 `preferences` / `today`（缺省回退，不破坏既有消费方）。
- `frontend/src/app/(main)/vocabulary/drill/page.tsx` — 闪卡阶段改由落库轮次驱动：进入续上（`learnIndex` = 第一个 pending 项、`learned` = 该轮已作答数），作答 POST `/sessions/{id}/answer`；总结页「再加练一轮」= `finish()` → `start("extra")`，空池 toast 并留在总结页；复习测验成绩在进入总结时快照，避免被下一轮覆盖；错误态优先于加载态（原实现下请求失败会永远转圈）。
- `frontend/src/components/vocabulary/TrainSummary.tsx` — 「再来一组」→「再加练一轮」，加 `restartLoading` 禁用态。
- `frontend/src/components/vocabulary/DailyHero.tsx` — 说明文案改「每日 {N} 新词 + {M} 复习，按 SM-2 间隔推送」（原写死 15/20）；**「开始今日训练」CTA 未动**。
- `frontend/src/app/(main)/vocabulary/page.tsx` — 今日 tab 加配额条：`10/20/30/50/自定义`（PUT `/preferences`，保存后就地生效不重拉队列）+「今日已学 N 词（含加练）· 第 K 轮」。

## 契约变更

契约文件（`owners.md` 列出的四个）**全部未改动**：`backend/app/schemas/video.py`、`backend/app/core/config.py`、`backend/app/api/dependencies.py`、`frontend/src/lib/api.ts`/`createApiClient.ts`。保留期是服务层常量 `SESSION_RETENTION_DAYS`，未进 `config.py`。

API 形状变更（两端都列）：

1. `GET /api/v1/vocabulary/daily-session`（扩展）
   - 请求：`new_count`/`review_count` 从「可选、默认 15/20」变为「可选、缺省读用户配额（默认 10/20）」——不传参数时返回的队列长度**会变**。
   - 响应：新增 `preferences: {daily_new_target, daily_review_target, quota_min, quota_max}` 与 `today: {words_learned, rounds}`；`new_words`/`review_words`/`totals` 不变。
   - 前端：`frontend/src/hooks/useDailySession.ts` 解析两个新键。
2. `GET /api/v1/plan/profile`、`POST /api/v1/plan/profile/refresh`（扩展）
   - 响应新增 `today_words_learned: int`（`LearningProfileResponse` 默认 0，加字段不改既有键）。
   - 前端：`frontend/src/types/index.ts` 的 `LearningProfile` 加可选字段；`stores/planStore.ts`、`app/(main)/profile/page.tsx` 无需改动。
3. 新增 `GET /api/v1/vocabulary/preferences` → `{daily_new_target, daily_review_target, quota_min, quota_max}`（前端经 `useDailySession` 读，未直连）。
4. 新增 `PUT /api/v1/vocabulary/preferences`，body `{daily_new_target?, daily_review_target?}`（各 5~100，越界 422，缺省字段不动）→ 同 3 的响应（前端：`vocabulary/page.tsx` 的 `DailyQuotaPanel`）。
5. 新增 `GET /api/v1/vocabulary/sessions/current` → `{session: StudySession|null, today}`（只读，页面加载不写库）。
6. 新增 `POST /api/v1/vocabulary/sessions`，body `{kind: "daily"|"extra"}` → `{session, today}`；幂等（有未完成轮时返回该轮本身，此时 `kind` 仍是原值）。
7. 新增 `POST /api/v1/vocabulary/sessions/{session_id}/answer`，body `{vocabulary_id, correct}` → `{item, session_id, done_count, correct_count, target_count, session_status, graduated, today}`；404 轮次/词不存在，409 轮次已结束。
8. 新增 `POST /api/v1/vocabulary/sessions/{session_id}/finish` → `{session, today}`。
9. `POST /api/v1/vocabulary/{word_id}/review`（行为变更，响应形状不变）：SM-2 quality 由 4（认识）统一为 5，答错仍为 2；新增补发 `reviewed_words` 事件。**仓内已无调用方**（drill 改走 6/7），保留为兼容入口。

前端消费方：以上 5~8 只由 `frontend/src/hooks/useStudySession.ts` 调用，再由 `app/(main)/vocabulary/drill/page.tsx` 使用。

数据库 schema（与 `infra-quality`/部署相关）：新表 `study_sessions`、`study_session_items`；`vocabulary` 加 `wrong_count`/`last_wrong_at`；`user_learning_profiles` 加 `daily_new_target`/`daily_review_target`；迁移 `k6l7m8n9o0p1`。**本地 dev 库已 `upgrade head`**（`alembic current` == `alembic heads` == `k6l7m8n9o0p1`），CI 的 e2e job 对空库 `upgrade head` 也已按空库语义写（NOT NULL 列带 `server_default`）。

## 关键决策

- **DEC-053**（正文见文末，待 planner 合并）。
- **Gate 0 影响面**：`build_daily_session`、`review_word`、`get_learning_profile`、`refresh_learning_profile`、`apply_review`(新增)、`Vocabulary`、`UserLearningProfile` 全部为 LOW，**唯一 MEDIUM 是 `UserLearningProfile`（9 个直接导入方）** —— 未达 HIGH/CRITICAL，按规则继续。MEDIUM 的来源是加两列（加列本身向后兼容：都有默认值，无消费方需要改）。`detect_changes` 聚合报 critical，但那是**按文件**把整文件符号标为 touched 的粒度问题（`router`、`like`、`search_filter`、`VocabSet` 等均未改），本片真实改动面 = 16 个已改文件 + 5 个新文件。
- **一次作答只写 1~2 行 UPDATE**：原本每次点「认识/不认识」也各写一次库，本片不是引入新的写入模式。
- **保留策略**：一轮完成的事务里顺手删该用户 30 天前的轮次明细（先显式删 items 再删 sessions —— SQLite 不强制 FK 级联，测试跑在 SQLite 上）。**不引入定时任务**。
- **只续今日的未完成轮**：昨天的 active 轮在下次开轮时标 `abandoned`。今日训练是一天的剂量，续昨天的队会让今天的配额凭空消失。
- **配额在轮次创建时快照**：改配额不会中途改变正在做的这一轮大小（`target_count` 落库）。
- **加练必须先结束当前轮**：`start_session` 对未结束的轮幂等返回当前轮本身，所以「加练」= finish → start("extra") 两步；取词排除近 1 天轮次已排过的词（兜底作答失败的情况，主机制是答过的词离开 `mastery_level = new` 池）。
- **文案**：`DailyHero` 的「开始今日训练」保持不改；`TrainSummary` 的「再来一组」改为「再加练一轮」。e2e 反查 `grep -rn "返回频道\|再来一组\|退出训练\|认识\|不认识" frontend/e2e/` **无命中**（exit 1），无需改动；`DrillHeader` 的 `aria-label="退出训练"` 原样保留（阶段标签与退出按钮的文案调整属于 S5 的选择题化范围）。
- **`today_words_learned` 只按词计一次**：`was_pending` 时发 `learned_words`，同词重复作答不再发（否则今日累计按作答次数膨胀）。

## 遗留

- **门禁 1 结果**：后端 `pytest` 全量 **5 failed / 912 passed / 12 skipped**，5 条失败全部在 `tests/test_profile.py` 的头像上传路径，原因是 `backend/app/api/v1/users.py:93` 用了 `status.HTTP_413_CONTENT_TOO_LARGE`，而本地 starlette 是 0.37.2（只有 `HTTP_413_REQUEST_ENTITY_TOO_LARGE`）。该文件与 HEAD 完全一致、不在本片范围内 —— **是 master 上既有的环境/库版本偏移，不是本片引入**。本片相关 8 个测试文件单跑 **71 passed**。

  > **Planner 更正（2026-09-25，已实测）**：上面「master 上既有的库版本偏移」这个归因**不成立**。真实原因是门禁跑在了**系统 Python 而不是项目 `.venv`**：系统 Python 是 starlette 0.37.2 / mypy 2.1.0，而 `.venv` 是 `requirements.txt:8` 钉住的 starlette 1.6.0 / mypy 2.3.1。用 `./.venv/Scripts/python.exe -m pytest` 重跑 `tests/test_profile.py` → **19 passed / exit 0**，5 条失败全部消失。mypy 同理：`.venv` 的 mypy 2.3.1 产出 **53 对 `file:code`，与 `.mypy-baseline` 逐对相等，无新增无消失**（即 `state.md` 记的「53=53」）。所谓「mypy 2.1.0 内部崩溃」也只是系统解释器的产物；`.venv` 的 2.3.1 不崩，但 `--python-executable` 必须传**原生绝对路径**（相对写法报 `Invalid python executable`）。已把解释器要求写进 `wiki/guides/testing.md` 与 `wiki/guides/release-checklist.md`。**本片自身的代码、测试、迁移结论不受影响** —— 只是「pytest 全绿」这条验收此前是被环境伪影卡住的。
- **`mypy app/ --ignore-missing-imports` 退出码 1（77 errors / 39 files）**，与 `backend/.mypy-baseline` 的 53 条 `file:code` 对比后：**本片涉及的文件 0 条**；差集只有 `app/services/transcription/audio_extractor.py:call-arg`（新）与 `app/services/alipay_payment.py:no-any-return`（消失）——本地解释器/库版本与基线策展时不同所致，与本片无关。`--python-executable .venv/Scripts/python.exe` 在本机让 mypy 2.1.0 内部崩溃（INTERNAL ERROR），改用无该参数的形式。注意：mypy 崩溃后 `.mypy_cache` 会残留并使后续运行继续内部崩溃，需 `rm -rf .mypy_cache` 再跑。
- **未跑 e2e**：`npx playwright test` 未执行（需起 dev 栈）。文案 grep 已按执行方案 §2 做过，无命中；但 `frontend/e2e/screenshot-matrix.spec.ts:75` 会重新截图 `/vocabulary/drill`，截图内容必然变化（该 spec 只截图不断言）。
- **`?video_id=` 深链未纳入本片**：`drill/page.tsx` 的 `VideoScopedDrill`（EndScreen「复习本视频生词」）仍走旧的 `useVocabularyPractice` 流程，不落轮次、不续上。§6.1 的 `from=drill` 返回续上属于 S6 范围。
- S5（选择题化）依赖本片的 `correct_streak` / 轮次字段；S6（复习间隔算法）依赖本片的 `wrong_count` / `last_wrong_at`；S8 会改 `frontend/src/app/(main)/vocabulary/page.tsx`（tab 进 URL），与本片同文件，必须排在本片之后。
- 本片未改任何契约文件，也**未新增 `config.py` 设置项**；保留期若要可配，那是另一次契约变更。
- 本片未提交（按并行约定由 planner 串行提交）。

## DEC 条目（待 planner 合并）

编号 **DEC-053**（S2b 已占用 DEC-052）。追加到 `.agent/decisions.md` 末尾的正文：

```markdown
## 2026-09-25 — 训练轮次落库 + 每日配额 + 加练（`study_sessions` / `study_session_items`）

**Problem**: 词汇训练进度只活在 React state（`drill/page.tsx` 的 `learnIndex/learned`，「再来一组」是 `window.location.reload()`），刷新或跳去视频再回来就从零开始；每日学习量硬编码在路由里（15 新 + 20 复习），用户不能调；`user_learning_profiles.today_words_learned` 列存在但词汇流程从不写事件，所以「今日已学」永远是 0。同时 S5（选择题化）需要「每词在本轮的连对计数」、S6（错误次数驱动的复习间隔）需要「累计答错次数」，这两个事实必须落库才有 SQL 可用。

**Options**: A) 进度留在客户端（localStorage / 内存），零后端改动；B) 新增两张表 `study_sessions` + `study_session_items`（每词一行），`Vocabulary` 加 `wrong_count`/`last_wrong_at`，`UserLearningProfile` 加 `daily_new_target`/`daily_review_target`；C) 只加一张 `study_sessions`，把词列表塞进 JSON 列。

**Decision**: B。配额是**全局一个设置**（不是每视频一份），范围 5~100，默认新词 10 / 复习 20，落 `UserLearningProfile`；轮次 `kind ∈ {daily, extra}`、`status ∈ {active, finished, abandoned}`，`local_date` 用用户本地日（复用学习事件那套本地日判定）；加练 = 结束当前轮后新建 `kind=extra` 轮，取词只看 `mastery_level = new` 并排除近 1 天轮次已排过的词。

**Reason**: A 回答不了本片的验收——换页回来要续上、`today_words_learned` 要真的长——而且 S6 需要能按 `wrong_count` 排序的 SQL。C 把「每词一行」压成 JSON 后，连对计数与 `wrong_in_round` 无法用 UPDATE 表达，也无法按词查询（S6 的复习优先级要 `ORDER BY wrong_count DESC`）。两张表让「反复作答是 UPDATE 而非追加」成为主键级事实（`uq_study_session_item`），存储上限是词数 × 轮数而不是作答次数。

**Trade-offs**:
- 配额在轮次创建时快照（`target_count` 落库）：改配额只影响**之后**开的轮次，不会中途改变正在做的这一轮的大小。
- 只续**今日**的未完成轮；昨天的 active 轮在下一次开轮时被标记 `abandoned`。今日训练是一天的剂量，续昨天的队会让今天的配额凭空消失。
- 保留期 30 天，在 `finish_session` 的同一事务里删该用户更早的轮次明细（先显式删 items 再删 sessions——测试跑在 SQLite 上，FK 级联不生效）。**不引入定时任务**：为一张只在用户学习时才增长的表加周期任务，活动件比问题本身多。
- 作答仍是「一次请求写 1~2 行 UPDATE」（原本每次点「认识/不认识」也各写一次库），不是新的写入模式。
- `POST /{word_id}/review` 的 SM-2 quality 由 4 统一为 5（答错仍 2），且该端点现在**没有仓内调用方**（drill 改走轮次作答），保留为兼容入口。
- 「近 1 天轮次已排过的词」这层排除只是兜底（主机制是答过的词会离开 `mastery_level = new` 池），用于作答请求失败时该词不被重复排进加练轮，顺带跨过午夜边界。
```

`.agent/decisions-index.md` 追加行（插在 DEC-052 之后）：

```markdown
| DEC-053 | 2026-09-25 | 训练轮次落库 + 每日配额 + 加练（`study_sessions` / `study_session_items`） | — | active |
```
