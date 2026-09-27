---
title: 组合型静默失效的两个模式（状态跃迁把实体挤出所有队列 / 逐条写入超过端点限流预算）
tags: [backend, frontend, bug, anti-pattern]
status: active
confidence: verified
related_code: [backend-services, frontend-app, api-v1]
related: [wiki/problems/review-fix-failure-modes.md, wiki/problems/shared-row-locks-and-nested-commits.md, .agent/decisions.md]
created: 2026-09-27
updated: 2026-09-27
---

# 组合型静默失效的两个模式

共同点——**每层局部规则各自成立、各自有测试覆盖，复合之后无声丢数据**：没有任何报错，
每个组件单独看都对。两个都在 2026-09 的 OCR review 修复轮被发现（一个是外部审查抓到、
一个靠核对限流装饰器），且都是设计意图（docstring/DEC）与组合行为相反的「反向实现」。

## 1. 计数驱动的状态跃迁 + 派生态排除 = 实体从所有队列无声消失

**Problem**: `apply_review`（DEC-057 复习线）里 `review_count` 答对答错都递增，
`mastery_level` 纯按次数定档（≥6 → mastered）；而所有训练队列都排除 mastered。
于是在毕业线（count=5）上答错一次：mastered 生效，刚排好的「次日复习」永远轮不到，
词从全部队列消失——无报错、无日志，用户只觉得词变少了。

**Cause**: 两个局部不变量各自正确（「错误次数驱动分档」是 DEC-057 的本意；
「mastered 不进队列」是毕业语义），但没有**可达性不变量**把它们接起来：
任何状态跃迁都必须保证实体仍落在至少一个可达集合里。`_mastery_from_review_count`
是纯函数、单测齐全，单测只断言分档映射，永远测不出复合后的消失。

**Solution**: 答错时把 mastery 封顶在 reviewing（`vocabulary_service.apply_review`），
毕业只允许发生在答对路径；docstring 写明这条约束，边界（count=5 答错/答对）各钉一条
行为测试。SM-2 冻结路径核实后无此问题（答错本来就重置回 new），只补行为测试不改动。

**Future Prevention**:
- 给「派生态由计数推导」的规则写代码时，先问：**每个可能的跃迁之后，实体在哪个集合里？**
  答不出「还在某个可达队列」就不要合。
- 纯函数的单测证明不了系统性质；跃迁边界要有一条穿过 service 层的行为测试。
- 文档句子与实现相反（docstring 说「wrong review must land the word back in the
  review queue」）是最强的 bug 信号——外部审查正是靠这个矛盾定位的。改行为时把
  docstring 一起改，矛盾句留着必出事。

## 2. 客户端逐条写入 × 服务端限流预算 = 聚合超限后的静默丢进度

**Problem**: drill 页到期复习词从批量提交改成逐题各发一次
`POST /vocabulary/practice/submit`，该端点限流 10/min；今日目标 20 词、键盘快速作答
每题 2–5 秒，一分钟内必 429。失败路径只有 toast，`next_review_at` 与错误分档都不落库，
这些词保持到期——复习线在用户最活跃时静默失效。

**Cause**: 限流是**按聚合预算**定义的（次/分钟），而调用方按**单次操作**组织请求；
两边没有对过账。旧批量路径合理（1 次请求），S5 改造时按「每题独立写入口」重构，
没有检查端点预算；testing 环境 limiter 是 noop，e2e 也永远撞不到 429。

**Solution**: 前端缓冲 ref + 阈值 5 攒批（20 词 ≤ 4 次 POST），队列排空进总结、
加练前 refresh、卸载三处兜底 flush；失败整批一次 toast。刷新窗口内未 flush 的批次
会重现，属已知小窗口，写入页面文档字符串。

**Future Prevention**:
- 新增任何逐条调用带 `@rate_limit` 端点的循环前，先算：**最高操作频率 × 单位时间
  请求数 vs 限流预算**。限流预算是接口契约的一部分，改调用模式要对账。
- 攒批方案的三个必备位：阈值 flush（防超限）、阶段收尾 flush（防延迟落库）、
  卸载 flush（防丢失）；有「重取到期集合」语义的（如加练 refresh），flush 必须排在
  重取之前。
- e2e 环境 limiter noop = 限流类缺陷对集成测试天然不可见，只能靠上面的对账习惯兜底。
