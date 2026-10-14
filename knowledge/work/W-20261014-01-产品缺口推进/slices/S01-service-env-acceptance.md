---
slice: S01
title: 服务环境验收
status: blocked
issue: null
depends_on: []
evidence: null
---

# S01 — 服务环境验收

> 状态：blocked
> Issue：TBD
> Owner：待认领
> 依赖：Docker daemon、可用的 Postgres/Redis、真实媒体、可运行的后端/Celery 环境
> 上下文预算：T0 + 总纲 §1–§4 + 本切片 + 实施方案 §六

## 1. 这一段要解决什么

- 问题：当前只有定向 SQLite/fake Redis 测试，服务依赖验收全部未跑；「代码已落」不能替代
  「发布环境已验证」。
- 可观察结果：六类验收都有结果、命令或失败原因，并能追溯到一个证据位置。
- 不做什么：不在这个切片里补功能，不把环境不可用写成通过，不顺手改业务实现。

## 2. 边界与契约

- 涉及对象：三条迁移、`purge_deleted_accounts`、`build_user_export`、通知 Redis Pub/Sub、
  e2e 规格、完整后端门禁。
- 会改的契约：本切片原则上不改接口；如果验收暴露契约问题，另开切片，不在验收票据里修。
- 开工前必须确认：
  - Docker daemon / Postgres / Redis 可用；
  - 后端解释器可用，并明确使用哪个 Python env；
  - 媒体目录有真实可播放文件；
  - 测试是否使用 `ENV=testing` 和独立的测试数据库。

## 3. 执行路径

1. 在 Postgres 上按顺序执行三条迁移的 `upgrade` 与 `downgrade`，记录默认值、可空性和索引。
2. 跑注销到期清理：冷静期内不删；到期删个人数据/媒体；`behavior_events.user_id` 置 NULL；
   手机号在删除完成后释放；重复执行幂等。
3. 跑导出任务：生成 ZIP，核对 JSON + CSV + 头像 + 跟读录音原件；验证一次性短时 URL、
   成功/失败通知、失败重试、删除后清理。
4. 跑通知 Redis 广播：至少两个 worker，验证跨 worker 送达；停 Redis 验证落库成功且仅实时推送
   fail-open。
5. 跑真实媒体/后端 e2e：`mobile-wordcard-drawer`、`mobile-current-sentence-card`、首课流程、
   自动前进开关、注销倒计时横幅；需要时补真机复看。
6. 按发布清单跑完整后端 pytest 与 mypy；只把实际命令和结果写进证据。

## 4. 验收与证据

- 机械验收：迁移 upgrade/downgrade rc=0；清理与导出任务 rc=0；完整 pytest / mypy 结果明确。
- 行为验收：多 worker 通知可跨进程到达；导出包能被实际打开并含媒体；e2e 在真实媒体上通过。
- 证据位置：本文件 §5，附命令、环境说明、结果摘要和必要的截图/日志链接。
- 回退方式：迁移 downgrade；不把测试数据库当生产数据；清理任务失败时保留用户行并告警。

## 5. 结果记录

- 实际结果：待执行。
- 证据：待补。
- 决策：验收中出现的真实选择另行追加决策；不修改 DEC-081~089。
- 新发现 / 后续切片：待补。

## 6. 阻塞解除条件

1. Docker Desktop/daemon 已启动；
2. Postgres 与 Redis 容器健康；
3. 后端解释器与依赖可运行；
4. 真实媒体文件存在；
5. 当前 Issue 已被认领。
