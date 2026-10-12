---
title: 审查改动时的「问谁」清单
tags: [workflow, review, agent]
status: active
confidence: verified
related_code: []
related: [knowledge/wiki/guides/code-review-principles.md, knowledge/wiki/problems/review-fix-failure-modes.md, knowledge/wiki/problems/audit-verification-failure-modes.md, knowledge/wiki/problems/silent-composition-failures.md]
created: 2026-10-12
updated: 2026-10-12
---

# 审查改动时的「问谁」清单

[code-review-principles](code-review-principles.md) 讲**怎么问**（六个必问）；本篇讲**问谁** ——
同一个 diff 对不同的人意味着不同的损失，改的人要先说出「谁在依赖这条行为，他失去什么」。
两篇分工：先过六个必问，再拿本篇的人群与绊线逐条对号。

规则层重构 B 的 R5 落地（DEC-076 / ADR-0021），蒸馏自 kimi-code 的
`.agents/skills/review-pr/surfaces.md`（人群 / 触发线索 / 历史案例三节），按本仓的读者重写。

## ① 谁在依赖现有行为

同一个改动，下面每个人群各自会因为什么受损。改的人要能逐条说出「这次动到他了吗」。

| 人群 | 他们的依赖 | 动到他们时，证据必须是 |
|---|---|---|
| iOS Safari / 夸克用户 | 底栏与画框的几何：`dvh`、常规流底栏、贴顶跟随（INV-019~024） | 几何断言，不是「看起来还行」 |
| GPU worker 宿主 | 无 DB、无 OSS 凭证（INV-001）—— 这是整条 Head/GPU/Tail 拆分的存在理由 | 运行时守卫 + `TestGPUWorkerSecurity` |
| 管理员 | 视频处理只有 admin / catalog 一个触发口（INV-003） | 状态变更路由的 admin 鉴权审计 |
| 内测期全免费用户 | 登录即可看；Pro 入口已退役（`/upgrade`、`/pricing`、`/redeem`、`/checkout`） | 不动退役页语义，不复活付费墙 |
| 老客户端 / 旧会话 | 410 兼容壳、旧会话数据、dormant 的 `plan` / `RedeemCode` 列与表 | 先问「旧数据还读得出来吗」 |
| 本地 e2e | `backend/media/*.mp4` 是 7 字节占位，需要真播放的用例**整条 skip** | 别把 skip 读成绿 |
| CI 的 SQLite 替身 | 静默忽略 `with_for_update` / `skip_locked`；行锁语义只有 `integration` 用例真验 | 碰行锁就跑 `test_celery_tasks_pg.py` |

## ② diff 碰到就必须列行为变化

绊线清单。碰到其中任何一项，commit message 与工单里必须写明「消费者是谁、旧客户端怎么继续工作」。

- **跨 owner 契约文件**（`.agent/owners.md` 列了 4 个）：`backend/app/schemas/video.py`、
  `backend/app/core/config.py`、`backend/app/api/dependencies.py`、
  `frontend/src/lib/api.ts`（+ `createApiClient.ts`）
- **认知资产**：机器认知卷与治理状态；对象认知 skill 的双宿主副本也要一起核对
- **部署面**：`backend/.env.example`、`docker-compose*.yml`、`nginx*.conf`、`promtail.yml`
- **规则路由**：根 `AGENTS.md` 的问题路由表与 `.agent/README.md` 的分层缝 —— 路由变了会改变
  后续 agent 读取什么、调用哪个 skill
- **强制面**：`.agent/invariants.md` 的 25 条 INV —— 每条自带 `Enforced by`，改行为前先看它是
  机器强制还是仅评审

## ③ 历史案例：`wiki/problems/` 九篇

等级按三步判据给：**数据丢失 / 安全边界放宽 / 老数据不可读 → 最重；有退路降一档；静默忽略用户
输入升一档**。「当时漏了什么」才是可复用的部分 —— 不是「这个 bug 存在过」，而是「我们当时靠什么
以为它是安全的」。

| 类型 | 案例 | 当时漏了什么 | 事后等级 |
|---|---|---|---|
| 组合型静默失效 | [silent-composition-failures](../problems/silent-composition-failures.md)：计数驱动的状态跃迁把错词挤出所有队列；逐题 POST 撞端点限流丢复习进度 | 每层局部规则各自成立、各有测试，**没有人在测组合**；设计意图与组合行为相反 | 最重（丢进度） |
| 并发与锁 | [shared-row-locks-and-nested-commits](../problems/shared-row-locks-and-nested-commits.md)：写者不共用锁 / `with_for_update` 在 SQLite 上只警告 / 临界区内 `commit` 提前放锁 | 把「加了锁」读成「不会撞」；锁的正确性取决于谁和谁共用它 | 最重（静默丢写） |
| 测试基准 | [local-date-basis-test-flake](../problems/local-date-basis-test-flake.md)：测试用宿主机「昨天」、服务端回退 UTC「今天」 | 只在 00:00–08:00（北京）失败；「本地绿」被当成绿 | 中（有退路） |
| 错误与清理路径 | [error-path-blindspots](../problems/error-path-blindspots.md)：回显非有限浮点 / fail-open 的洞 / 清理跑两次 | 测试覆盖最少的路径失败后果最重；正常流量下都不报错 | 高（4xx 变 500、静默丢消息） |
| 缓存与门控 | [cache-invalidation-and-media-gate-blindspots](../problems/cache-invalidation-and-media-gate-blindspots.md)：fail-open 吞掉失效异常；门控靠文件名正则 | 假 Redis 缺 `scan_iter`，`except Exception` 把 `AttributeError` 吞了；只有命名合规的文件才被保护 | 最重（下架内容仍可见） |
| 审计验证 | [audit-verification-failure-modes](../problems/audit-verification-failure-modes.md)：静态基线被读成「已接受的债」；LLM 高召回审查输出被当结论 | 「检查过了」被读成「检查过了没问题」；基线不是「已验无害」 | 高（真故障存活） |
| 审查修复 | [review-fix-failure-modes](../problems/review-fix-failure-modes.md)：SDK 迁移只改代码不改依赖清单 / SQLite BigInteger PK / 死依赖误判 / 外部 AI 审查论证不可信 | 惰性 import 把缺包推迟到首次调用；CI 因 stub 而绿 | 高（生产 502） |
| 部署链路 | [deploy-failure-modes](../problems/deploy-failure-modes.md)：三容器并发迁移 / backend 缺席致 nginx 崩溃循环并连带停 db / 长命令被 SSH 读超时截断 | 没有任何测试覆盖，只在「真的部署一次」时暴露 | 最重（整站不可用） |
| 诊断（非缺陷） | [asr-annotation-quality-diagnosis](../problems/asr-annotation-quality-diagnosis.md)：good→best、I→abiding 等误报 | 用户报的是**已修复版本**的现象；结论是代码已正确、无脏数据 | 低（无残留） |

## 回填：让这张清单活着

一次**回归复盘**之后，按第三节的格式回填「类型 / 案例 / 当时漏了什么 / 事后等级」。一次事故如果
体现不出新的人群或新的绊线，就不要动这三节 —— 清单的价值在于每条都有人真的依赖，不在于条数。
回填动作写在 `.agent/README.md` 的收尾纪律里（避免为此再动一次 `AGENTS.md`）。
