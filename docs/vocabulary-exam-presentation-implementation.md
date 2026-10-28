# 词汇与真题呈现改版实施记录

## 已实现

- 词汇首页按实际可训练队列呈现本轮任务、复习与新词分组；开始按钮直接进入训练，保留普通训练深链接的预览入口。配额更新会重新读取队列，已开始轮次不扩容。统计、队列失败均提供重试，不显示为空词库或完成态。
- 真题目录使用服务端年份、完成状态筛选和每页 12 套分页；筛选保存在 URL，作答、结果、重做链接携带返回目录地址。已完成卷直达最近一次结果，PDF 按需展开并筛选。
- 作答按文章题组组织，内容区满足宽 900px、剩余高 560px 时使用约 6:4 双栏，否则切换原文与题目。答案、题号与阅读位置保存在当前页面，手机底部可直接切换阅读视图。
- 答题卡支持当前、已答、未答状态及关闭后的焦点恢复。提交失败保留答案；结果优先展示错题，复用原有错题重做流程，全文按需展开。

## 接口增量

`GET /api/v1/vocabulary/daily-session` 保留原字段，增加：

```ts
training_preview: {
  active_session_id: string | null;
  new_words: VocabularyWord[];
  review_words: VocabularyWord[];
}
```

预览不创建训练轮次。有今日轮次时取未毕业词，否则复用新轮次的取词、近期排除规则；复习预览排除当前轮次的词。词汇首页与训练入口消费该预览；累计到期取 `totals.due_total`。

`GET /api/v1/exams` 新增 `year`、`status=all|unsubmitted|submitted` 查询。状态仅依据当前账号的已提交记录；响应增加 `available_years`，仅按科目限定，不受分页和完成状态筛选影响。

列表条目新增 `last_session_id`、`last_correct_count`、`last_question_count`。最近提交按提交时间及 ID 倒序选择，正确题数按判题记录聚合，分母取历史会话题量。

无数据库迁移。前后端一起发布时先更新后端，再更新消费新增字段的前端。

## 验证方式与边界

后端契约与回归使用隔离的 SQLite 和 fake Redis。浏览器回归使用本地 Next 实例及模拟 API，覆盖提交、重试、错题回顾、目录状态和词汇入口；长文取自仓库本地真题资料，摘录固定在 `frontend/e2e/fixtures/exam-reading.json`，不依赖未入库数据。

浏览器验收使用独立临时源码副本，避免现有本地 Next 服务的编译子进程错误；没有操作生产账号或数据库。连接真实后端及数据库的 `e2e/exam.spec.ts` 已适配逐组作答，本轮未执行该联调用例，因为本地后端服务未启动。

本次没有增加真题草稿保存、跨路由或刷新恢复、计时、高亮笔记、证据句定位或真题收词。

## 验收结果

- 后端 pytest：64 项通过，覆盖每日队列、训练轮次、真题 API 和新增呈现契约。
- 前端 Vitest：34 项通过，覆盖题组与选项解析、试卷标题、来源呈现和原有训练调度。
- Playwright：Chromium、Firefox、Android Chrome、iPhone WebKit 共 20 项通过；包含真实真题长文、375px、桌面短视口、暗色、放大字号、滚动恢复、选项无遮挡、提交失败重试和错题重做。
- 前端设计系统门、会话写入门、TypeScript、全量 ESLint、全量 Prettier 检查均通过。本会话 PATH 没有 npm 命令，因此逐项调用与 `npm run check` 相同的 Node 入口执行。
- 后端 Ruff 检查通过；mypy 未新增超出现有基线的错误，未修改检查器或基线。
- 隔离副本的 Next.js 生产构建通过，包含静态目录、重做页与动态作答、结果路由。

执行入口：

```text
backend: .venv/Scripts/python.exe -m pytest tests/test_presentation_contracts.py tests/test_vocabulary_daily_session.py tests/test_study_sessions.py tests/test_exams_api.py -q
frontend: node node_modules/vitest/vitest.mjs run src/lib/examPresentation.test.ts src/lib/drillRound.test.ts src/lib/drillQuestions.test.ts src/lib/vocabularyPresentation.test.ts
frontend: node node_modules/playwright/cli.js test e2e/vocabulary-exam-presentation.mobile.spec.ts --project=chromium --project=firefox --project=mobile-chrome --project=mobile-iphone --workers=1 --retries=0 --reporter=line
```

Playwright 使用 `CI=1` 关闭自动启动原有服务，`PLAYWRIGHT_BASE_URL` 指向隔离的本地验收实例。临时实例已在构建检查前停止；没有重启原有 3000 端口服务。
