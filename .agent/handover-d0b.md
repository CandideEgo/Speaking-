# D0b 交接文档 — 过期代码清理

> 日期：2026-08-27（2026-08-27 补跑完成）
> 任务：D0b 代码层清理（配合 D0b PRD 精简方案）
> 状态：**全部完成，后端全量测试 579 passed / 6 skipped / 0 failed**

---

## 一、已完成的工作

### 1. 后端删除（17 个文件）

| 文件 | 说明 |
|------|------|
| `app/api/v1/ai.py` | AI 助手端点（词卡上下文释义、每日总结、推荐） |
| `app/api/v1/comments.py` | 评论端点 |
| `app/services/ai_plan_service.py` | AI 学习计划生成服务 |
| `app/services/comment_service.py` | 评论服务 |
| `app/services/learning_plan_service.py` | 学习计划服务（每日计划生成、进度、历史） |
| `app/services/proposal_service.py` | UGC 字幕提案服务 |
| `app/services/upload_service.py` | 用户视频上传服务 |
| `app/tasks/comment_analysis.py` | 评论情感分析 Celery 任务 |
| `app/tasks/plan_tasks.py` | 学习计划 Celery 任务 |
| `tests/test_ai_plan_api.py` | AI 计划 API 测试 |
| `tests/test_ai_rubrics.py` | AI 评分标准测试 |
| `tests/test_browse_comments.py` | 评论浏览测试 |
| `tests/test_comment_scoring.py` | 评论打分测试 |
| `tests/test_proposal_propagation.py` | 提案传播测试 |
| `tests/test_shadowing_plan.py` | 跟读计划测试 |
| `tests/test_standard_fork.py` | 标准 Fork 测试 |
| `tests/test_ugc_review.py` | UGC 审核测试 |

### 2. 后端修改（8 个文件）

| 文件 | 改动 |
|------|------|
| `app/main.py` | 移除 `ai` 和 `comments` 路由注册 |
| `app/api/v1/words.py` | 删除词卡实时 AI fallback（`get_ai_service` 导入和调用）；AI 注释仅从 `word_ai_notes` 表读取管线预热数据，cache miss 返回 null |
| `app/api/v1/videos.py` | 删除全部 UGC 端点：POST /videos（用户提交）、POST /videos/upload、POST /videos/fork、POST /videos/propose、POST /videos/begin-edit、POST /videos/submit-review、POST /videos/withdraw、GET /videos/mergeable-updates、POST /videos/user-seed、POST /videos/user-seed-full；清理相关 imports 和 helper 函数；保留 admin 路由、seed、like |
| `app/api/v1/learning_plan.py` | 5 个端点返回 410 Gone：POST /plan/generate/ai、GET /plan/today、POST /plan/items/{id}/complete、GET /plan/progress、GET /plan/history；保留 GET /plan/profile、POST /plan/profile/refresh、GET /plan/milestones、GET /plan/mastery-trend |
| `app/services/ai_service.py` | 删除 5 个死方法：`word_context_meaning`、`assistant_daily_speaking_summary`、`assistant_recommend_content`、`build_ai_plan`、`gloss_word_context`；保留管线用的 `translate_subtitles`、`generate_title`、`generate_word_notes`、`generate_quiz`、`generate_lesson_plan` |
| `app/tasks/celery_app.py` | 更新注释（移除 comment_analysis、plan_tasks 引用） |
| `tests/test_exam_corpus.py` | 移除 2 处 `get_ai_service` mock |
| `tests/test_words_gloss.py` | 重写：移除 AI mock，测试纯 ECDICT + 预热笔记行为 |
| `tests/test_word_notes.py` | 删除 `test_gloss_writes_global_note_on_first_live_call`（测的是已删的实时 AI 回写）；简化预热笔记测试 |
| `tests/test_media_access.py` | 删除 3 个 upload 端点测试 |
| `tests/test_pending_processing.py` | 删除 submit_video / user-seed / user-seed-full 相关测试（4 个），保留 admin seed 和 start-processing 测试 |
| `tests/test_subtitle_revisions.py` | 删除 `TestOwnerHistoryEndpoints` 类（2 个测试，测的是已删的用户字幕编辑端点） |
| `tests/test_videos.py` | 补跑中发现并修复：删除 `TestSubmitVideo`（3 个）和 `TestListVideos`（2 个）测试类，测的是已删的用户提交/列表端点 `POST/GET /api/v1/videos`；保留 public/seed/admin/publish gate/delete/localize 测试 |
| `app/api/dependencies.py` | 清理 4 个 UGC 死函数（确认无任何调用方）：`check_video_access`、`is_video_owner`（pass-through）、`require_video_owner`、`require_video_access`；同步移除 `Video` 导入 |
| `app/services/video_access.py` | 更新模块 docstring（移除对已删依赖函数的引用） |

### 3. 前端删除（8 个文件 + 3 个空目录）

| 文件 | 说明 |
|------|------|
| `src/components/home/FocusCard.tsx` | 首页今日计划卡片 |
| `src/components/plan/PlanItemCard.tsx` | 计划项卡片 |
| `src/components/plan/DailyProgressCard.tsx` | 每日进度卡片（无引用） |
| `src/components/plan/WeeklyCycleCounter.tsx` | 周循环计数器（无引用） |
| `src/components/plan/MasteryBreakdown.tsx` | 掌握度分解（无引用） |
| `src/components/video/ForkBadge.tsx` | Fork 徽标 |
| `src/app/(main)/my-videos/` | 空目录（含空 [id] 子目录） |
| `src/app/(main)/upgrade/` | 空目录 |
| `src/components/plan/` | 删除后清空的目录 |
| `src/components/home/` | 删除后清空的目录 |

