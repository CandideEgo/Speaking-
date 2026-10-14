---
slice: S02
title: 前端测试载体
status: ready
issue: null
depends_on: []
evidence: null
---

# S02 — 前端测试载体

> 状态：ready
> Issue：TBD
> Owner：待认领
> 依赖：无（本机可做）
> 上下文预算：T0 + 总纲 §1–§4 + 本切片 + `frontend/vitest.config.ts` / `package.json`

## 1. 这一段要解决什么

- 问题：方案要求前端组件级验收，但当前 Vitest 是 `environment: node`，没有 RTL/jsdom，
  onboarding gate、跳过提示、导航 IA、进度语义、词卡几何、自动前进持久化没有明确测试载体。
- 可观察结果：在「补组件测试依赖」与「全部交给带服务 e2e」之间做出唯一选择，并把六类行为
  映射到具体测试文件或 e2e 规格。
- 不做什么：不新增第二个测试框架；不为了测试改业务行为；不在本切片里补服务依赖验收。

## 2. 边界与契约

- 涉及对象：`frontend/vitest.config.ts`、`frontend/package.json`、新增前端测试依赖或 e2e specs。
- 会改的契约：如果新增 RTL/jsdom，更新前端测试命令和 CI 口径；如果走 e2e，更新 e2e 覆盖矩阵。
- 开工前必须拍板：
  - 组件级测试是否值得引入 RTL/jsdom 依赖；
  - e2e 是否能在没有真实媒体的环境里覆盖对应行为；
  - 测试载体是否纳入现有 `npm run check` / CI 门禁。

## 3. 执行路径

1. 为六类行为列出当前覆盖和缺口：onboarding gate、跳过代价提示、导航 IA 与高亮、
   done/total 进度、词卡几何、自动前进持久化。
2. 比较两条路线：
   - A：补 `@testing-library/react` + jsdom，新增 Vitest 组件测试；
   - B：保持 node 单测，把六类行为全部映射到 Playwright e2e。
3. 选择路线并写出明确理由、成本和未覆盖风险。
4. 落地测试或 e2e 规格；把命令、结果和 flaky/ skip 条件写回本切片。
5. 如果引入新依赖，确认锁文件、CI 命令和本地无 npm 的现状都被处理。

## 4. 验收与证据

- 机械验收：`tsc --noEmit`、eslint、prettier、vitest 或 Playwright 命令按所选路线通过。
- 行为验收：六类行为逐一能在测试名、e2e spec 或明确的「本轮不覆盖+原因」里找到对应。
- 证据位置：本文件 §5；命令结果只留摘要，不贴长日志。
- 回退方式：如果新增依赖不可接受，撤销依赖与配置改动，切换到 e2e 路线。

## 5. 结果记录

- 实际结果：待执行。
- 证据：待补。
- 决策：测试载体选择需要一条新决策记录；若只是沿用既有 e2e，不写决策。
- 新发现 / 后续切片：待补。
