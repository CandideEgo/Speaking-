---
name: spec-flow
description: "从想法、澄清、方案、实施计划到切片执行的通用 WorkItem 工作流。"
disable-model-invocation: true
---

# Spec Flow

把跨会话工作从聊天记忆搬到可恢复的外部状态。总纲、阶段文件和切片保存意图与证据；GitHub
Issues 保存认领、阻塞边、PR 和关闭事实。一个执行会话只完成一张切片。

## 进入任何子命令前

1. 读 `AGENTS.md`、`.agent/invariants.md` 和 `.agent/state.md` 的当前焦点（T0）。
2. 找到 WorkItem 后只读 `knowledge/work/<W-ID>/README.md` 的结果、阶段地图、切片地图和当前
   前沿（T1）。
3. 只打开当前阶段或当前切片（T2）；再按它的指针打开 owner row、契约和少量实现文件（T3）。
4. 需要模板、状态语义或唯一归属时读
   [`knowledge/work/README.md`](../../../knowledge/work/README.md)，不要从聊天历史重建规则。
5. 需要修改 WorkItem 结构时调用 helper：
   `python scripts/spec-flow/spec_flow.py ...`。不要手写可机械维护的 ID、审批字段或索引行。

## 命令

### `/spec-flow new <title>`

1. 如果输入是口播或大段原始想法，先走 intake：原话逐字封存到 `knowledge/inbox/`，取得
   `capture#Sxx`。
2. 运行：
   `python scripts/spec-flow/spec_flow.py new "<title>" --source <capture-or-path>`。
3. 只创建 WorkItem `README.md` 与 `intent.md`；不提前建 research、solution、plan 或 Issue。
4. 打开 `intent.md`，把问题、期望结果、成功判据、约束和非目标写到可读状态。仍然存在高影响
   歧义时保持 `intake` 或进入 `clarifying`。

### `/spec-flow clarify <W-ID>`

1. 只读总纲、`intent.md` 和已有的 `research.md`。
2. 找会改变范围、接口、数据、验收或回退方式的问题；每轮最多问三个，并说明答案会改变什么。
3. 把已答问题、未答问题和结论写入 `research.md`。首次进入时创建该文件。
4. 无关或可延后的分歧写成明确 defer；不能用沉默跳过。
5. 所有高影响未知项收敛后，用 helper 把根状态标为 `solution_review`。

### `/spec-flow research <W-ID>`

1. 优先查代码、配置、测试和已有决策；需要外部事实时使用 Tavily，并把来源 URL 与日期写入
   `research.md`。
2. 只记录会影响方案的事实、证据和反例，不把搜索摘要堆成资料库。
3. 研究揭示新的产品选择时，转入 `clarify` 或调用 `decision-support`；不要把未决策包装成实施细节。

### `/spec-flow solution <W-ID>`

1. 确认 `research.md` 没有阻塞方案的高影响未知项。
2. 创建或更新 `solution.md`：选定方案、备选方案及被否原因、接口/契约、数据流、失败路径、
   可观察验收、风险和回退方式。
3. 真正有权衡的选择先追加 `DEC-xxx`，方案只链接决策 ID，不复制决策正文。
4. 将 solution 状态置为 `review`，根状态置为 `solution_review`，停止等待人工确认；不得自行批准。

### `/spec-flow approve <W-ID> <solution|plan>`

1. 只有用户明确确认该阶段内容后才能执行。
2. 调 helper：`approve <W-ID> <phase> --by <identity>`。
3. `solution` 闸门后调用 `issue-sync <W-ID> --stage solution --apply`，创建父 Issue 并写审批评论。
4. `plan` 闸门后调用 `issue-sync <W-ID> --stage plan --apply`，创建子 Issue、原生 `blocked_by` 边
   和父 Issue 任务表。
5. 如果 `gh` 或网络不可用，保留本地审批但把 `sync_state` 留为 `pending`；`run` 必须停住。

### `/spec-flow plan <W-ID>`

1. 只读总纲、intent、research 和已确认的 solution；不读全部候选实现文件。
2. 创建或更新 `plan.md`：执行顺序、切片表、依赖、迁移/发布、测试策略、证据与回滚。
3. 为每个切片创建 `slices/Sxx-*.md`。切片必须窄而完整、可单独演示、单会话可完成；宽重构按
   expand-contract 批量切分。
4. 把 plan 状态置为 `review`，根状态置为 `plan_review`，停止等待人工确认；不得自行批准。

### `/spec-flow run <W-ID> <Sxx>`

1. 读取总纲切片表，选择用户指定的一张切片；没有指定时只推荐 frontier 第一张并等待确认。
2. 调 `issue-state` 校验：父 Issue 和子 Issue 存在、`sync_state: synced`、子 Issue 打开、无 open
   blocker、无 assignee、依赖切片已完成。任一不成立就停止，不绕过 Issue 直接开工。
3. 用 `gh issue edit <n> --add-assignee @me` 先认领；认领是本会话第一次写操作。
4. 只读该切片列出的 T2/T3 上下文。按 `tdd` 的优先顺序实现，运行切片要求的定向检查和完整相关
   门禁；不能运行的检查写“未执行”及原因。
5. 用 `code-review` 审查本次 diff 与契约；发现新问题时先判断新切片、现有切片子步骤或明确 defer。
6. 把实际结果、证据、决策指针和新发现写回切片；没有证据最多写 `verifying`。
7. 更新总纲的切片快照、当前前沿和效果仪表盘，更新 `.agent/state.md`，最后才关闭子 Issue。

### `/spec-flow status <W-ID>`

用本文件显示：当前阶段、两个审批、Issue 映射、ready/in-progress/blocked/deferred、效果指标和
下一步。再调 `issue-state` 比较 GitHub 事实；本地快照落后时明确报告漂移，不静默改写。

### `/spec-flow sync <W-ID>`

1. 调 `issue-state` 读取 GitHub 的父/子 Issue、assignee、状态和依赖。
2. 只在证据已经写入切片后把本地切片状态同步为 `done`；Issue 关闭不能替代证据。
3. 更新总纲快照、`.agent/state.md` 和 `sync_state`。发现冲突时保留 GitHub 事实并报告人工裁决点。

### `/spec-flow close <W-ID>`

只有全部非 cancelled 切片为 `done`，或 deferred 切片都有原因、负责人和复议条件时才能收口。
更新效果仪表盘与收敛证据，追加必要的 knowledge-maintain 收尾，关闭父 Issue，并把 WorkItem
状态置为 `done`。

## 停止条件

- 人工闸门没有明确确认；模型不能替用户写 `approved_by`。
- 上游已确认文件被实质修改，但下游仍是 approved；先把下游标为 stale 并重新审批。
- GitHub 不可用、Issue 缺失、切片已被认领或有 open blocker；此时不执行切片。
- 一张切片需要多个可独立验收的结果；拆成新切片，不把会话撑大。
- 发现的问题没有家；当场写成新切片、现有切片子步骤或带复议条件的 defer。

## 不做

- 不建本地 Issue 队列、不维护第二套 frontier、不自动持续运行。
- 不把对象契约、决策正文或完整研究资料复制进总纲和切片。
- 不为了让检查变绿而手改机器资产、检查器或基线。
