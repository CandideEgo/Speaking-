# Project State

> Forward-looking only. Completed work belongs in `knowledge/decisions-index.md`,
> `knowledge/CHANGELOG.md` or `knowledge/archive/`; this file is a work queue, not a diary.

Last Updated: 2026-10-14

## Current Focus

- **唯一跨会话控制面**是 `knowledge/work/W-20261014-01-产品缺口推进/README.md`（通用入口
  `knowledge/wiki/guides/spec-workstreams.md`，DEC-091）。它没有伪造审批，根状态诚实停在第一道
  闸门 `solution_review`，`parent_issue: null`，`sync_state: pending`；用户确认历史映射后须先批准
  solution、再批准 plan，helper 才会创建父子 Issue。没有确认就停住，也不从 `knowledge/plans/`
  另起执行队列。
- **当前前沿**：S02 与 S04 为 ready；S01 受 Docker daemon / 后端 venv 阻塞；S03 受对象认知
  范围复核阻塞；S05 等正式发布满一个周期。
- **推荐下一步**：先过 Spec Flow 的人工闸门；批准并同步 Issue 后，先做 **S02 前端测试载体**。
- **核心两页代码已落，验收未闭**：W1–W3 / H1–H3 已实现；还剩真实媒体下的 W3 几何校准与
  播放页 e2e。它与 S01 共用服务环境，不能靠估算或静态检查替代。
- **对象认知未对齐**：范围复核与回填由 S03 承接；不得手改机器卷、检查器或基线洗绿。

## Next Steps

1. **确认 WorkItem 迁移**：用户确认历史映射后，按 `spec-flow` 先批准 solution（父 Issue 在此创建）、
   再批准 plan（子 Issue 与依赖边在此创建）并同步；没有确认就停住，不得伪造 `approved_by`。
2. **S02 前端测试载体**：比较 RTL/jsdom 组件测试与 e2e 成本，为六类前端行为选定唯一载体并留证。
3. **S04 延后产品决策**：逐项给出 DEC，或带负责人、复议条件的明确 defer。
4. **解除 S01 环境阻塞**：启动 Docker daemon、修好后端 Python/venv，再按迁移、Celery、导出、
   通知、真实媒体 e2e、完整门禁的顺序验收。
5. **服务恢复后的收尾**：复跑核心两页 W3 的 `--watch-stage-chrome` 校准与播放页 e2e；
   未拿到实测前保持 315px。
6. **S05 发布后清理**：正式发布满一个周期后，用生产调用量决定旧认证兼容面的去留。

## Known Issues

- 本机无可用 Python，后端 `.venv` 指向不存在的解释器；`check_knowledge.py` 与 `spec-flow` helper
  均未执行。`knowledge/INDEX.md` 的 WorkItem 路由区块由人工按 helper 的 `index_rows()` 口径写入，
  环境恢复后应跑 `spec_flow.py reindex` 与 `check_knowledge.py workitems` 复核。
- Docker daemon 未运行；本机无 Postgres / Redis / 真实可播媒体，服务验收与相关 e2e 不能声明通过。
- 前端 Vitest 仍是 node 环境且未装 RTL/jsdom；这是 S02 的待决点。
- 设计系统门禁尚未进 CI；mobile-chrome 尚未进 CI，真机触控 / 播放 / 录音验收仍欠。
