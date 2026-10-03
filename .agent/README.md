# 认知系统（Cognition System）

> 三层、一条缝、一个收尾动作。这份文件是标准：一条事实归哪一层、怎么找回来、永远不做什么。
> 机器事实（AOCI 卷格式、MCP 工具与 CLI 的返回状态）以工具 Schema、当前 Guide 与 `--help`
> 为准；本文只写**分流判据与写入纪律**，不复制手册。

## 三层

| 层 | 位置 | 权威范围 | 读的时机 | 谁写 |
|---|---|---|---|---|
| **L0 认知层** | `aoci.txt` · `aoci.meta.txt` · `aoci.code.txt`（机器状态与入口：`.aoci/`、`.mcp.json`） | **对象事实**：一个受管理对象（文件 / 表）是什么、与谁有关系、对外契约是什么、改它必须知道的非显然约束 | 开场（`aoci_rules` → `aoci_overview`）；按对象查（`aoci_search` / `aoci_get_entries`） | 机器事务写入；语义由模型按当前 Plan 与 Guide、基于证据创作 |
| **L1 热层** | `AGENTS.md` · `CONTEXT.md` · `.agent/` | **规则与会话契约**：必须持续成立的约束、当前在飞、并行协议、领域词 | 每会话，在知道任务之前 | 人与模型手写 |
| **L2 冷仓** | `knowledge/`，入口 `knowledge/INDEX.md` | **过去**：为什么这么定、被否的方案与代价、怎么操作、计划与进度、用户原话、冻结档 | 按需 | 人与模型手写 |

热层三条准入测试，**全部**成立才留：每会话都读；说的是现在而不是过去；读了会改变下一步动作。

## 一条缝：一条事实归哪层

判据一句话：**这条事实能不能写成「恰好一个受管理对象」的属性？**

- **能 → L0。** 例：某个任务的三段式与断点语义、某个依赖模块的注入点与封禁行为、某张表的唯一约束与行锁要求。prose 只准**指认**对象（写出路径或名字），不准复述它的契约与约束。
- **不能 → L1 或 L2。** 要两个以上对象才成立的关系、跨对象的组合语义、术语表、规则、决定、记录、操作程序，都属于这里。

三条边界条款：

1. **规则**在 L1 有唯一正文（`.agent/invariants.md`：一行规则 + 强制方式）。AOCI 的 S 可以写这条规则在某个对象上的**后果**（改了会坏什么），但不得成为规则的第二份正文；每条 INV 必须点名对象或 AOCI 条目。
2. **代码里表达不出的数字**（调度阶梯、阈值表、因子权重）留在拥有该决定的冷仓文档；AOCI 的 S 写判据，不抄数字。
3. **为什么永远不进 L0。** 理由、备选方案、代价、事故经过属于 `knowledge/decisions.md`、`knowledge/adr/`、`knowledge/wiki/problems/`。

## L0 怎么用、怎么维护

1. **开场**：`aoci_rules` 一次，再 `aoci_overview`；返回 `continuation_required` 时原样跟随 `next_cursor` 直到 `completed`。同一认知周期内不重复取。
2. **对齐状态是一等事实。** `aoci check` 的 `governance_aligned` 与 findings 决定这份认知能否被当作「描述今天的代码」：
   - `aligned`：直接复用，不必重传；
   - Dirty / Stale / blocked：认知**仍可读**（交付的 scope 与状态是显式的），但不得声称索引描述今天的代码，并且必须把机器事实写进 `.agent/state.md`。
