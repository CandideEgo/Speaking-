# ADR-0021: 规则层降本 —— AOCI 降为按需检索、规则就近分层

- **Status**: Accepted - 2026-10-12

## Context

触发点不是"架构不好看"，而是三条可数的读数同时成立：

1. **每会话的固定成本很高。** `AGENTS.md` 的「开场三件事」要求每会话先 `aoci_rules` 再全量
   `aoci_overview`。当前 `aoci.code.txt` 是 490,998 字节 / 1008 行 / 742 条，一次全量交付约
   164k tokens、14 块、10 题 Challenge。
2. **这份成本买到的是打折认知。** 同一时刻 `aoci check` 的 `governance_aligned=false`
   （`cognition_state=invalid`、`cognition_currency=dirty_or_stale`），按本仓规则不得声称它描述
   今天的代码。而不可对齐的残留在 `.agent/state.md` 已记明：一个机器**不签发**的本地文件
   （`.claude/settings.local.json`，git 未跟踪），而 `aoci_maintain` 是唯一合法写入路径。
3. **贵的地方不是门禁。** `check_knowledge.py` 是纯 stdlib 的九项检查，`knowledge.yml` 自述约
   1 秒；pre-commit 的 knowledge 钩子同量级。它们只拦新增，成本极低（DEC-067 的口径）。

而真正的重活压在 review 上：`.agent/invariants.md` 25 条 INV 的强制分布是
**2 项机器检查、12 个测试套、1 个已知缺口、11 条仅评审**，而 `AGENTS.md` 的 MUST 节把它们统称
「强制执行」——声明强于事实。

**参照物。** 用户下载了 `MoonshotAI/kimi-code` 的源码，问能否照它的方式维护规则。实测它的机制：
根 `AGENTS.md` 只留热路径 + 9 个按目录就近的 `AGENTS.md`（最深的只有一句「先读某文档」）；
`.agents/skills/` 的技能正文自带停止信号与人工检查点；`.agents/skills/review-pr/surfaces.md`
用「人群 / 触发线索 / 历史案例」三节清单校准 review；门禁只有三个小脚本加一条 PR 标题正则。

它敢于在根文件里写「除非用户明确要求，不要为了理解实现去读普通 Markdown」，是因为**有替代物
接住了「对象事实」这个岗位**：1003 个测试文件、21 个有测试守护的契约/manifest 文件
（`config-manifest.toml`、`wire-manifest.d.ts`、`state-manifest.d.ts`、服务端 API 快照等）、
每个包一次全量 typecheck。本仓的对应物只有 pytest 60% 覆盖率门、51 行 mypy 基线与 12 个测试套。
**差距在替代物，不在文档质量。**

另一件事实决定了本条的形态：**热加载已经存在**。`CLAUDE.md` 指向 `AGENTS.md`，宿主在会话开始
即加载它。缺的不是加载机制，而是**内容归属**。

## Decision

选 **B：保留对象语义，换掉围绕它的仪式与层次**。五条：

1. **AOCI 降为按需检索。** 只读问答、查文件、解释代码走 `aoci_search` / `aoci_get_entries`
   定向取；只有「重建或恢复系统全貌」「需要系统级判断」才走 `aoci_rules` → 全量 `aoci_overview`。
2. **规则就近分层。** 新建 `backend/AGENTS.md` 承接后端专属操作约束，根文件只留路由与跨域约束。
   `frontend/AGENTS.md` 是 `next dev` 生成物，**不手改**。
3. **门禁减重。** `ci.yml` 的 backend / frontend / e2e 三个 job 各加自己的 `paths`；
   `AGENTS.md` 的 MUST 节把机器强制与评审强制分开写。
4. **技能补停止信号。** 6 个技能各补 `## Stop Signals`。
5. **新增复盘回填清单。** 三节结构（人群 / 触发线索 / 历史案例），并把「回归复盘后回填」
   写成一条动作。

**不删语义**：不减少受管理对象，不把「代码是唯一真相」当作已经成立的前提。执行序列见
`knowledge/plans/规则层重构-B-落地序列-2026-10.md`。

## Consequences

- **收益**：会话开场成本从「全量索引」降到「`AGENTS.md` + `state.md`」；后端任务的上下文噪音
  下降；11 条仅评审的不变量第一次有了「谁在依赖」的清单可查；MUST 措辞与强制事实对齐。
- **代价与风险**：① **按需检索有盲区** —— 模型不知道自己不知道时不会去查，这是本条最真实的
  风险，缓解是开场读 `state.md` 与触及未知模块时定向查，而不是退回全量读；② **双切法** ——
  目录就近与对象就近是两套切法，边界不写明同一事实会进两个家；③ **本轮达不成 R0** ——
  治理残留是一个机器不签发、git 未跟踪的本地文件，按合同不重复 `maintain`、不手改 `.aoci`
  白名单，阻塞事实留在 `.agent/state.md`；④ 本决策减的是每会话读取成本与声明失真，
  **不减少检查数量**，九项检查与 AOCI 收尾动作都保留。
- **失败判据**：如果 B 执行后会话仍每次读全量索引，说明改的只是文档、没改行为。

## 关联

- `../decisions.md` / `../decisions-index.md`：DEC-076（本条）、DEC-066 / DEC-067 / DEC-072
  （三层分层与体积口径）。
- `knowledge/plans/规则层重构-B-落地序列-2026-10.md`：分片执行序列。
- `.agent/README.md`：分层标准与边界条款（规则正文在热层的唯一性、为什么永不进认知层）。
- `.agent/invariants.md`：25 条不变量及其强制方式的分布。
