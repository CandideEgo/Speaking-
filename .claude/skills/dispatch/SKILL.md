---
name: dispatch
description: 查 frontier 并认领一张票：列出阻塞项全关、尚未认领的票，按依赖序取第一张，写 Owner 与 Status: in progress。用于派活、认领、问「现在能开工哪些」。
---

# Dispatch — 查 frontier + 认领（缝 3）

## Trigger

- `/dispatch` — 列出可开工的票并认领一张
- 中文同义：「现在能开工哪些」「派活」「认领」「下一张票」

## Where the rules live

`.agent/handoffs/README.md` 拥有票的字段语义、frontier 定义与关闭语义；`.agent/owners.md`
拥有 owner 切片与 ≤2 并行约束。读它们，不在本技能里复述。

## Steps

1. 跑 `python scripts/check-knowledge/check_knowledge.py handoff`，读打印出的 **frontier**
   （可开工：`Status: dispatched` ∧ 阻塞项全关 ∧ 无 `Owner`）。
2. frontier 为空 → 报告「无待认领的票」，停。
3. 并行度检查：`.agent/handoffs/` 里 `Status: in progress` 的票已 ≥2 → 不再认领
   （owners.md 规则 4）。
4. 按依赖序取第一张（先走阻塞链头部的票）。
5. 认领 = 在票文件头部写两行：`Owner: <owners.md 里的 owner>` 与 `Status: in progress`。
6. 回报：认领了哪张、为什么是它（frontier 顺序）、它依赖谁。

## Do not

- 认领 `Status` 不是 `dispatched` 的票；认领已写 `Owner` 的票。
- 替执行者写「已完成 / 契约变更 / 关键决策 / 遗留」——那是执行者的事。
- 一次认领超过一张。
