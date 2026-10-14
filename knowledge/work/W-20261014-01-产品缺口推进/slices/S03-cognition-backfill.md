---
slice: S03
title: 对象认知回填
status: blocked
issue: null
depends_on: []
evidence: null
---

# S03 — 对象认知回填

> 状态：blocked
> Issue：TBD
> Owner：待人工复核
> 依赖：托管范围复核、孤儿条目裁决
> 上下文预算：T0 + 总纲 §1–§4 + 本切片 + 对象认知技能的按需检索结果

## 1. 这一段要解决什么

- 问题：本轮新增/改动的端点、字段、模型、任务和前端组件尚无对象认知条目；机器状态仍为
  「未对齐」，且已有对象认知技能报告残余目标未收敛。
- 可观察结果：机器状态收敛到 aligned，或明确列出尚未收敛的对象、孤儿条目和人工裁决结论。
- 不做什么：不手改机器卷资产、不放松检查器、不把 prose 当成对象认知的替代正文。

## 2. 边界与契约

- 涉及对象（至少）：`models/data_export.py`、`tasks/account_tasks.py`、
  `api/v1/users.py` 的新端点、`vocab_set_service.celebrate`、三条迁移、
  `useUserPreferences.ts`、`TargetExamSetting.tsx`、`AccountLifecycleSettings.tsx`、
  `DeletionBanner.tsx`、`SetCelebrationModal.tsx`。
- 会改的契约：对象认知卷；不在这里复述对象的契约和行为。
- 开工前必须确认：
  - 当前托管范围；
  - 孤儿条目（例如历史删除组件）的去留；
  - 哪些事实属于对象认知，哪些属于决策/切片记录。

## 3. 执行路径

1. 按对象认知技能重新获取当前 machine batch / governance 状态。
2. 由人工复核待确认对象和孤儿条目，裁决纳入、移除或保留观察。
3. 对新增对象按技能签发批次补齐认知条目；决策仍追加到 `decisions.md`。
4. 重新跑对象认知验证与 `check_knowledge.py`，把 machine timeout / remaining / aligned 状态
   写入证据。
5. 如果仍不能收敛，记录具体阻塞对象和下一步人工动作，不把状态写成 aligned。

## 4. 验收与证据

- 机械验收：对象认知工具报告无未处理目标和 `check_knowledge.py` 通过。
- 行为验收：新端点、字段、任务和前端组件在对象认知层可按对象检索到；孤儿条目有明确裁决。
- 证据位置：本文件 §5，记录工具状态、批次结果和未收敛项。
- 回退方式：不适用；不得通过手工编辑机器卷资产来制造通过。

## 5. 结果记录

- 实际结果：待执行。
- 证据：待补。
- 决策：范围裁决如涉及长期取舍，追加新决策；不修改已有条目。
- 新发现 / 后续切片：待补。
