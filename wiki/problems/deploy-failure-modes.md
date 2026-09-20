---
title: 部署链路的三个失效模式（并发迁移 / nginx upstream 崩溃循环 / SSH 读超时截断）
tags: [infrastructure, database, bug, anti-pattern]
status: active
confidence: verified
related_code: [docker-compose]
related: [docs/operations/RUNBOOK.md]
created: 2026-09-20
updated: 2026-09-20
---

# 部署链路的三个失效模式

三个都在 2026-09-20 内测上线（seeword.top 首次切换新版本）时真实发生，且没有任何测试覆盖它们 ——
只在「真的部署一次」时暴露。标准流程与规避方式见 `docs/operations/RUNBOOK.md` §1.1。

## 1. 三个容器并发跑 `alembic upgrade head`

**Problem**: backend / celery / celery-beat 共用同一镜像入口，启动时各自跑 `alembic upgrade head`。
celery 容器日志里出现 `UniqueViolationError: duplicate key value violates unique constraint`——
失败的是同一个迁移里的回填 INSERT。

**Cause**: 迁移**幂等 ≠ 可并发**。`alembic upgrade head` 只在「已经在 head」时是空操作；要真正应用一个
新 revision 时，三个进程会同时读到旧版本号、同时开始跑同一个 revision 的 DDL/DML，胜负由时序决定。
更糟的是 `entrypoint.sh` 是 fail-open（迁移失败也继续启动，好让 `/health` 报 DB 问题），于是失败只留
一行 WARNING，容器照常起来，schema 停在半迁移状态而不自知。

**Solution**: 迁移归属权固定到单个容器：celery / celery-beat 设 `RUN_MIGRATIONS=0` 跳过迁移，并
`depends_on backend: service_healthy`，保证它们一定在迁移完成之后才启动（RUNBOOK §1.1 / §1.3）。

**Future Prevention**:
- 「幂等」不等于「可并发」。凡是共享资源的启动期写入（迁移、缓存预热、单例初始化），都要指定唯一
  执行者，而不是让每个进程各自重试到成功。
- fail-open 的启动步骤必须配一个**外部可见**的判据，否则失败会静默留在日志里。
- 核验看终态而不是「容器都 Up」：`alembic current` 在 head、`alembic heads` 无分叉、关键表/列存在、
  关键计数不为 0。

## 2. backend 缺席时 nginx 崩溃循环，并连带停掉 db / redis

**Problem**: `docker compose down` 停整栈时 nginx 反复重启，报
`[emerg] host not found in upstream "backend:8000"`。

**Cause**: nginx 在**加载配置时**解析 upstream 的主机名，backend 容器不存在就直接启动失败；
`restart: unless-stopped` 让它一直重试。而 `down` 又会把 db / redis 一起停掉——于是「只重建应用容器」
这种更安全的方式看起来更麻烦，容易被误选成全停。

**Solution**: 切换只重建应用容器，db / redis 保持运行：
`docker compose -f docker-compose.prod.yml up -d --remove-orphans`（RUNBOOK §1.1 步骤 4）。

**Future Prevention**:
- compose 的 `depends_on` + `condition` 只约束**启动顺序**，不解决「服务中途消失」；依赖上游的容器
  （这里是 nginx）对 `down` 是全链路单点。
- 记住「最省事的命令」（`down`）在这里恰好是最危险的。

## 3. 长命令在 SSH 前台跑会被读超时截断

**Problem**: 一次 `up -d` 只起了一半容器就返回，栈停在半启动状态——既不能幂等回滚，也不该直接重跑。

**Cause**: `docker load` 1.9GB 镜像 + 健康检查的网络往返，总时长超过调用方的读超时。命令被中断在
中间状态，但 docker 侧的动作已经部分提交。

**Solution**: 切换脚本 `nohup` 后台执行 + 轮询日志文件，以日志里的结束标记判断完成，而不是等命令返回
（RUNBOOK §1.1 步骤 4）。

**Future Prevention**:
- 远程执行的长步骤（镜像载入、迁移、批量导入）一律：写日志文件 → 后台跑 → 轮询判定。
- 判据要显式写在脚本里，不要靠「连接还活着」。
