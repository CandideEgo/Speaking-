---
name: context-bootstrap
description: Establish or restore understanding of an unfamiliar project that has no project-specific cognition layer yet. In Speaking, object facts are handled by the `aoci` skill; this skill only builds the surrounding rule, domain and knowledge model.
---

# Project Context Bootstrap

## 在 Speaking 的职责

这个技能不重建对象认知。单个文件、表、接口、关系和改动后果属于项目的 `aoci` skill；
需要这些事实时调用它，本技能不复制它的命令、交付协议或维护状态机。

本技能只处理对象认知之外的三层：

1. **L1 热层**：会话路由、领域词、硬规则、在飞状态、并行协议；
2. **L2 冷仓**：为什么这样定、跨对象地图、操作程序、计划、进度、历史；
3. **接线**：知识索引、决策索引、机器检查和技能之间是否互相可达。

## 何时不要用

- 只是问某个文件、表、接口或模块是什么：调用 `aoci` skill。
- 只是检查当前任务和已知坑：读 `.agent/state.md`。
- 只是查规则：读 `.agent/invariants.md`。
- 项目已有可用对象认知层：不要重写认知卷，也不要把对象事实搬进 prose。

## 建立残余上下文

先自然探索项目，再按下面的缝落位：

| 事实 | 家 |
|---|---|
| 单个受管理对象的身份、契约、关系、改动后果 | `aoci` skill 管理的对象认知层 |
| 必须持续成立的规则 | `.agent/invariants.md` |
| 领域词和口径陷阱 | `CONTEXT.md` |
| 跨对象模块图和关键数据流 | `knowledge/system-map.md` |
| 为什么、备选、代价和事故 | `knowledge/decisions.md`、ADR、`knowledge/wiki/problems/` |
| 当前在飞事项和下一步 | `.agent/state.md` |
| 可复用操作程序 | `knowledge/wiki/guides/` 或项目 skill |

写之前先读 `.agent/README.md`。它是分层标准；本技能只执行，不另建第四套文件。

## 三关过滤器

只有同时满足才写入：

1. 代码不能直接说明；
2. 未来决策会因此改变；
3. 内容解释 why，而不是复述 what。

不要写完整文件清单、API 参考、函数说明或 README 摘要。已有文档只抽取和补洞，不复制。

## Stop Signals

- 你准备新建第四个热层文件；先修改 `.agent/README.md` 的分层标准。
- 你准备把单个对象的契约或行为写进 prose；改为调用 `aoci` skill。
- 你准备手改机器认知卷或状态目录；停在 `aoci` skill 的安全边界。
- 你发现项目已经有对象认知层；不要 bootstrap 它。
