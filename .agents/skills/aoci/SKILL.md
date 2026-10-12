---
name: aoci
description: 本仓的对象认知层（L0）——某个文件 / 表是什么、与谁有关系、契约是什么、改它要注意什么。需要对象事实、要做跨模块改动、或要给改动收尾时加载。只读问答用定向检索，需要协议正文时才加载本技能。常驻规则文件不承载对象认知流程。
---

# AOCI —— 对象认知层（L0）

本仓的认知系统分三层（DEC-072 / DEC-076）：

| 层 | 位置 | 权威范围 | 读的时机 |
|---|---|---|---|
| **L0 认知层** | `aoci.txt` · `aoci.meta.txt` · `aoci.code.txt` · `.aoci/` | **对象事实**：一个受管理对象是什么、与谁有关系、对外契约、改它的非显然约束 | 按需（本技能） |
| **L1 热层** | `AGENTS.md` · `CONTEXT.md` · `.agent/` | 规则与会话契约 | 每会话 |
| **L2 冷仓** | `knowledge/`，入口 `knowledge/INDEX.md` | 过去：为什么这么定、被否的方案、怎么操作 | 按需 |

**一条缝**（判据正文在 `.agent/README.md`）：能写成「恰好一个受管理对象」的属性 → L0；
否则 → L1 / L2。prose 只准**指认**对象，不准复述它的契约与约束。

> **本技能的接线**：常驻规则只允许路由到项目技能，不承载任何 AOCI 流程。若工具安装器重新往
> `AGENTS.md` 或 `.agent/` 写入指令区块、工具命令或状态机，移除它并保留本技能作为唯一正文；
> 仓库的知识门禁会阻止这种回潮。

## 什么时候加载

| 你在做的事 | 动作 |
|---|---|
| 只读代码 / 查文件 / 解释行为 | 只用 `aoci_search` / `aoci_get_entries` **定向取**，其余部分不必读 |
| 要改代码、要做系统级判断、要重建或恢复系统全貌 | 走「开场协议」 |
| 改了受管理对象，要给这次改动收尾 | 走「收尾协议」 |

## 开场协议

1. `aoci_rules` 一次 → `aoci_overview`。返回 `continuation_required=true` 时**原样**跟随 `next_cursor`
   直到 `completed=true`：中途不询问用户、不下阶段性结论、不开始业务任务。
2. 同一 run 内已可靠持有该认知时直接复用。**上下文压缩后必须重载** —— 用
   `refresh_reasons=["context_compaction"]` 与新的 `refresh_event_id` 调普通完整 `aoci_overview`
   （不设 `check_only`），走完每个 cursor，再提交一次 Attestation。压缩 handoff 里抄进来的索引正文
   或 receipt **不能**证明恢复后的认知可靠。
3. 看对齐状态返回的 `governance_aligned` 与 findings。Dirty / Stale / blocked 时认知
   **仍可读**（交付的 scope 与状态是显式的），但**不得声称索引描述今天的代码**。可在
   `.agent/state.md` 用通用语言记录“对象认知未对齐、阻塞原因、下一步由什么会话处理”，
   但不把本技能里的工具名、命令或状态机带回热层。

### 读 Whole-Index 时不许做的事

- Attestation 完成前，不得用 Memory、源码、Spec、历史会话、scope、search 或 Entry 读取去**修补**认知。
- 交付链出现 Host 截断、缺块、重复、乱序、cursor 失败、Index 变化或 `chunk_tokens` 变化时，**停止**
  本次认知链；Host 截断时提示用户把 `overview_delivery.chunk_tokens` 调小后重来，**不要自动改**。
- Challenge ordinal 是正式 Entry 序列里的 1-based 位置；Header、注释、空行、Marker、Receipt、
  Metadata 均不计数。旧 Index、旧序列、旧数量、旧 Attestation 一律无效。

### 三档状态怎么读（别把「未验证」读成「没理解」）

- `delivery_verified` —— 已加载且交付已验证；**不得**说成「没有认知」或「没有理解系统」。
- `cognition_verified` —— Attestation 通过（Challenge ≥80% ordinal 正确且对象身份至多失手一处）。
- `cognition_governed` —— 再加治理对齐。
- 只有 `current_system_cognition_reliable=true` 才允许无保留地说「当前完整系统认知可靠」。
- 严格 Attestation 失败 ≠ 模型没有理解系统；`system_mastery_percent` 只自评系统框架，不代表完整实现知识。

## 收尾协议

1. 任务改了受管理对象 → 待其达到**最终稳定状态**后，只调一次 `aoci_maintain`。
   不要在每次中间修改后逐文件维护。
