# AGENTS.md

## Role

You are an engineering agent working inside this repository.

Your goal is not only to modify code,
but to maintain an accurate understanding of the system.

## Principles

Code is the source of truth.
AOCI 是**对象认知**的唯一权威；prose 是规则、历史与程序的权威。
Documentation represents understanding, not implementation.
Skills provide capabilities, not workflows.

## Start Here

Read this file every session. It routes; it deliberately holds no knowledge of its own.

### 开场三件事（每次会话，进入任务之前）

1. **取认知**：`aoci_rules` 一次 → `aoci_overview`。返回 `continuation_required=true` 时原样跟随
   `next_cursor` 直到 `completed`，中途不询问用户、不下阶段性结论、不开始业务任务。同一 run 内已可靠
   持有该认知时直接复用；发生上下文压缩后按合同重载。
2. **看对齐状态**：`aoci check` 的 `governance_aligned` 与 findings。Dirty / Stale / blocked 时认知
   **仍可读**（交付的 scope 与状态是显式的），但不得声称索引描述今天的代码，并把机器事实写进
   `.agent/state.md`。
3. **看当前状态**：`.agent/state.md` —— 在飞的事、下一步、已知问题。

### 按问题类型找权威

| 你要回答的问题 | 权威 | 入口 |
|---|---|---|
| 某个文件 / 表是什么、和谁有关系、契约是什么、改它要注意什么 | **AOCI 认知层** | `aoci_search` / `aoci_get_entries`（开场已取 overview） |
| 哪条约束必须持续成立 | `.agent/invariants.md` | 改代码之前 |
| 为什么这么定、代价是什么、哪些方案被否 | `knowledge/decisions-index.md` → 那一条 | **永不整篇读** `decisions.md` |
| 某个子系统为什么这样设计、有什么陷阱 | `knowledge/wiki/architecture/`、`wiki/problems/` | 经 `knowledge/INDEX.md` |
| 怎么跑、怎么测、怎么发、怎么操作线上 | `knowledge/wiki/guides/`、`knowledge/operations/` | 经 `knowledge/INDEX.md` |
| 现在在飞什么、下一步、什么坏了 | `.agent/state.md` | 每会话 |
| 这个领域词在本仓指什么 | `CONTEXT.md` | 任务需要领域语言时 |
| 用户原话说过什么 | `knowledge/inbox/` | 经 `knowledge/INDEX.md` |

`knowledge/INDEX.md` 是冷仓唯一入口：冷仓每个文件一行，按需打开。`knowledge/decisions.md` 只追加、
永不整篇读（只读 `decisions-index.md` 指到的那一条）。

### 代码域 → 该读的冷仓叙述

对象认知在 AOCI；下面这张表只在**要理解为什么、要碰阈值或陷阱**时才走。

| 触碰 | 加读 |
|---|---|
| `tasks/video_processing.py`、`services/transcription`、`services/translation` | [video-pipeline](knowledge/wiki/architecture/video-pipeline.md) · [translation safety net](knowledge/wiki/architecture/translation-quality-safety-net.md) |
| `services/ai_service.py`、`services/word_notes.py`、`api/v1/words.py`、`services/ecdict.py` | [exam vocabulary](knowledge/wiki/architecture/exam-vocabulary.md) |
| `api/v1/media.py`、`services/video_access.py`、`services/video_cache.py` | [cache & media-gate blindspots](knowledge/wiki/problems/cache-invalidation-and-media-gate-blindspots.md) |
| `api/dependencies.py`、`core/security.py`、`frontend/src/stores/` | [auth system](knowledge/wiki/architecture/auth-system.md) |
| `frontend/src/app/`、`components/`、`lib/` | [frontend architecture](knowledge/wiki/architecture/frontend-architecture.md) |
| 其它后端 service 或任务、评分 / 推荐 / 排名 | [backend services](knowledge/wiki/architecture/backend-services.md) |
| ECDICT 释义或考试标注行为异常 | [ASR / annotation diagnosis](knowledge/wiki/problems/asr-annotation-quality-diagnosis.md) |
| 一轮 review-fix 又犯了老毛病 | [review/fix failure modes](knowledge/wiki/problems/review-fix-failure-modes.md) |
| 部署、服务器、媒体拓扑、凭据 | [runbook](knowledge/operations/RUNBOOK.md) · [media topology](knowledge/operations/MEDIA-TOPOLOGY.md) |
| 本地环境、跑测试、发布前 | [setup](knowledge/wiki/guides/setup.md) · [testing](knowledge/wiki/guides/testing.md) · [release checklist](knowledge/wiki/guides/release-checklist.md) |
| 跨 agent 拆一个任务 | [module owners](.agent/owners.md) |
| 要新增一条知识、或决定它该写哪儿 | `.agent/README.md`（三条准入测试 + 缝判据） |

