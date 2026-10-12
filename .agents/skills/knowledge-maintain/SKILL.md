---
name: knowledge-maintain
description: Maintain project knowledge after meaningful development changes. Use when completed work changed architecture, decisions, workflows, or reusable engineering knowledge. Routes object facts to AOCI and the residue (why, history, procedure) to prose.
---

# Project Knowledge Maintenance

## Purpose

Convert important development experience into future project understanding.

This is not a changelog. This is not a task diary.

**本技能管 prose 那一半。** 对象事实（某个文件/表是什么、与谁有关系、契约、非显然约束）的正文在
AOCI，由 AOCI 自己的收尾动作维护（`AGENTS.md` 的 MUST + `.agent/README.md`）。本技能做两件事：
把残余事实写对家，以及判断哪些「看起来值得写」的东西其实**不该写**。

---

# 第一步：分流（缝判据）

判据一句话，全文在 `.agent/README.md`：

> **这条事实能不能写成「恰好一个受管理对象」的属性？** 能 → AOCI；不能 → prose。

- **能 → 不要在这里写。** 对象事实走 AOCI 收尾（`aoci verify` → `aoci_maintain` → 按批次提交条目）。
  在 prose 里补一段对象描述，是这套系统唯一会累积的坏账：两份正文，只有一份会被更新。
- **不能 → 继续往下走**，过三关过滤器，再按路由表落位。

三条边界条款记住：规则永远在 `.agent/invariants.md` 有唯一正文；代码表达不出的数字留在拥有该决定的
冷仓文档；**为什么**永远不进 AOCI。

---

# 三关过滤器（是闸门，不是建议）

1. **Is this information hidden from code?** 代码直接表达的不写。只有这些过关：为什么这样设计、
   代码里没写出来的约束、已发现的失败模式、非显然的组件间相互作用。
2. **Will future changes benefit from knowing this?** 没有任何后来者会因此改变决定的，不写。
3. **Does it explain why, not what?** 只描述「加了 Redis 缓存」不写；「因为 DB 延迟是瓶颈、读多写少
   所以缓存收益高」才写。

三关全过才写。任关不过 → 说一句「不过滤，不记录」并停止。宁可缺一条，不要噪声。

---

# 路由表（残余事实归哪）

| 事实 | 落在 | 说明 |
|---|---|---|
| 必须持续成立的规则；被移除、不得复活的功能 | `.agent/invariants.md` | 一行规则 + 为什么 + 强制方式；叙述与实测留在 decisions / `wiki/problems/`，行内只留指针 |
| 为什么这么定、备选方案与代价 | `knowledge/decisions.md` 正文 + `knowledge/decisions-index.md` 一行 | 只追加，见下 |
| 某个子系统的设计意图与被否方案 | `knowledge/wiki/architecture/` | 长文，必须带 frontmatter |
| 可复用的失败模式与陷阱 | `knowledge/wiki/problems/` | 长文，必须带 frontmatter |
| 在本仓怎么做事（跑、测、发、排障） | `knowledge/wiki/guides/`、`knowledge/operations/` | 程序性知识；guides 可以不带 `related_code` |
| 跨对象的组合视图（模块如何拼起来） | `knowledge/system-map.md` | 单对象的职责不写这里（那是 AOCI） |
| 这个领域词在本仓指什么 | `CONTEXT.md` | 词汇表本身，不是指针 |
| 现在在飞什么、下一步、什么坏了 | `.agent/state.md` | 只写前瞻，见下 |
| 用户的原话 | `knowledge/inbox/`（`/intake`） | 封存，不可编辑 |
| 某段时间发生了什么 | `knowledge/progress/`、`knowledge/CHANGELOG.md` | 历史，不是理解 |

落位前先问：这条事实是不是已经有家？有就更新那一个，或指过去——**不要开第二个家**。

没有 `memory/` 层，也不要把知识路由到那里（`.agent/README.md` 是分层标准的正文）。

---

# 决策只追加

`knowledge/decisions.md` 是不可变历史。

- **永不修改或重排已存在的条目**，包括纠错、更新、合并。
- 改变主意 = 在文件**末尾**追加新条目 + 在 `knowledge/decisions-index.md` 把旧行标成
  `superseded by DEC-0NN`。
