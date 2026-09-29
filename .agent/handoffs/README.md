# Handoffs — 票

> 一个文件一张票。这里的文件是**票**（ticket）：一个可单独验收的垂直切片在 owner 之间的状态
> 转移，对应 `.agent/owners.md` 的切片。**票本身就是状态机**——字段就是状态，系统里没有
> 额外的 state 文件。目录名叫 handoffs 是历史命名（原意是"跨会话上下文传递"，Matt 的
> `/handoff` 那个意思），现在的语义是票，与 `/handoff` 同名异物。

## 票的字段（缝 2 的契约）

| 字段 | 谁写 | 语义 |
|------|------|------|
| `Owner` | planner 建票留空；执行者认领时写 | **认领即锁**：有 Owner 的票不在 frontier 里 |
| `Status` | 执行者 / 验收者 | `dispatched`（待认领）→ `in progress`（已认领）→ `done`（待验收）→ `closed`（已关闭） |
| `Planner acceptance` | planner | 完成判据：什么算 done |
| `Blocked by` | planner | 本票依赖的票文件名；指向 `.agent/handoffs/` 或 `knowledge/archive/handoffs/`；无依赖写「无」 |
| `演示路径` | planner | 完成后能演示什么，一句话；水平切分在这里暴露 |

## 两条纪律（不变）

1. **结论而非推理**。只记决策与结果，不记推理与日志——推理随执行 session 一起死，这是它
   便宜的原因。
2. **契约是双向的**。动了契约文件（`.agent/owners.md` 的 Contract files）就写「契约变更」；
   没动也要写「无」——缺席必须可见。

没有 commit hash（所有权检查）；决策引用写 `DEC-0xx` / `ADR-00xx`，提交引用写主题行与日期。

## 生命周期

1. **建票**（planner，缝 2）。方案按垂直切片切成票：每条窄而完整、单独可演示、能塞进一个
   上下文窗口、预重构先行。填 `Blocked by` / `演示路径` / `Planner acceptance`，
   `Status: dispatched`，`Owner` 留空。
2. **认领**（`/dispatch`，缝 3）。frontier = `Status: dispatched` ∧ 阻塞项全关 ∧ 无 `Owner`
   的票；按依赖序取第一张。认领 = 写 `Owner` + `Status: in progress`。frontier 由
   `check_knowledge.py handoff` 打印，不靠人记。
3. **执行**（执行者）。做完写「已完成 / 契约变更 / 关键决策 / 遗留」，`Status: done`。
4. **验收与关闭**（`/accept`，缝 4）。验收者不能是执行者：机械门 → 只读契约变更与契约文件
   diff → 演示路径核对 → `Status: closed`，`state.md` Recently Completed 记一行，文件移入
   `knowledge/archive/handoffs/`。**关闭/归档才是解锁下游的动作**——没人关票，依赖它的票永远
   不"变可开工"。
5. **归档即已关**。`Blocked by` 指向 `knowledge/archive/handoffs/` 的文件不算死链——归档的票对
   依赖它的人来说就是 done。

## 模板

```markdown
# Handoff: <task id or short slug>

- Owner: <owner name from owners.md；认领前留空>
- Status: dispatched | in progress | done | closed
- Planner acceptance: <what "done" means, written by the planner>
- Blocked by: <handoff 文件名，逗号分隔；无依赖写「无」>
- 演示路径: <完成后我能演示什么，一句话；水平切分在这里暴露>

## 任务
<what this agent must do, one short paragraph>

## 已完成
<bullet: file changed + one-line behaviour change>

## 契约变更
<each contract file: what changed at each end; or "无">

## 关键决策
<only decisions the next agent or reviewer must know; cite DEC/ADR>

## 遗留
<unrun tests, follow-ups for other owners, or "无">
```

存量票（缺 `Blocked by` / `演示路径`）已由 `check_knowledge.py` 的 baseline 接受；新票按本
模板写。同一件事两个家仍然违规——字段语义只住这里，技能不复制它。

## 谁在用

- 建票 / 认领 / 验收关闭：`.claude/skills/dispatch/SKILL.md`、`.claude/skills/accept/SKILL.md`
- 切片纪律与并行约束：`.agent/owners.md`
- 机器校验与 frontier 打印：`scripts/check-knowledge/check_knowledge.py` 的 `handoff` 门
