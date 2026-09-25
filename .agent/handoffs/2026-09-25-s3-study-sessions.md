# Handoff: S3 — 训练轮次落库 + 每日配额 + 加练

- Owner: `vocab-learning`（新增迁移与 `infra-quality` 配合）
- Status: dispatched
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

<!-- 由执行 agent 填写 -->

## 契约变更

<!-- 逐条列：新增端点的请求/响应体、core/config.py 若新增保留期设置项（那就**是**契约变更，必须写两端）；无则写"无"。 -->

## 关键决策

- **一次作答只写 1~2 行 UPDATE**：现有代码本来就每答一题写一次库（`drill/page.tsx:164` 每次点「认识/不认识」都 POST review），本片不是引入新的写入模式 —— 这是 PO 批准「进度存服务器」的前提，不要写成新架构。
- 保留策略：一轮完成的事务里顺手删该用户 30 天前的轮次明细（把存储占用封顶）。**不要**引入定时任务。
- 新表返回体若落到共享类型，按 `owners.md` 记契约变更（`frontend/src/lib/api.ts` 是契约文件）。
- 用户侧文案：`DailyHero` 的「开始今日训练」**保持不改**；`TrainSummary` 的「再来一组」改为「**再加练一轮**」。
- 开工前对 `build_daily_session`、`review` 端点跑 `gitnexus_impact`；本片必然改动多个 service，收工前需 `/knowledge-maintain`。
- 必须有 DEC 条目（新增两张表 + 加列属数据模型决策）。

## 遗留

- S5（选择题化）依赖本片的 `correct_streak` / 轮次字段；
- S6（复习间隔算法）依赖本片的 `wrong_count` / `last_wrong_at`；
- S8 会改 `frontend/src/app/(main)/vocabulary/page.tsx`（tab 进 URL），与本片同文件，必须排在本片之后。
