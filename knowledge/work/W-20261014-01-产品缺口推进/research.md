---
phase: research
status: closed
revision: 1
---

# Research — 迁移与推进依据

> WorkItem：`W-20261014-01`

## 已核实事实

- `knowledge/plans/产品缺口实施方案-2026-10.md` 要求的 P0 三项与 P1 八项已经落地；DEC-081~089
  记录对应取舍。
- 本机缺少可用的 Postgres、Redis、后端解释器和真实媒体，因此迁移、Celery、Redis 广播和 e2e
  不能在本机宣称通过。
- 前端 Vitest 当前是 node 环境；方案要求的部分组件行为没有确定的测试载体。
- 对象认知机器状态尚未对齐；新增和删除对象的范围需要单独复核，不能靠手改机器卷解决。
- DEC-065 已确定 GitHub Issues 承担认领、阻塞边和关闭；DEC-090 已建立总纲+切片，但没有定义
  「意图 → 研究 → 方案 → 计划」的完整状态机。

## 迁移结论

- 前身是两份方案文件 `knowledge/plans/产品缺口-2026-10.md` 与
  `knowledge/plans/产品缺口实施方案-2026-10.md`；迁移保留了原方案的 P0/P1 边界，并据此切出
  S01–S05。仓库里没有旧式 `plans/<initiative>/` 目录可搬，这些文件继续留在 `plans/`。
- 历史实施方案已落地，但仓库没有可核验的 `approved_by/approved_at` 记录。迁移不补造审批，
  当前停在第一道闸门 `solution_review`，等待一次显式确认。
- 父 Issue 在 solution 批准后由 `spec_flow.py` 创建，子 Issue 与原生依赖边在 plan 批准后创建；
  本机无网络时保留 `sync_state: pending`，执行必须停住。

## 开放项

无阻塞 WorkItem 建立的研究项。后续事实变化进入对应切片，不在这里续写执行日志。