### 一条缝（写之前先读）

**能写成「恰好一个受管理对象」的属性 → AOCI；否则 → prose。** 判据、三条边界条款与收尾纪律的
正文在 `.agent/README.md`。写错层是这套系统唯一会累积的坏账。

## MUST (强制执行)

- 建立或重载系统认知时，MUST 先 `aoci_rules` 再 `aoci_overview`；`continuation_required=true` 时
  MUST 原样提交 `next_cursor` 直到 `completed`，不得询问用户、不得开始业务任务或给出阶段性系统结论
- 跨模块变更后（改动了 ≥2 个 service/模块的接口或行为），MUST 执行 `/knowledge-maintain`，并在任务
  最终稳定状态完成一次 AOCI 收尾（`aoci verify` → `aoci_maintain`）
- 受管理对象发生变化时，MUST 在收尾处理 AOCI；机器签发候选时按批次**一次提交整批**，不得截取、
  不得因单请求上限缩减 Managed Scope
- 引入新功能 / 改架构 / 选技术 / 不可逆变更前，MUST 执行 `/decision-support`
- 新增决策时，MUST 在 `knowledge/decisions.md` **末尾追加**条目，并在 `knowledge/decisions-index.md`
  补一行（检查会校验二者的数量、顺序、日期与标题一致）
- 对象事实 MUST 写在 AOCI：新增、删除或改名的受管理对象，不得只在 prose 里补一段描述
- 删除代码后，MUST 清理引用它的 `related_code` 模块与文档（检查会因模块匹配不到文件而失败），
  并在 AOCI 收尾时处理孤儿条目
- 冷仓新增、搬动或删除文件后，MUST 同步 `knowledge/INDEX.md`（检查会因漏登记或死链而失败）
- 机器签发的语义批次无法在本次 run 内完成时，MUST 把机器事实写进 `.agent/state.md`（批次身份、
  `total_targets` / `remaining`、阻塞原因、工具给出的 `next_commands`）：**写不进去允许，不报告不允许**。
  在 Volumes v1 上 `aoci_report`、`remove-entry` 与 CLI 的旧维护子命令一律报 `volume_read_only`，
  唯一可写的路径是 `aoci_maintain` → 按它返回的 candidate / batch 用 `aoci_update_entry` 提交
- 修改本文件时 MUST 保留 `<!-- aoci:begin -->` 与 `<!-- aoci:end -->` 区块**原样**（该区块由 AOCI
  工具维护，手改会在下次接入时被覆盖）

## SHOULD (强烈建议)

- 新会话首次进入项目时，SHOULD 按上面「开场三件事」取用（而非执行 `/context-bootstrap`）
- 跨 agent 拆任务时 SHOULD 先读 `.agent/owners.md`
- `.agent/state.md` 的 Last Updated 超过 14 天时，SHOULD 执行 `/knowledge-verify`
- 只需要某个对象的确切认知时，SHOULD 用 `aoci_get_entries` 定向取，不重传 Whole-Index
- 进入真正的主要阶段时 SHOULD 声明 `phase_transition`；稳定检查点可用 `aoci_overview check_only`
  取机器语义计数

