---
name: context-bootstrap
description: Establish or restore an agent's understanding of a project. Use when entering an unfamiliar project, when the repository has no cognition layer yet, or when context is missing. In a repository that already has AOCI, loading cognition replaces this skill entirely.
---

# Project Context Bootstrap

## 这个技能现在的职责

系统的**对象认知**（某个文件/表是什么、与谁有关系、契约、非显然约束）由 AOCI 提供，不由本技能
从零写出来。本技能只剩两件事：

1. **没有 AOCI 索引的仓**：先按 AOCI 的 Guide 建立认知层，再决定 prose 残余；
2. **已有认知层的仓**：不做本技能——按 `AGENTS.md` 的「开场三件事」取认知，然后就去做任务。

## 先判断：这个仓有没有认知层

| 现状 | 动作 |
|---|---|
| 有 `aoci.txt` + 可用的正式索引 | **不要 bootstrap**。`aoci_rules` → `aoci_overview`（`continuation_required` 时跟随 `next_cursor` 到 `completed`），再读 `.agent/state.md` |
| 只有骨架 / Header 不完整 / Entries 未完成 | 先 `aoci_rules`，然后进入当前 AOCI Guide；由 Guide 依据仓库真实状态决定下一阶段。不要自行重建索引状态机 |
| 完全没有认知层 | 按下面的顺序建：**认知层 → 热层 → 冷仓** |

New Volume 布局的初始化、Header 与 Entries 的生成、Curation 与人工评审，一律按当前 Guide 与
`--help` 返回的指令执行；本技能不复制这些专项流程，也不硬编码它们的阶段。

## 建认知层（L0）

- 语义只能来自模型对真实证据的理解：对象源码、测试、配置、数据库结构。路径、文件名、扩展名、
  AST、符号列表、依赖扫描、正则与模板只能辅助定位、传递、校验与写入，**不得**用来推导、预填、
  拼接或改写标签与 F/R/A/S。
- 证据不足时不要猜写：用工具支持的登记路径记下来，而不是套模板消除待办。
- 受管理范围（哪些路径进索引、哪些只观察、哪些排除）是仓库级决定，走工具自己的 scope 流程。

## 建 prose 残余（L1 / L2）

只在**对象认知之外**还有事实时才写。判据一句话：**这条事实能不能写成「恰好一个受管理对象」的
属性？** 能 → 它属于 AOCI，不要写进 prose。

| 事实 | 落在 |
|---|---|
| 必须持续成立的规则；被移除、不得复活的功能 | `.agent/invariants.md` |
| 产品是什么；领域词汇 | `CONTEXT.md` |
| 跨对象的组合视图（模块如何拼起来、数据怎么流） | `knowledge/system-map.md` |
| 为什么这么定、备选与代价 | `knowledge/decisions.md` + `knowledge/decisions-index.md` |
| 现在在飞什么、下一步、什么坏了 | `.agent/state.md` |
| 某个子系统的设计意图、可复用的失败模式 | `knowledge/wiki/architecture/`、`wiki/problems/`（带 frontmatter） |
| 怎么跑、怎么测、怎么发 | `knowledge/wiki/guides/` |
| 怎么操作这套部署 | `knowledge/operations/` |

热层的三条准入测试（全部成立才留）：每会话都读；说的是现在而不是过去；读了会改变下一步动作。
冷仓的唯一入口是 `knowledge/INDEX.md`：一个文件一行，两个方向都由 `index` 门检查。

写任何一层之前先读 `.agent/README.md`——那是分层标准的正文，本技能只做路由。

## 已有文档：抽取，不要重复

| 已有文件 | 怎么处理 |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | 已经是入口与规则，不要复制；缺什么补什么 |
| `CONTEXT.md` | 已有词汇表，不要重写；只补它没有的领域词 |
| `knowledge/adr/`、`knowledge/decisions.md` | 已记录决定，引用而不是复述 |
| `README.md` | 已有项目简介，不要再抄一遍 |
| `knowledge/operations/` | 已有 runbook，指向它 |
| `aoci.code.txt` | 已有对象认知，**永远不要**用本技能重写它 |

## 三关过滤器（写之前）

1. 代码藏不住它？（代码直接表达的，不写）
2. 将来的改动会受益？（不影响决定的，不写）
3. 它解释的是 **why** 而不是 **what**？（只描述 what 的，不写）

三关全过才写。不写完整文件清单、不写 API 参考、不写函数说明。

## 质量判据

好的上下文：解释东西为什么存在、帮后来的决定、减少重复探索。
坏的上下文：抄源码、重复文档、记录无意义的细节。
