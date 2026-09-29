---
name: accept
description: 验收并关闭一张票：机械门 → 只读契约变更与契约文件 diff → 演示路径核对 → Status: closed + state.md 记录 + 移入归档。用于验收、关票、收工。
---

# Accept — 验收 + 关闭（缝 4）

## Trigger

- `/accept` — 验收 `Status: done` 的票并关闭
- 中文同义：「验收」「关票」「收工」「这张票算完了吗」

## Where the rules live

`.agent/handoffs/README.md` 拥有关闭语义与生命周期；`.agent/owners.md` 规则 5 拥有机械验收
顺序。读它们，不在本技能里复述。

## Steps

1. **机械门先行**（owners.md 规则 5）：`pytest`、`ruff check`、`mypy`、`tsc --noEmit`、
   `eslint`、`check_knowledge.py` 全绿。不绿 → 报告缺什么，票留在 `done`。
2. **只读该票的「契约变更」小节 + 契约文件 diff**，不读全 diff。
3. **演示路径核对**：票头的 `演示路径` 承诺的东西现在真的能演示吗？不能 → 退回执行者，
   列出缺口。
4. 验收者不能是执行者；执行者对自己的票跑 `/accept` 要停下来叫 planner（你）。
5. 通过 → 票文件写 `Status: closed`；`.agent/state.md` 的 Recently Completed 记一行
   （最新在上，引用票名）；文件移入 `.agent/archive/handoffs/`。
6. 回报：关闭了哪张、机械门结果、契约 diff 结论。**关闭/归档才是解锁下游的动作**——
   依赖它的票会因此变可开工（frontier 由 `check_knowledge.py handoff` 重新打印）。

## Do not

- 没跑机械门就关票。
- 读全量 diff 代替契约 diff。
- 替执行者补「已完成」——验收是核对，不是代写。