### 4. 前端修改（6 个文件）

| 文件 | 改动 |
|------|------|
| `src/stores/planStore.ts` | 精简为只保留 `profile` 状态 + `fetchProfile` / `refreshProfile` / `reset`；删除 todayPlan、completeItem、generateAIPlan、refreshProgress |
| `src/hooks/usePlan.ts` | 精简为只返回 `profile` / `profileLoading` / `fetchProfile` |
| `src/app/(main)/page.tsx` | 移除 FocusCard 导入和使用、移除 plan/progress/generateAIPlan/generating；保留 profile（用于 milestone banner） |
| `src/app/(main)/watch/[id]/page.tsx` | 移除 ForkBadge 导入和 forked_from 显示 |
| `src/app/(admin)/admin/(shell)/videos/VideoManager.tsx` | 移除 ForkBadge 导入和显示 |
| `src/app/(main)/pricing/page.tsx` | 替换为 `redirect("/upgrade")` |

---

## 二、验证状态

| 验证项 | 结果 |
|--------|------|
| 后端 `app.main` 导入 | ✅ 通过（venv Python） |
| 前端 `tsc --noEmit` | ✅ 0 错误 |
| 前端 `eslint src/` | ✅ 0 errors（15 warnings，均为预存） |
| 后端 pytest（修复前） | 1 failed（test_exam_corpus AI mock），119 passed，6 skipped |
| 后端 pytest（最终全量） | ✅ **579 passed, 6 skipped, 0 failed**（160s；skipped 为 Postgres 集成测试，Docker 未启动时自动跳过，与基线一致） |
| `app.main` + `app.api.dependencies` 导入（清理后复检） | ✅ 通过 |
| ruff check（本次改动文件） | ✅ All checks passed |

### 补跑记录

首次补跑发现 5 failed，全部位于 `tests/test_videos.py`，测的是 D0b 已删的 `POST/GET /api/v1/videos` 用户端点（交接时遗漏的测试文件）。按 `test_pending_processing.py` 同款模式删除 2 个过时测试类后重跑全绿。
补跑日志：`backend/tmp/pytest-rerun-d0b.log`

---

## 三、未完成 / 需注意的事项

### 1. ~~后端测试需补跑~~ ✅ 已补跑完成（2026-08-27）
补跑发现 `tests/test_videos.py` 遗漏清理，已修复，最终 0 failures。

### 2. 以下属于其他任务范围，本次未动

| 项目 | 归属任务 | 说明 |
|------|----------|------|
| `(landing)` 路由组 + `src/components/landing/` 11 个组件 | D0（访问控制） | landing 页不引用已删 API，D0 删除 landing 时一并清理 |
| `src/app/upgrade/page.tsx`（在 `src/app/upgrade/`，非 `(main)` 组） | D2a（支付页） | 升级页已存在，D2a 会重写 |
| `src/types/index.ts` 中的 `TodayPlanResponse`、`DailyProgress`、`LearningPlanItem` 类型 | — | 休眠类型，无任何代码导入，不影响构建；可在后续清理中删除 |
| `Video` 模型中的 `forked_from`、`auto_publish`、`review_status` 等 UGC 字段 | D0b spec 明确保留 | 旧数据可能仍有值，不删列 |
| `word_ai_notes` 表和管线 AI 注释生成 | 保留 | PRD 明确：视频管线的 AI 注释不能删 |
| 学习计划 profile/milestones/mastery-trend | 保留 | 首页 streak、Profile 统计仍在用 |

### 3. 潜在的后续清理点（非阻塞）

- ~~`backend/app/api/dependencies.py` 中可能有 UGC 相关的依赖函数~~ ✅ 已检查并清理：4 个函数均无调用方，已删除（本次补跑时完成）。
- `backend/app/models/` 中 Proposal/Comment 等模型文件未删除（spec 未要求删模型，仅删路由和服务）。如果数据库中这些表也要清理，需另起迁移任务。
- 前端 `src/components/landing/` 下有 11 个营销组件，D0 删除 landing 页时记得一起删。

### 4. Git 状态

- 所有改动均未提交（working tree 变更）
- `.agent/state.md` 有预存修改（非本次改动）
- `docs/requirements/REQUIREMENTS.md` 有预存修改（非本次改动）
- `docs/plans/产品设计规划-2026-08.md` 是之前生成的产品规划文档（untracked）

---

## 四、D0b 清理范围对照（PRD → 实际）

| PRD 要求 | 状态 |
|----------|------|
| 删 ai.py + ai_plan_service + comment_service + learning_plan_service + proposal_service + upload_service | ✅ |
| 删 tasks/comment_analysis.py + tasks/plan_tasks.py | ✅ |
| 删 8 个测试文件 | ✅ |
| main.py 注销 ai/comments 路由 | ✅ |
| 砍词卡实时 AI fallback | ✅ |
| videos.py 删除 UGC 端点，保留 admin 路由/seed/like | ✅ |
| learning_plan.py 5 端点返 410，保留 profile/milestones/trend | ✅ |
| ai_service.py 删 5 方法，保留管线方法 | ✅ |
| 前端删 PlanItemCard/ForkBadge/landing 组件 | ✅（landing 留给 D0） |
| planStore 精简 | ✅ |
| /pricing → /upgrade 重定向 | ✅ |
| 删空目录 my-videos/upgrade | ✅ |