- 一条新决策要**两样都写**：文末条目 + 索引一行。`index` 门校验数量、顺序、日期、标题一致，
  条目标题必须形如 `## YYYY-MM-DD — Title`。
- 只记真有取舍的决定；显而易见的、没被否过的选项不记。
- **永不整篇读** `decisions.md`：先开 `decisions-index.md`，再看需要的那一条。

---

# state.md 的真实形状

只写前瞻。**当前**形状（四个段，`Last Updated` 是一行，不是标题段）：

```markdown
# Project State

> （一句说明：已完成的属于 decisions-index / CHANGELOG / archive）

Last Updated: YYYY-MM-DD

## Current Focus

- [在飞的事：做到了哪儿、还欠什么、判据是什么]

## Next Steps

1. [下一步]

## Known Issues

- [已知问题]
```

- 已完成的工作不在这里堆积：属于 `knowledge/decisions-index.md`、`knowledge/CHANGELOG.md` 或
  `knowledge/archive/`。
- `Last Updated` 是新鲜度信号：超过 14 天就该跑 `/knowledge-verify`。
- 它每会话都读，所以只写会影响下一步动作的事实。没有字节上限（DEC-067）：觉得太长时问的是
  「这条事实该不该在这一层」，不是「怎么把话说短」。

---

# 新建 wiki 文档的格式

```markdown
---
title: [title]
tags: [domain/layer/concern/type 四类，见下]
status: active
confidence: verified
related_code: [scripts/check-knowledge/modules.json 里的模块 ID，不是路径]
related: [仓库相对路径，必须存在]
created: [ISO date]
updated: [ISO date]
---
```

- 八个键全要；`status ∈ active/deprecated/archived`，`confidence ∈ verified/assumed/unverified`；
  `updated` 不得早于 `created`。`scripts/check-knowledge/README.md` 是这套 schema 的正文。
- `related_code` 只收 `modules.json` 的模块 ID；`architecture/` 与 `problems/` 下不得为空。
  新区域要先加模块，见 `modules.json` 的说明。
- 标签只用四类：Domain（video/audio/text/image/ai/data）、Layer（backend/frontend/database/
  infrastructure）、Concern（architecture/performance/security/bug/decision）、Type
  （feature/workflow/pattern/anti-pattern）。不自造标签。
- `status` 与 `confidence` 相互独立：`archived` 的文档仍可以是 `verified`，`active` 的也可以只是
  `assumed`。

---

# 机器检查（九项）

`scripts/check-knowledge/check_knowledge.py` 在 pre-commit 与 `Knowledge` CI 里跑九项：
`refs`、`frontmatter`、`ownership`、`index`、`paths`、`layout`、`captures`、`cognition` 判定，
`stale` 只提醒。各门管什么、`paths.json` 怎么配置，正文在 `scripts/check-knowledge/README.md`；
runbook 是：

```bash
python scripts/check-knowledge/check_knowledge.py
```

- **自己的违规自己修**；不要为了让改动过门而编辑检查器、`knowledge-baseline.json` 或
  `knowledge-stamps.json`。
- `knowledge/archive/` 豁免：冻结记录不按今天的链接与 schema 要求。
- `/knowledge-verify` 清过一页之后，用
  `python scripts/check-knowledge/check_knowledge.py --stamp-refresh --module <module>` 让提醒安静下来
  ——它声明「这一页仍然描述代码」，不是清提醒的快捷方式。

---

# 不要做

- 不要记录每一次提交、每一次文件改动、临时调试过程。
- 不要在 prose 里复述对象的契约或约束（那是 AOCI 的正文）。
- 不要手改 `aoci.txt` / `aoci.meta.txt` / `aoci.code.txt` / `.aoci/` 白名单资产来「修」漂移。
- 不要给知识层设字节上限或目标（DEC-067）。
- 不要在热层写 commit hash（`ownership` 门会失败）。
- 不要修改 `knowledge/inbox/*/raw.md`。

**触发本技能的门槛**：一次任务改了 3 个以上文件 / 跨模块 / 改了接口、API 或公共契约 / 改了会影响
行为的配置。错别字与格式化不触发；那时只更新 `.agent/state.md`（如果连状态都没变，什么都不做）。
