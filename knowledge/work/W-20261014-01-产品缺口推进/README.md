---
work_item: W-20261014-01
title: 产品缺口 P0+P1 收口
status: solution_review
created: 2026-10-14
updated: 2026-10-14
sources: [knowledge/plans/产品缺口-2026-10.md, knowledge/plans/产品缺口实施方案-2026-10.md]
parent_issue: null
sync_state: pending
---

# W-20261014-01 — 产品缺口 P0+P1 收口

> 目的：把「代码已落」推进到「发布前可验证、可关闭、可交接」。
> 来源：[产品缺口总结](../../plans/产品缺口-2026-10.md) · [产品缺口实施方案](../../plans/产品缺口实施方案-2026-10.md)
> 执行队列：GitHub Issues（DEC-065）；认领、阻塞边、关闭不在本文件维护。
> 协议：[Spec Flow](../../wiki/guides/spec-workstreams.md)（DEC-091，扩展 DEC-090）。
> 当前前沿：**未过 solution / plan 闸门**；批准前不创建 Issue、不认领切片。
> 最后同步：2026-10-14。

> 迁移说明：这是第一个 Spec Flow WorkItem。历史方案已经实施，但迁移没有伪造人工审批；
> 根状态因此诚实停在第一道闸门 `solution_review`。用户确认映射后依次批准 solution、plan，
> helper 才会创建父子 Issue 并把 `sync_state` 置 `synced`；在那之前任何切片都不可开工。

---

## 0. 阶段地图

| 阶段 | 产物 | 状态 | 审批 | 说明 |
|---|---|---|---|---|
| Intent | [intent.md](intent.md) | final | — | 保留原始目标、边界和完成判据 |
| Research | [research.md](research.md) | closed | — | 归集已核实事实、开放项和迁移依据 |
| Solution | [solution.md](solution.md) | review | 待确认 | 历史方案已实施，但迁移审批仍需显式确认 |
| Plan | [plan.md](plan.md) | review | 待确认 | S01–S05 的切片、依赖和验收 |
| Execution | `slices/S01`–`S05` | specified | — | 两道闸门确认后创建 GitHub 父子 Issue |

---

## 1. 结果与边界

**可观察结果**：P0 三项与 P1 八项的代码、决策和知识记录已经落地；发布前所有服务依赖
验收有明确结果，前端验收载体有唯一选择，未做的产品和结构项都有决策或挂起条件。

**本轮范围**：

- 服务环境验收：三条迁移、注销清理、导出包、Redis 广播、完整后端门禁、真实媒体 e2e；
- 前端验收载体：决定补 RTL/jsdom 组件测试，还是把对应行为交给带服务 e2e；
- 对象认知回填：机器卷范围复核与新建对象的认知条目；
- 后续决策：站外提醒、考试目标叙事、内测权益迁移、内测运营、结构性 P2；
- 发布后兼容清理：`/auth/sms/register` 与旧 `purpose` 的退场。

**明确不做**：

- 本轮不补听力数据链路，不新增词汇搜索，不做站外提醒；
- P2 结构性改造不在本轮直接开工，只产出决策或独立计划；
- 不把本机 SQLite / fake Redis 的结果写成服务环境通过证明。

**完成判据**：

1. S01 的六类服务验收全部有结果，或明确记录环境阻塞与继续条件；
2. S02 的前端验收载体已拍板，方案要求的六类行为都有对应覆盖；
3. S03 的机器状态收敛或明确列出人工裁决范围，不静默宣称对齐；
4. S04 的延后项各有决策或明确的复议条件；
5. S05 在正式发布满一个周期后完成兼容清理，或重新决定保留。

---

## 2. 切片地图

状态是 2026-10-14 的快照；Issue 号在创建时回填。

