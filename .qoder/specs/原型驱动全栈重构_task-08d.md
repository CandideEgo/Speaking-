# 原型驱动全栈重构计划（合并后修订版）

## 合并后审查结论

**已完成**（分支 frontend-refactor-2026-07，merge `546f481`）：
- 导航 shell：Sidebar 已删，TopBar 水平导航（logo + 首页/发现/练习专题/词汇本/学习记录）+ MobileTabBar 5 项
- 首页视频流（FocusCard + 筛选 + VideoCard 网格），`/practice`、`/practice/exam`、`/practice/paper/[videoId]`、`/vocabulary/drill` 路由已建
- 新组件：`PaperRunner`(531行)、`EmbeddedPaper`、`CodeInput`、`LegalLayout`、`QualityReportPanel`
- `/vocabulary/drill` 已接真 API（`useVocabularyPractice`）；redeem 分格输入、terms/privacy LegalLayout、admin 质量门禁均已完成
- watch 页已按原型 05 重做为内嵌试卷区版本（834 行改动）

**核心剩余问题**：
1. 练习系统全是静态数据：`data/practicePaper.ts` 的 `SAMPLE_PAPER` / `SAMPLE_WRONGS` / `SAMPLE_REAL_PAPERS` 驱动着 practice hub / exam / paper 三个页面；`practice/page.tsx` 还有硬编码 `counts`/`prog` 数组；后端无任何考试判分能力
2. watch 页以分支为准覆盖了 POST-FRONTEND-2026-08 播放页改版（snap 双屏等），有回归风险，回滚锚点 `66c4d58`
3. 工作区有 33 个未提交变更（docs/plans 清理 + .agent/wiki 更新 + DEV-LOG），需先单独提交
4. 视觉收尾缺口：login/forgot-password 未对齐原型分栏布局（分支 diff 中仅 register 改动）；profile 4 tab 结构已就位但视觉未对齐原型 07

---

## Phase A — 基线清理与回归验证（0.5-1 天）

- 单独提交工作区的文档清理变更（docs/plans 删除、.agent/wiki 修改、DEV-LOG），与功能代码隔离
- watch 页回归验证清单（合并覆盖了 snap 改版）：
  - 内嵌试卷区（EmbeddedPaper）与播放器布局无溢出、移动端无横向滚动
  - 字幕列表独立滚动、词卡 WordTooltipInline 展开/收起位置
  - 移动端 sticky mini-player（useStickyPip）是否仍生效
  - Playwright 截图对比，异常则从锚点 `66c4d58` 局部找回旧实现
- `npx tsc --noEmit` + `npm run build` 确认合并基线绿码

## Phase B — 练习系统后端（3-4 天，最大增量）

新模型（Alembic 迁移，upgrade/downgrade 可逆）：
- `exam_sessions`：user_id / mode（daily_check | video_exam | wrong_redo）/ exam_level / video_id? / started_at / submitted_at / score / part_scores JSON
- `exam_answers`：session_id / question 快照 JSON / user_answer / correct —— 错题本 = `correct=false` 且未重做通过的派生查询，不另建表
- 视频试卷进度：从 exam_answers 按 video_id 聚合派生

新服务 `exam_service.py`：
- 出卷：每日检测按用户 `target_exam_level` 跨视频抽题（复用 `practice_service` 题型生成逻辑）；视频试卷 = 该视频 `UnifiedPracticeSet`
- 提交判分：服务端判分 → 写 session + answers → 更新 SM-2（复用 `submit_practice_results`）→ 发射 LearningEvent `practiced_items`（非阻塞 try/except）
- 错题重做通过即销账

新 API（`backend/app/api/v1/exam.py`）：
- `GET /practice/hub`：本月完成份数 / 平均正确率 / 上次检测成绩 / 本周次数 / 错题数 / 视频试卷卡列表（真实题数 + 进度）
- `POST /exam/start`（mode + level/video_id → session + 题目）
- `POST /exam/{session_id}/submit`（判分 + 得分 + 分项）
- `GET /practice/wrong` + `POST /practice/wrong/redo`
- `GET /videos/{id}/paper`（试卷专栏题目集；即时模式判对错提交复用现有 `POST /videos/practice/submit`）

测试：新服务/端点全覆盖 + 全量 pytest 回归

## Phase C — 练习前端接真数据（2-3 天）

- 新增 `stores/examStore.ts`（会话/计时/答案暂存）与 `lib/examData.ts` API 客户端函数
- `practice/page.tsx`：删 `SAMPLE_WRONGS` / `SAMPLE_REAL_PAPERS` / 硬编码 `counts`/`prog`，接 `GET /practice/hub`；真题区保留静态"即将上线"占位（原型本意）
- `practice/exam/page.tsx`：`SAMPLE_PAPER` 换 `POST /exam/start` + 30:00 倒计时提交 `POST /exam/{id}/submit` + 得分环/分项展示真实判分结果 + "再练错题"入口
- `practice/paper/[videoId]/page.tsx`：`SAMPLE_PAPER` 换 `GET /videos/{id}/paper`，即时判对错后回写掌握度
- `PaperRunner` 组件增加双模式支持（exam 提交判分模式 / paper 即时模式）若尚未区分
- 删 `data/practicePaper.ts` 中已无引用的样例数据

## Phase D — 视觉收尾（1 天）

- `app/login/page.tsx` + `app/forgot-password/page.tsx`：对齐原型 01/15 分栏布局（复用 register 已用模式 + `AuthCard`/`CodeInput`）
- `app/(main)/profile/page.tsx` 4 tab 视觉对齐原型 07（数据层不动）

## Phase E — QA 与收尾（1 天）

- 门禁：`npx tsc --noEmit` / `npm run build` / `ruff check` / `pytest tests/` / `pre-commit run --all-files` 全绿
- Playwright 截图矩阵更新（新增 practice/exam/paper/drill 页）；补 E2E：考试模式提交判分、错题重做、试卷专栏即时判分
- `gitnexus_detect_changes()` 验证影响范围；更新 `.agent/state.md` 与 `docs/plans/Frontend-refactor` 进度标记

---

## 执行原则

- 后端先行：Phase B 完成前 Phase C 页面保持现有静态态，不引入新的 mock 层
- 每阶段独立 commit；编辑符号前按 AGENTS.md 跑 `gitnexus_impact`
- watch 页只验证不重改，除非回归确认（教训：勿重写 flex 高度链）
- 禁止重新引入已砍功能（AI 口语评分/跟读/社区 UGC）；结账保持"不支持在线支付"（ICP）
- LearningEvent 发射非阻塞，不破坏现有 practice/vocabulary 服务流

## 工作量估计

约 6.5-9 个工作日（合并前估计 17-23 天，视觉重构部分已由分支完成）