2. 机器签发候选时：模型**真读**每个候选绑定的对象与证据，逐条创作标签与 F/R/A/S，通过
   `aoci_update_entry` **一次提交整批**（原样保留 `source_sha256` / `candidate_id` / 批次身份）。
   `remaining` 非零就在当前批次 Apply 后重新 `maintain`，从新 preimage 继续。
3. **绝不静默漂移**：批次在本次 run 内完不成、或工具报告该路径不可写时，在最终回复中报告机器事实；
   若需要跨会话承接，可在 `.agent/state.md` 只记录“对象认知收尾未完成、剩余目标数、阻塞原因和
   所需会话能力”。热层不写工具名、命令、批次协议或 `next_commands`。**写不进去允许，不报告不允许。**
4. 结构化状态要遵守：`repair_required` 只修命中项再重交整批；`stopped` 按 `failed_step` 与正式写入
   证据决定 Closure / Resume / Rollback；冲突、审批、权限与安全信号不得忽略。
5. 已对齐后不重复维护、不重复写入。维护完又改了受管理对象 → 上一次的维护结果失效，重新收尾。
6. **`guide.complete=false` 不等于不可对齐** —— 它只说明还有 executable targets；按 Guide 的
   `next_action` 再跑一次 `aoci_maintain` 才是正确动作。「不重复 maintain」只适用于已 `aligned=true` 之后。

## 语义与证据纪律

- Entry 语义**只能**来自模型对真实证据的理解。路径、文件名、扩展名、AST、符号列表、依赖扫描、
  正则与模板只能用于定位、传递与校验，**不得**用来推导、预填、拼接或改写标签与 F/R/A/S。
- 证据不足且当前布局支持 `aoci_report` 时，用它登记待办 —— 不猜写、不套模板、不为消除待办而生成认知。
- 写作预算（`.aoci/config.json` 的 `cognition_budget`，单位 token）：**R** 字段上限 C1-4 `50`、
  C5-7 `90`、C8 `140`、C9 `180`；**S** 字段上限 C1-4 `40`、C5-7 `80`、C8 `140`、C9 `200`。
  `S` 按 UTF-8 字节 / 3 计。超额要**重写语义**，不是机械截断。
- 为什么永远不进 L0：理由、备选方案、代价、事故经过属于 `knowledge/decisions.md`、
  `knowledge/adr/`、`knowledge/wiki/problems/`。

## 工具入口

| 工具 | 用途 |
|---|---|
| `aoci_rules` | 取当前版本的会话运行合同 |
| `aoci_overview` | 建立或恢复完整认知（`check_only=true` 只取机器语义计数） |
| `aoci_search` / `aoci_get_entries` | 定向取对象认知 |
| `aoci_maintain` | 受管理对象到达稳定状态后，检查认知是否需要维护 |
| `aoci_update_entry` | 提交与证据、源码摘要绑定的完整语义批次 |
| `aoci_report` | 证据不足、无法可靠生成语义时登记待办 |

> 其他 MCP 工具、CLI 命令、参数与专项流程，**以当前工具 Schema、Guide 与 `--help` 为准** ——
> 本技能不复制它们的手册。初始化、Header / Entries 生成、Curation、人工评审与故障恢复，
> 一律按当前 Guide 执行，不在这里重建状态机。

**CLI 侧**：本机二进制在 `.mcp.json` 的 `command`（`C:/Users/Administrator/Tools/aoci/aoci.exe`），
不必在 PATH 上。Volumes v1 上 `aoci index update`（含 `--dry-run`）、`aoci_report`、`remove-entry`
与旧维护子命令一律报 `volume_read_only` / `error_code=config`；唯一可写路径是
`aoci_maintain` → `aoci_update_entry`（后者必须带 `maintain` 签发的 `--source-sha256`）。
没有接入对象认知 MCP 的会话收不了尾 —— 那时按第 3 条报告，并在必要时把通用阻塞事实写进
`.agent/state.md`，不要把命令写回热层。

## Stop Signals

停下并回到用户，不要自己决定：

- 要手改 `aoci.txt` / `aoci.meta.txt` / `aoci.code.txt` / `.aoci/` 白名单资产来「修」漂移。
- 要用 `scan --force`、合成 candidate、或手改 `.aoci` 来洗白对齐状态。
- `aoci_maintain` 返回 `repair_required` 未收敛，或 `remaining` 非零却要宣称 aligned。
- 用户只授权了业务文件范围，而你正准备写对象认知托管资产（以用户限制为准，如实报告剩余不一致）。
- 你打算把对象语义写进 prose（能写成「恰好一个受管理对象」的属性就不该进 prose）。
- 你要给 `AGENTS.md` 或 `.agent/` 装回对象认知指令区块 —— 那是工具的旧行为，本仓的接线是「协议住本技能」，
  两者冲突时以本仓决定为准并报告。