| ID | 切片 | 产出 | 依赖 | 状态 | Issue | 证据 | 决策 |
|---|---|---|---|---|---|---|---|
| S01 | [服务环境验收](slices/S01-service-env-acceptance.md) | 六类服务依赖验收结果 | Docker daemon / 可用后端 venv / 真实媒体 | blocked | TBD | 待补 | DEC-081~089 |
| S02 | [前端测试载体](slices/S02-frontend-test-harness.md) | 组件级测试或 e2e 覆盖的唯一方案 | 无 | ready | TBD | 待补 | 待拍板 |
| S03 | [对象认知回填](slices/S03-cognition-backfill.md) | 新对象认知条目或未对齐裁决 | 人工复核托管范围 | blocked | TBD | 待补 | DEC-072 / DEC-076 / DEC-077 |
| S04 | [延后产品决策](slices/S04-deferred-product-decisions.md) | 每个延后项的决策或复议条件 | 产品负责人 | ready | TBD | 待补 | 待补 |
| S05 | [发布后兼容清理](slices/S05-post-release-cleanup.md) | 旧认证兼容面退场 | 正式发布满一个周期 | deferred | TBD | 待补 | DEC-081 |

---

## 3. 当前前沿

**闸门前（当前）**

- `solution.md` 与 `plan.md` 都在 `review`，没有任何 `approved_by`。这不是环境阻塞，而是等待人工
  确认迁移映射——不得用伪造审批把它变绿。
- 批准顺序固定：先 solution（父 Issue 在这一步创建），再 plan（子 Issue、依赖边和父任务表在
  这一步创建）。任一闸门未过，`/spec-flow run` 都会停住。

**Ready（闸门通过后）**

- **S02**：本机无服务也能推进，先做“补 RTL/jsdom 组件测试”与“交给 e2e”的成本比较。
- **S04**：可以在任意会话把延后项拆成决策包，不需要服务环境；每个决策完成后更新本表。

**Blocked**

- **S01**：Docker CLI/Compose 已安装，但 Docker daemon 未运行；后端 `.venv` 当前指向不存在的
  Python 3.12。先修环境，再从迁移开始按顺序验收。
- **S03**：对象认知机器状态仍为「未对齐」，需要人工先复核托管范围和孤儿条目。

**Deferred**

- **S05**：必须等正式发布满一个周期，不能用当前开发期调用量代替生产调用量。

**推荐下一步**：先由人工确认本 WorkItem 的历史映射并批准 solution，再批准 plan；闸门通过后
从 S02 开始认领本机可完成的验收缺口，同时由人工启动 Docker Desktop 并修复后端 venv，
再解除 S01 阻塞。

---

## 4. 效果仪表盘

| 指标 | 基线 | 目标 | 当前 | 证据 |
|---|---:|---:|---:|---|
| 服务依赖验收项 | 0 / 6 | 6 / 6 有结果 | 0 / 6 | S01 待补 |
| 前端方案验收项 | 0 / 6 有明确载体 | 6 / 6 有载体 | 0 / 6 | S02 待补 |
| 对象认知状态 | 未对齐 | aligned 或明确未收敛 | 未对齐 | S03 待补 |
| 延后产品项 | 0 / 6 有决策或复议条件 | 6 / 6 | 0 / 6 | S04 待补 |
| 认证兼容面 | 2 个旧入口/参数族 | 发布周期后移除 | 保留 | S05 待补 |

这里的数字只表示“是否已有结果”，不表示服务环境已经通过。

---

## 5. 上下文顺序

- **T0**：`AGENTS.md`、[.agent/invariants.md](../../../.agent/invariants.md)、
  [.agent/state.md](../../../.agent/state.md) 的当前焦点；
- **T1**：本文件的 §1–§4；
- **T2**：当前切片的全文；
- **T3**：切片列出的 owner row、契约和少量实现文件。

不要在本工作流里预读全部 `knowledge/`；需要事实时从本文件或
[knowledge/INDEX.md](../../INDEX.md) 按需打开。

---

## 6. 收敛规则

- 一张切片完成 = 验收通过 + 证据写入切片 + Issue 关闭 + 本表快照更新。
- 发现新问题时，先判断它是新切片、现有切片的子步骤，还是明确的后续；不把问题留在会话总结里。
- 本机跑不了的验收写「待有服务环境执行」，不得写成通过；环境恢复后从 S01 继续。
- 新决策追加到 [decisions.md](../../decisions.md) 并更新
  [decisions-index.md](../../decisions-index.md)；对象事实由对象认知流程处理。
- 任何“已完成”的说法必须能追溯到切片里的证据，或明确标注为未在本机验证。
