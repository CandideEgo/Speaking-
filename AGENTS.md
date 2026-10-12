# AGENTS.md

## 工作姿态

- 与用户交流默认使用中文。
- 代码是事实来源；规则、地图和笔记只压缩“下一步该相信什么、该避开什么”。
- 先验证再下结论；跑不了的检查明确写“未执行”，不能写成通过。
- 小任务直接做；高影响改动先理清代价、退路和受影响人群。
- 用户授权只覆盖当前任务，不自动延伸到生产、删除、发布或额外系统。

## 进入任务

1. 读 [`.agent/state.md`](.agent/state.md)：只看当前在飞、下一步和已知坑。
2. 按问题类型打开下面的权威；不要预读整个 `knowledge/`。
3. 项目技能只在任务命中时调用。技能承载流程正文；本文件只做路由，不复制技能步骤。

## 按问题找权威

| 问题 | 权威 | 时机 |
|---|---|---|
| 现在在做什么、下一步、什么坏了 | [`.agent/state.md`](.agent/state.md) | 每次进入项目 |
| 什么规则不能破坏 | [`.agent/invariants.md`](.agent/invariants.md) | 改代码、审 diff 前 |
| 领域词在本仓到底指什么 | [`CONTEXT.md`](CONTEXT.md) | 需要统一产品/领域语言时 |
| 模块如何拼起来、关键数据流是什么 | [`knowledge/system-map.md`](knowledge/system-map.md) | 跨模块改动或不熟悉子系统时 |
| 为什么这样定、放弃了什么 | 从 [`knowledge/decisions-index.md`](knowledge/decisions-index.md) 定位单条决策 | 方案有取舍时 |
| 某个子系统的设计意图和历史教训 | [`knowledge/INDEX.md`](knowledge/INDEX.md) 指向的 architecture / problems | 碰到对应区域或故障模式时 |
| 怎么跑、测、发、排障 | [`knowledge/INDEX.md`](knowledge/INDEX.md) 指向的 guides / operations | 执行对应操作前 |
| 后端本机环境与检查口径 | [`backend/AGENTS.md`](backend/AGENTS.md) | 动 `backend/` 前 |
| 多 agent 分片和契约文件 | [`.agent/owners.md`](.agent/owners.md) | 并行拆分前 |
| 口播、想法收集与分流 | `knowledge/inbox/README.md` 与 intake 技能 | 用户要求“记下来/整理这段想法”时 |

项目技能位于 [`.agents/skills/`](.agents/skills/) 与 [`.claude/skills/`](.claude/skills/)，两份内容保持一致。
是否调用由任务与技能描述决定；不要把技能里的流程抄回本文件。

## 常驻规则

### MUST

- 新功能、架构改变、技术选型或不可逆变更，先使用 `decision-support`，并只在确有取舍时追加决策记录。
- 新决策必须同时追加到 `knowledge/decisions.md` 末尾并更新 `knowledge/decisions-index.md`；旧决策不改写、不重排。
- 冷仓新增、移动或删除文件后，同步 `knowledge/INDEX.md`，让每个入口都可达。
- 写知识前先过三关：代码不能直接说明、未来决策会受益、解释 why 而不是复述 what。
- 一条事实只放一个家；规则、领域词、系统地图、历史记录和技能流程不得互相复制。

### SHOULD

- 跨模块改动后使用 `knowledge-maintain`；超过 14 天未核验或知识可能过期时使用 `knowledge-verify`。
- 审 diff 时使用 [`.agent/invariants.md`](.agent/invariants.md) 的六个必问，并查受影响行为的消费者。
- 需要本地服务、口播整理、复杂决策、项目知识维护等可复用流程时，优先调用对应项目技能。

### NEVER

- 永不修改 `knowledge/inbox/*/raw.md` 的原话；更正只能另起 capture。
- 永不用提交哈希污染热层或稳定 wiki；历史属于决策、changelog 或 archive。
- 永不为了让检查变绿而改检查器、基线或 stamp；先处理真实违规。
- 永不把某个技能的操作步骤展开进本文件；流程变化时改技能这一个家。

## 开发

小改动：理解相关代码与规则后直接实现并验证。

高影响改动：先确认契约、消费者、失败路径和回退方式；实现后运行与风险匹配的检查，并按实际结果更新状态或知识。
