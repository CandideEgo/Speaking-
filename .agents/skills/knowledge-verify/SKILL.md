---
name: knowledge-verify
description: Verify prose knowledge against code reality. Use when context may be stale, after significant code changes, or when .agent/state.md is over 14 days old. Checks the claims no deterministic check can parse; AOCI drift is verified by AOCI itself.
---

# Knowledge Verification

代码是唯一事实来源。本技能验的是**没有检查能解析的那一半**：prose 里关于代码的断言还成不成立。

## 先分清两层的漂移

| 层 | 漂移由谁验 | 怎么验 |
|---|---|---|
| **L0 AOCI（对象认知）** | AOCI 自己 | `aoci check` / `aoci verify` / `aoci doctor`；语义维护走 `aoci_maintain`（`AGENTS.md` 的收尾动作）。**不要**在 prose 里补一段对象描述来「修」它，也不要手改 `aoci.*` 或 `.aoci/` |
| **L1/L2 prose（规则、为什么、程序）** | 本技能 + `check_knowledge.py` | 先跑九项机器检查，再逐条对代码求证本技能负责的断言 |

`stale` 只提醒「某个模块的代码在你上次确认之后动过」，它是**起点不是判决**：代码动过不等于页面错了。

## 什么时候做

- 用户要求核验
- 某个模块有大改动之后
- 长时间没碰这个仓
- `.agent/state.md` 的 `Last Updated` 超过 14 天（这条日期就是新鲜度信号）

## 怎么做

### 1. 先跑机器检查

```bash
python scripts/check-knowledge/check_knowledge.py
```

九项：`refs`、`frontmatter`、`ownership`、`index`、`paths`、`layout`、`captures`、`cognition` 判定，
`stale` 只提醒。各门管什么的正文在 `scripts/check-knowledge/README.md`。**不要**为了让检查过而
编辑检查器、`knowledge-baseline.json` 或 `knowledge-stamps.json`。

### 2. 读该读的

按 `.agent/README.md` 的分层标准：`.agent/README.md`、`.agent/invariants.md`、`.agent/state.md`、
`CONTEXT.md`、`knowledge/system-map.md`、`knowledge/wiki/**`（除 `INDEX.md`），以及
`knowledge/decisions-index.md` 指到的那几条决策——**永不整篇读** `decisions.md`。
`knowledge/archive/` 是冻结记录，只在考古时打开。

记下每页的 `status`、`confidence`、`related_code`、`updated`。`.agent/*.md` 没有 frontmatter，
它们的新鲜度看 `state.md` 的 `Last Updated`。

### 3. 对代码求证

优先查两类：`related_code` 指向的模块最近改过的页面；以及没有检查能解析的断言——
一段描述的流程、一条不变量、一句「之所以这样设计」。

- 描述的函数 / 类还在吗？
- 描述的流程还是那样走吗？
- 描述的模式还在用吗？
- 描述的依赖关系还准吗？

### 4. 报告

```
Knowledge Verification Report

Active (verified):     [页面 — 哪些断言已在代码里确认]
Active (assumed):      [页面 — 部分确认，哪几条没查]
Deprecated:            [页面 / 断言 / 现实 / 建议动作]
Archived:              [已冻结、只解释历史的记录]
```

顺带查两件结构性的事：

- **一事实一家**：这条断言是不是已经有家（`.agent/README.md` 的路由表）？是的话这一版有没有
  新增价值？没有 → 建议改成指向那个家的交叉引用。
- **只描述 what 的文档**：代码已经表达的，应当删除而不是更新。
- **对象事实混进 prose**：如果某段在复述单个对象的契约或约束，它的家是 AOCI——搬走，prose 只留指认。

### 5. 修或标注

- **就地修**：更新文档，`status: active`、`confidence: verified`、刷新 `updated`
- **标 deprecated**：知识被新实现取代
- **标 archived**：只解释过去、不再约束今天
- **降级 confidence**：`assumed` / `unverified`（部分核验过）
- **取代一条决策**：永不改旧条目——在 `knowledge/decisions.md` **末尾**追加，并在
  `knowledge/decisions-index.md` 把旧行标成 `superseded by DEC-0NN`
- **建议删除**：三关过滤器全不过的文档，建议删除并说明理由

不要静默重写知识。

## frontmatter 两个维度

```yaml
status: active | deprecated | archived      # 生命周期
confidence: verified | assumed | unverified # 可信度
```

八个键一个不能少（`title`、`tags`、`status`、`confidence`、`related_code`、`related`、`created`、
`updated`）。`frontmatter` 门会在缺键、`related_code` 模块不在 `modules.json`、
`architecture/` 与 `problems/` 下 `related_code` 为空、`related` 路径不存在、`updated` 早于
`created` 时失败。schema 的正文在 `scripts/check-knowledge/README.md`。

## 核验完之后

```bash
python scripts/check-knowledge/check_knowledge.py --stamp-refresh --module <module>
```

只刷新你**真的重读过**的模块：这条命令声明「该模块的页面仍然描述代码」，不是清提醒的橡皮擦。
不带 `--module` 会从文档重新推导整个受监视集合，用在模块词汇本身变了的时候。

## 三关过滤器

更新文档时同样过闸：代码藏不住它？将来改动会受益？解释的是 **why** 而不是 **what**？
核验可能得出的结论是**这份文档本就不该存在**——那样就删除，而不是更新。