## NEVER

- NEVER 修改或重排 `knowledge/decisions.md` 里已存在的条目。改变主意 = 追加新条目 + 在索引里把旧条目标为 `superseded by DEC-0xx`
- NEVER 把 git 提交哈希写进热层或 `knowledge/wiki/` 的稳定文件；历史属于决策记录与 `knowledge/CHANGELOG.md`
- NEVER 给知识层设字节上限或字节目标（DEC-067）。体积只被报告、不被判定；要收敛的是「放对层了吗」，不是「写短一点」
- NEVER 在 prose 里复述某个对象的契约、约束或行为（那是 L0 的正文）；prose 只准**指认**对象或指向它
- NEVER 手改 `aoci.txt` / `aoci.meta.txt` / `aoci.code.txt` / `.aoci/` 白名单资产来「修」漂移；一律走 AOCI 自己的 Plan 与 Transaction
- NEVER 修改 `knowledge/inbox/*/raw.md` 的正文。原话只增不改：改一个字封存摘要就失败，`--capture-seal` 也会拒绝重签。要修订 = 另起一张 capture，旧的 `triage.md` 指过去
- NEVER 在 `memory/` 中重复记录热层或 AOCI 已覆盖的架构知识

### Implicit Knowledge Filter

只记录同时通过三关的知识：代码藏不住它？将来的改动会受益？它解释 **why** 而不是 **what**？
三关不全过的事实不写；只描述 `what` 的文档应当删除而不是更新；简单改动不写文档。

## 认知系统在哪

- 三层、缝判据、L0 的用法与收尾纪律：`.agent/README.md`
- 冷仓索引：`knowledge/INDEX.md`；目录归属：`knowledge/wiki/guides/repository-layout.md`
- 机器强制：`scripts/check-knowledge/check_knowledge.py`（九项检查）在 pre-commit 与 `Knowledge` CI
  运行，管 prose 层与认知层的**接线**；L0 的内容绑定由 `aoci check` / `aoci verify` 看管。两套检查
  各管一层，互不替代

## Development

For small tasks:
act directly.

