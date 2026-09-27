---
title: 审计验证的两个失效模式（静态分析基线掩盖运行时故障 / 未验证的高召回审查）
tags: [backend, bug, tooling, anti-pattern]
status: active
confidence: verified
related_code: [backend-services, api-v1, env-config, pytest-suite]
related: [wiki/problems/review-fix-failure-modes.md, .agent/decisions.md]
created: 2026-09-28
updated: 2026-09-28
---

# 审计验证的两个失效模式

共同点——**「检查过了」被读成「检查过了而且没问题」**：一个把静态分析基线当成「已接受无害的债」，
一个把高召回 LLM 审查的原始输出当成结论。两者都让真故障活下来，也都只有同一个解药：回到代码本身
求证。

## 1. 基线里的条目看着像「已接受的债」，实际是待验的运行时风险

**Problem**: `GET /api/v1/videos/search` 长期 500。`services/search_service.py` 引用
`Video.search_vector` 列，而该列在 ORM 模型、Alembic 迁移、开发库三处都不存在，模块 docstring 却
声称它由 PostgreSQL 触发器维护（DEC-059）。同一时刻 `services/search_service.py:attr-defined`
一直躺在 `backend/.mypy-baseline` 里。

**Cause**: 基线的语义是「不许新增」的棘轮，不是「这些都没事」的合格证。这条 baselined 的
`attr-defined` 恰好落在 ORM 属性这种跨模块契约上：编译期已经报过的错被当成已知可接受的债务，没有
人再去看它跑到运行时会怎样。一次 `curl` 就能看见的 500，被一条本来就为降噪而存在的记录挡住了视线。

**Solution**: 按 DEC-059 改为方言感知的内联 tsvector（PostgreSQL 内联构造，SQLite 退回 ILIKE），
删除 `rebuild_video_search_vector()` 与那条不实的 docstring；基线里那条
`app/services/search_service.py:attr-defined` 也一并删掉——错误消失后它只是条死条目（CI 的
`comm` 只查新增，不查消失，留着不会被谁发现）。

**Future Prevention**:
- 基线只承诺「不再新增」。**碰 ORM 属性、列名、跨模块调用签名的 baselined 条目，一律先当作未验证
  的运行时风险**，用一次真实调用（curl / 端点级测试）确认后再信任，而不是读成「已接受」。
- 静态检查已经在同一行给出报错时，「它在基线里」不是可以收场的理由——那是把编译期信号丢进黑洞。

## 2. 高召回 LLM 审查：critical/high 档约三分之一不成立

**Problem**: 附录 B 的全仓扫描（deepseek-v4.1-flash，235 个文件）产出 **1308 条** finding。逐条对
代码核对后，153 条 critical/high 里 **53 条成立、75 条降级、24 条证伪**——高严重度档近三分之一误报。
但同一次运行也抓到了更早那轮「精准优先」审查漏掉的真实故障（`/videos/search` 的 500），所以这类
扫描值得跑，只是不能信未经验证的输出。

**Cause**: 高召回按设计牺牲精度，加上模型看不到仓库外的事实（nginx 上限、部署形态）与调用方，也读
不出「这段代码本意如此」。复现出的误报类高度集中：
- **零调用方的代码**：死代码不是缺陷。建议「修」一段没有任何调用方、也没有任何端点能到达的路径，
  等于修一个不存在的系统。
- **`await` 一个实现了 `__await__` 的对象**：redis-py asyncio 客户端的返回值可以被 await，报告读成
  「await 一个非协程」。
- **docstring 明说这是有意行为**：意图与实现一致时，报告只是把设计重新描述了一遍。

**Solution**: 每条 critical/high 回到代码求证一次——能用 curl 或端点测试复现的按真实严重性定级，
否则降级或驳回；结论与证据留在审计报告里（逐条核实证据、被证伪的论证、未验证清单），附录 B 这一轮
的产出与 128 项修复记在 `CHANGELOG.md`。

**Future Prevention**（三条筛查问题，按序问，任一条命中即驳回或大幅降级）:
1. **这条路径可达吗？**——有任何调用方或端点能走到被报的那行代码吗？
2. **有调用方会传这个值吗？**——报告描述的输入，在实际调用点构造得出来吗？
3. **docstring 说的是「这就是有意行为」吗？**——实现与文档一致时，报告报的是设计，不是缺陷。

三条都过之后仍成立的，才值得花时间改代码。**medium/low 从未逐条验证**（674 + 481 条），引用它们时
必须标注「未核实」。
