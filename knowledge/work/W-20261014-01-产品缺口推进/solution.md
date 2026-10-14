---
phase: solution
status: review
revision: 1
approved_by: null
approved_at: null
approval_ref: null
---

# Solution — 用真实验收和显式决策收口

> WorkItem：`W-20261014-01`

## 选定方案

保留已经落地的 P0/P1 功能，不重做产品实现。把剩余工作按「真实服务验收、前端验收载体、对象
认知回填、延后产品决策、发布后兼容清理」五个结果面拆开；每一面单独认领、单独验收、单独留证。

Spec Flow 只承载总纲、阶段产物和证据，不接管 Issue 的认领或依赖。GitHub 的父 Issue 对应本
WorkItem，子 Issue 对应切片；原生 `blocked_by` 决定当前前沿。

## 接口与契约

- 已落地业务接口不再因本 WorkItem 改动；验收发现的契约问题另开切片。
- WorkItem 根状态和切片状态写入 frontmatter，`README.md` 保存人类可读快照。
- 方案和计划各有一次人工确认；上游实质变更使下游审批失效，不继承旧 consent。
- 服务环境不可用时只能记录阻塞，不能把 SQLite、fake Redis 或静态检查写成真实环境通过。

## 备选方案

- 继续保留一份长计划：上下文成本仍集中在单文件，无法稳定回答当前切片。
- 只用 GitHub Issues：Issue 保存执行事实，但不适合承载产品意图、效果指标和多层验收证据。
- 重建本地队列：会引入第二个 lock、第二套 frontier，与 DEC-065 冲突。

## 验收与回退

本 WorkItem 的验收不是某个接口返回成功，而是五个切片各自达到可证明的收敛条件，且总纲、
切片、Issue 和效果仪表盘对同一条事实给出同一答案。回退方式是保留已落地功能，只撤回 WorkItem
迁移和未执行的切片；历史方案与决策不回改。