For high-impact changes:
consider architecture,
trade-offs,
and project history.

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues (repo `CandideEgo/Speaking-`), via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles map 1:1 to label strings of the same name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` (includes domain terms) + `knowledge/adr/` at the repo root. See `docs/agents/domain.md`.


<!-- aoci:begin -->
## AOCI 仓库认知

AOCI 为本仓库维护一个稳定、可版本化、可增量更新的仓库级认知层，供模型跨任务复用对系统的理解。

`aoci.txt` 是面向模型的结构化认知索引。它以每个受管理文件、数据库表或其他受管理对象一条独立 Entry 的方式，用符号标签与 F/R/A/S 语义表达对象的核心职责、重要关系、对外契约，以及理解或修改系统时必须知道的非显然约束和设计决策。

Header、目录段和全部 Entry 共同组成完整仓库索引，可以覆盖前端、后端、配置、数据库结构及其他受管理内容。受管理内容发生变化时，通常只需维护受影响的认知条目，不需要重新生成整个索引。

AOCI 提供系统架构、对象职责、重要关系、对外契约和关键约束的高密度视图。

### 工作原理

AOCI 采用“模型生成、模型读取”的认知闭环。

Header、Entry 和 Curation 语义的创作只按当前机器签发的 Plan 与实时 Guide 执行；由 Host 模型基于当前绑定证据独立完成。

Entry 的语义必须来自模型对真实证据的理解。不得仅依据路径、文件名、扩展名、AST、符号列表、依赖扫描、正则、固定模板或规则引擎推导、预填、拼接或改写索引语义。

对 Fresh Bootstrap，只按当前机器签发的 Plan 和实时 Guide 执行。当它们要求创作时，Host 模型创作 Root、Meta、Tag 和 F/R/A/S，提供 authoring-run 声明，并把它绑定到 Plan、Evidence 与完整 Candidate。不得要求 AOCI 填写 `origin=host_model`、制造 Receipt 或把程序生成的 Framework 当作语义。本文件不自行重建 Onboarding 流程。内部批次不是用户决策；只有遇到既有批准边界或真实的安全、漂移、CAS、Recovery 条件才停止。

### 最小使用入口

- `aoci_rules`：取得当前AOCI版本的会话运行合同。
- `aoci_overview`：建立或恢复本仓库的完整认知。
- `aoci_maintain`：受管理对象达到最终稳定状态后检查认知是否需要维护。
- `aoci_update_entry`：提交与当前证据和源码摘要绑定的完整语义更新批次。
- `aoci_report`：仅当当前布局和工具状态支持时，在证据不足、无法可靠生成语义时登记待办，不猜写。

其他MCP工具、CLI命令、参数和专项流程，以当前工具说明、Guide和 `--help` 返回内容为准，不在本文件中重复完整手册。

本区块只规定仓库接入、认知使用和收尾原则。`aoci_rules` 承载当前会话合同，Guide实时输出承载当前Plan的执行顺序与停点，工具Schema、Spec和Validator承载机器结构与判据；Prompt、Description、README和静态文档不能覆盖这些机器事实。

### 建立、生成和恢复认知

1. 每个新的 Agent Run 开始时，应先判断：

   - 本仓库是否已经存在可用的完整AOCI索引；
   - 当前上下文中是否已有与本仓库根、当前索引版本和当前AOCI服务相匹配，并且模型仍可可靠使用的完整仓库认知。

2. 仓库已经存在可用的完整索引，但当前Run没有可靠完整认知时，先调用 `aoci_rules`，再调用 `aoci_overview`。

   完整认知仍可靠时直接复用。局部不确定本身不要求机械重读系统全貌。

   本Run从已知Host上下文压缩恢复时（包括宿主注入的压缩摘要），必须把此前模型认知视为不可靠。压缩handoff不得保留或摘要正式Whole-Index，也不得保留或摘要任何Overview Header、Entry、Chunk、Challenge或Attestation正文；只能保留安全续接所需的receipt身份、未完成write或Recovery状态，以及立即重载指令。复制进handoff的Whole-Index语义或receipt不能证明恢复后模型的当前认知可靠。若当前上下文已无法可靠保留运行合同，先调用 `aoci_rules`。继续业务任务前，使用 `refresh_reasons=["context_compaction"]` 和新的 `refresh_event_id` 调用普通完整Whole-Index `aoci_overview`（不设置 `check_only` 或设为false）；不得使用 `check_only` 或认知probe。原样跟随每个 `next_cursor` 直到 `completed=true`，确认交付，并且只基于新交付正文提交一次Attestation。完成这次新的完整传输后，即使Attestation为partial或fail也消费该generation，并按既有合同继续source-bound任务，不再自动调用第二次Overview。

   AOCI可以针对 `context_compaction`、项目 `cognition_refresh_threshold` 下的机器 `semantic_threshold` 或主要 `phase_transition` 提供checkpoint与认知状态事实。只需要这些紧凑事实时使用 `check_only=true`；这些事实只向Agent提供建议，不替模型决定是否需要系统全貌。

   Agent显式调用普通 `aoci_overview`（未设置 `check_only` 或为false）时，只要能形成一致的CognitionSet，AOCI必须完整交付请求scope。不得因为已有receipt、阈值未达到或没有待处理刷新原因而抑制正文。正式认知Dirty或Stale时仍交付正文，但必须标记不可靠。存在未决恢复或无法形成一致snapshot时失败关闭，不返回混合正文。

   普通Overview返回 `continuation_required=true` 时，必须原样提交 `next_cursor` 并自动继续到 `completed=true`。不得询问用户、开始业务任务或给出阶段性系统结论。Host截断、缺块、重复、乱序、cursor失败、Index变化或`chunk_tokens`变化时停止本次认知链。Attestation完成前不得用Memory、源码、Spec、`aoci.txt`、历史会话、scope、search或Entry读取修补或补充Whole-Index认知。Challenge ordinal是正式Entry序列中的1-based位置；Header内容、注释、空行、Section/Overview/Chunk Marker、Receipt与Metadata均不计数，Chunk Receipt ordinal使用同一序列。Attestation必须原样回绑本次Challenge发布的当前`index_sha256`、`entry_sequence_sha256`与`entry_count`；旧Index、旧Entry序列、旧数量或旧Attestation均无效。完整链结束后只正式提交一次既有模型认知Attestation；同一响应只允许一次不改变语义答案的JSON Schema或字段格式修正。对象、Tag或F不匹配即失败且认知吸收不确定，不得语义重试或旁路补答。首次认知失败时还不得执行Root/Meta、Migration、全局布局或其他未重新绑定的系统级决策。上下文压缩刷新若传输完整、认知身份不变、治理对齐且没有Recovery或第三方冲突，即使Attestation为partial或fail也消耗该refresh generation，并继续原任务，不再自动重读Overview。`system_mastery_percent`只自评系统框架——架构、职责、强关系、稳定外部契约以及高熵安全和维护约束——不表示完整实现或运行实况知识；机器索引覆盖率必须分开。默认只向用户输出由本次真实覆盖率、Challenge、块数、Token和掌握度生成的规定成功或失败一句话。Host截断时提示用户把 `overview_delivery.chunk_tokens` 设置为更小的合法值后重新开始，不得自动修改。

   加法认知等级必须与严格证明字段分开解释。`delivery_verified`表示已加载Index且Host交付已确认，但完整认知验证仍未完成；应表达为“已加载且交付已验证”，不得描述为“没有认知”或“没有理解系统”。`cognition_verified`要求Attestation通过（Challenge至少80%的ordinal完全正确且对象身份至多失手一处），`cognition_governed`还要求治理对齐。通用完整读取失败句只用于真实交付故障。

   当Overview响应包含可选`cognition-state/v2`投影时，必须分别解释各维度。其Level止于`model_cognition_usable`；`strict_attestation_verified`、`governance_aligned`与`current_system_cognition_reliable`都是独立状态，绝不参与该Level。ordinal、对象身份、Tag或核心F不匹配可以导致严格Attestation失败，而模型认知仍然可用；不得仅凭这种不匹配就宣称模型没有理解系统。只有`current_system_cognition_reliable=true`允许无保留地声称当前完整系统认知可靠。投影缺失时继续使用上述Legacy解释。

   普通的只读审计、分析、检查、不修改代码或不提交、不push，不自动等于严格零写入，也不改变上述认知有效性判断。Codex Memory和历史Skill只能辅助恢复经验、用户偏好与调查方向，不能替代与当前仓库根、索引摘要、AOCI服务身份和认知范围匹配的当前认知收据；项目AGENTS和当前AOCI身份在AOCI状态上优先于历史Memory。

   只有用户明确禁止Ledger、元数据、`.aoci`运行资产及任何文件写入时，才按严格零写入处理。若必要的认知建立与该边界冲突，必须报告冲突并请求用户裁决或建议使用隔离副本，不得静默以Memory替代当前仓库认知。

3. 仓库没有可用的完整索引，或当前只有最小骨架、Header不完整、Entries未完成、必要Curation尚未裁决时，如果需要建立正式完整AOCI索引，先取得 `aoci_rules`，然后进入当前AOCI Guide。由Guide依据仓库真实状态决定下一阶段并完成必要安全步骤。

   `aoci_maintain` 不替代索引建立流程。

   不在本文件中自行重建或硬编码完整索引生成状态机。

4. 在长程任务中，模型负责保留当前认知收据并正确使用刷新门禁：

   - Host报告上下文压缩或模型已知系统全貌丢失时，执行上述强制 `context_compaction` 重载规则；AOCI不能自行推断Host事件；
   - 进入真正的主要阶段时声明 `phase_transition`，不得把函数、测试运行或小步骤当作阶段；
   - 在有用的稳定检查点通过 `check_only=true` 取得机器语义计数；
   - 除已知压缩的强制重载外，由Agent判断当前任务是否需要再次显式获取指定scope或完整Overview；
   - 在维护和对齐完成前，保留AOCI报告的Dirty或Stale可靠性状态。

### 任务收尾与认知维护

5. 纯只读问答、分析、版本核验，或没有产生受AOCI管理对象变化的任务，不需要调用维护工具。当前AOCI版本是任意`aoci_overview` check_only或`aoci_maintain`响应里的`cognition_receipt.mcp_service_version`；二进制路径是项目`.mcp.json`里的`command`，CLI不必在PATH上。

6. 发生受AOCI管理对象变化时，待其达到本次任务的最终稳定状态后，只调用一次 `aoci_maintain`。不要在每次中间修改后逐文件维护。

7. 若维护结果返回真实语义候选，Host 模型必须基于每个候选绑定的对象和必要证据，独立创作完整标签与F/R/A/S更新。通过 `aoci_update_entry` 一次提交当前机器签发批次的完整候选集合，同时原样保留每项 `source_sha256`、`candidate_id` 与对应domain批次身份。`max_entries`只限制单次请求和原子事务，不限制logical plan、Whole-Index或Managed Scope。`remaining`非零时，在当前批次成功Apply后重新调用Maintain并从新preimage继续；绝不能为满足transport上限缩减Index覆盖或自行截取返回批次。

   没有足够证据且当前布局支持 `aoci_report` 时，使用它而不猜测、套用模板或为消除待办而生成缺乏证据的认知。

8. 必须遵守工具返回的结构化状态和安全边界：

   - `repair_required`：只修复明确命中的候选，再重新提交当前机器签发的完整批次；
   - `stopped`：结束当前写入尝试并检查 `failed_step`、错误、正式写入证据与Recovery。auto模式下，已证明零写入则记录closure并重新Plan；完整Intent和可证明postimage则Resume；策略要求Rollback且preimage可证明则精确恢复后重新Plan。只有证据不足、第三方正式字节冲突、需要审批或外部动作，或命中其他真实安全边界时，才停止整个用户任务；
   - 冲突、审批、人工裁决、权限和安全信号不得忽略；
   - 已经对齐后不得重复维护或重复写入；`refresh_ready_for_overview` 是checkpoint事实，由Agent决定是否为下一阶段请求普通完整Overview。

   维护完成后如果又修改了任何受管理对象，之前的维护结果失效，应在新的最终稳定状态重新完成收尾。

9. 用户只限制业务文件范围，但没有明确禁止仓库托管资产时，AOCI托管资产可以在收尾阶段为保持认知一致而更新，并应在审计和提交中与业务文件区分。

   用户明确禁止修改 `aoci.txt`、`.aoci`、元数据或任何额外文件时，以用户限制为准，不得写入，并如实报告剩余不一致。

### 专项流程

初始化、完整索引生成、Header生成、Entries生成、数据库结构索引、Curation、人工评审和故障恢复，只按当前AOCI Guide或工具在对应阶段返回的指令、命令和安全停点执行。

不预加载、不猜测，也不自行重建这些专项流程。平台调用方式、请求格式、批次上限、审批规则、索引格式细节和恢复步骤由对应Guide、工具说明、模型Prompt和CLI帮助按需提供。
<!-- aoci:end -->
