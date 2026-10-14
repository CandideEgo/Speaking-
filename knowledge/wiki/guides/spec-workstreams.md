---
title: Spec Flow：从想法到切片执行的通用工作流
tags: [workflow, knowledge-layer]
status: active
confidence: verified
related_code: []
related: [knowledge/work/README.md, .agents/skills/spec-flow/SKILL.md, docs/agents/issue-tracker.md, .agent/owners.md]
created: 2026-10-14
updated: 2026-10-14
---

# Spec Flow：从想法到切片执行的通用工作流

当一个想法会跨会话、包含多个可独立验收的结果，或同时在处理产品意图、技术方案和多次执行时，
把它建成一个 **WorkItem**。WorkItem 把意图、研究、方案、计划和证据放在同一个目录里；GitHub
Issues 继续只承载认领、阻塞、PR 和关闭。

这不是把问题一次做成瀑布。它做的是给每个阶段一个明确的输入、产物和停止点，让任意一个新会话
都能从磁盘状态恢复，而不是从聊天记录推断。

## 五层链路

```text
Intent -> Clarify / Research -> Solution -> Plan -> Slice execution
```

- `intent.md` 只回答要改变什么、为什么改、什么算成功。
- `research.md` 把未知项变成已核实事实、选项或明确未决项。
- `solution.md` 在工作方式上收敛，经过第一个人工闸门。
- `plan.md` 把方案变成顺序、切片、依赖、发布和测试策略，经过第二个人工闸门。
- `slices/Sxx-*.md` 是一张切片在一个会话里的全部上下文、验收和证据。

## 唯一归属

| 事实 | 唯一家 |
|---|---|
| 总方向、阶段、切片地图、当前前沿、效果 | `knowledge/work/<W-ID>/README.md` |
| 各阶段意图、研究、方案和计划 | WorkItem 目录中的阶段文件 |
| 认领、阻塞边、PR、打开/关闭 | GitHub Issues |
| 为什么这样定、放弃了什么 | `knowledge/decisions.md` + 索引 |
| 某个对象是什么、关系和不能破坏的契约 | AOCI |

一处事实只写一次。总纲链接到细节，不复制细节；切片链接到决策和对象，不把它们的正文搬进来。

## 上下文顺序

每次会话按 T0–T3 逐层加载，不预读整个 `knowledge/`：

- **T0**：`AGENTS.md`、`.agent/invariants.md`、`.agent/state.md` 当前焦点。
- **T1**：当前 WorkItem `README.md` 的结果、阶段地图、切片地图和当前前沿。
- **T2**：当前阶段文件或当前切片全文。
- **T3**：切片列出的 owner row、契约、实现文件和测试。

阶段产物超过当前阶段所需，不是“顺手多看一点”，而是把上下文预算花在了不会改变下一步的内容上。
需要更多事实时，先把指针写进当前阶段或切片。

## 状态与闸门

WorkItem 和切片的完整状态机、frontmatter、审批格式和 GitHub 映射在
[`knowledge/work/README.md`](../../work/README.md) 维护。这里只保留一个判断：

- 方案和计划都必须由人明确确认；模型不能自己写审批；
- 上游内容实质变化后，下游审批失效并重新进入 review；
- Issue 是执行事实，WorkItem 文件里的状态只是可核对快照；
- 没有证据的切片最多是 `verifying`，不能写 `done`。

结构不只靠会话自觉：`scripts/check-knowledge/check_knowledge.py workitems` 会拒绝缺阶段文件、
非法阶段状态、未批准却已越过闸门、重复或成环的切片依赖、以及已同步却没有 Issue 的可执行切片。
它只校验结构，不代替人写审批。

## 操作入口

用 `/spec-flow` 驱动整个生命周期。命令只负责一个阶段的读写、停止点和下一步，不把后续所有阶段
一次性展开。具体步骤、参数和停止信号在
[`spec-flow` skill](../../../.agents/skills/spec-flow/SKILL.md)。

## 预期收益与代价

它换来的不是“文档更多”，而是四个可回答的问题：现在推进到哪、下一张能做什么、为什么这样选、
完成后凭什么相信。代价是每个 WorkItem 多一个索引条目和一次 Issue 同步；如果任务小到单会话
即可完成，直接做，不建立 WorkItem。