3. **收尾**：任务改动了受管理对象时，在本次任务**最终稳定状态**执行一次维护 —— `aoci verify` → `aoci_maintain`。机器签发候选时，模型读当前 Header 与受影响对象的真实证据，逐条创作语义，按机器批次**一次提交整批**（不截取、不缩减 scope）。批次在本次 run 内完不成，或工具报告该路径不可写时，把机器事实写进 `.agent/state.md`：批次身份、`total_targets` / `remaining`、阻塞原因、`next_commands`。
   **绝不静默漂移**：写不进去是允许的，不报告不允许。Volumes v1 上只有 `aoci_maintain` → `aoci_update_entry` 这一条写路径可用；`aoci_report`、`remove-entry` 与 CLI 的旧维护子命令都报 `volume_read_only`。
4. **半衰期**：受管理对象再次变化后，上一次维护结论失效，需在新的稳定状态重新收尾。

## L1 热层文件

| 文件 | 装什么 | 不装什么 | 何时读 |
|---|---|---|---|
| `AGENTS.md` | 入口与路由、MUST / SHOULD / NEVER、AOCI 指令区块 | 任何对象描述、任何历史 | 每会话，最先 |
| `CONTEXT.md` | 领域词汇：术语在本仓指什么、口径陷阱 | 模块职责、接口契约（那些是 L0） | 任务需要领域语言时 |
| `.agent/README.md`（本文） | 分层标准：一条事实归哪层、怎么加一条 | 具体事实本身 | 写入任一层之前 |
| `.agent/state.md` | 在飞的事、下一步、已知问题 | 已完成的工作（那是 decisions / CHANGELOG / archive） | 每会话 |
| `.agent/invariants.md` | 必须持续成立的规则 + 强制方式；已移除功能不得复活 | 规则的完整事故经过（那些进 L2，行内留指针） | 改代码之前 |
| `.agent/owners.md` | 切片、契约文件、并行协议、加载预算 | 模块职责（由 L0 按对象回答） | 拆任务给多个 agent 时 |

## L2 冷仓

`wiki/`（architecture 设计意图 / problems 可复用失败模式 / guides 在本仓怎么做事的程序）、`adr/`、
`decisions.md` + `decisions-index.md`、`system-map.md`（跨对象组合视图）、`plans/`、`progress/`、
`requirements/`、`operations/`、`inbox/`（用户原话，封存）、`archive/`（冻结）、`CHANGELOG.md`。

`knowledge/INDEX.md` 是唯一入口：每个文件恰好一行，每行路径都真实——两个方向都由 `index` 门检查。

## 一条事实一个家

- 热层写**结论 + 指针**，细节冷仓；同一个意思不写两遍。
- **没有字节上限、没有字节目标**（DEC-067）。体积只报不判；要收敛的问题是「放对层了吗」，不是「写短一点」。
- 事实过期是**搬**，不是删：搬进冷仓并在索引里登记。
- 决策只追加：永不修改或重排已存在的条目；改变主意 = 末尾追加 + 在索引里标注旧条目。
- 热层与稳定的 `knowledge/wiki/` 页面**禁止 commit hash**；历史属于 `decisions.md`、`archive/`、`CHANGELOG.md`。
- `knowledge/inbox/*/raw.md` 原话只增不改；要修订就另起一张 capture。
- AOCI 托管资产（`aoci.*`、`.aoci/` 白名单内的文件）与业务文件在提交与审计里**分开**记录。

## 强制

`scripts/check-knowledge/check_knowledge.py` 在 pre-commit 与 `Knowledge` CI 里跑九项检查
（`refs` / `frontmatter` / `ownership` / `index` / `paths` / `layout` / `captures` / `cognition` 判定，
`stale` 只提醒）。各检查管什么、`paths.json` 怎么配置，见 `scripts/check-knowledge/README.md`。

L0 由它自己的机器检查看管：`aoci check` / `aoci verify` / `aoci doctor`。两套检查各管一层，
不互相替代：`cognition` 门保证认知层的**结构与接线**没断，AOCI 自己保证**内容与源码的绑定**。

本标准的决定记录：DEC-072（认知系统以 AOCI 为核心、缝判据与维护闭环）、DEC-066/067（热冷分层与体积治理）。
